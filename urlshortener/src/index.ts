// ==========================
// Types & Interfaces
// ==========================
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { z } from "zod";

/**
 * Error codes for API responses
 */
export type ErrorCode =
	| "JSON_INVALID"
	| "URL_REQUIRED"
	| "URL_TOO_LONG"
	| "URL_INVALID_FORMAT";

/**
 * Error response structure
 */
export type ErrorResponse = {
	message: string;
	code: ErrorCode;
};

/**
 * Request body for URL shortening
 */
export type ShortenRequestBody = {
	url: string;
};

/**
 * Table structure for URLs
 */
export type URLTable = {
	short_code: string;
	original_url: string;
	created_at: string;
};

// ==========================
// Constants
// ==========================

/**
 * Error response templates
 */
const errorResponses: Record<ErrorCode, ErrorResponse> = {
	JSON_INVALID: { message: "Invalid JSON", code: "JSON_INVALID" },
	URL_REQUIRED: { message: "'url' is required", code: "URL_REQUIRED" },
	URL_TOO_LONG: { message: "URL length must be <= 4096", code: "URL_TOO_LONG" },
	URL_INVALID_FORMAT: {
		message: "Invalid URL format",
		code: "URL_INVALID_FORMAT",
	},
};

// ==========================
// Utility Functions
// ==========================

/**
 * Generate a random short code
 */
export function randomCode(length = 6): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return Array.from(
		{ length },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("");
}

/**
 * Get the base URL from a request URL
 */
function getBaseUrl(reqUrl: string): string {
	return reqUrl.split("/api/shorten")[0].replace(/\/$/, "");
}

/**
 * Validate a URL string
 */
function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Parse and validate the request body for URL shortening
 */
async function parseShortenRequestBody(
	c: Context,
): Promise<{ url: string } | ErrorResponse> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return errorResponses.JSON_INVALID;
	}
	if (
		typeof body !== "object" ||
		body === null ||
		!("url" in body) ||
		typeof (body as { url?: unknown }).url !== "string" ||
		((body as { url?: unknown }).url as string).length === 0
	) {
		return errorResponses.URL_REQUIRED;
	}
	const url = (body as { url: string }).url;
	if (url.length > 4096) {
		return errorResponses.URL_TOO_LONG;
	}
	if (!isValidUrl(url)) {
		return errorResponses.URL_INVALID_FORMAT;
	}
	return { url };
}

// ==========================
// Middleware
// ==========================

/**
 * Rate limit middleware (per IP, per day)
 */
function rateLimit({ limit = 10, windowSec = 86400 } = {}) {
	return async (c: Context<{ Bindings: CloudflareBindings }>, next: Next) => {
		const ip =
			c.req.header("CF-Connecting-IP") ||
			c.req.header("x-forwarded-for") ||
			"unknown";
		const key = `rl:${ip}`;
		const kv = c.env.KV;
		const now = Math.floor(Date.now() / 1000);

		let data = (await kv.get(key, { type: "json" })) as {
			count: number;
			reset: number;
		} | null;
		if (!data || now > data.reset) {
			data = { count: 0, reset: now + windowSec };
		}
		if (data.count >= limit) {
			setRateLimitHeaders(c, limit, 0, data.reset);
			return c.json({ message: "Rate limit exceeded" }, 429);
		}
		data.count++;
		await kv.put(key, JSON.stringify(data), { expiration: data.reset });
		setRateLimitHeaders(c, limit, limit - data.count, data.reset);
		return next();
	};
}

/**
 * Set rate limit headers on the response
 */
function setRateLimitHeaders(
	c: Context<{ Bindings: CloudflareBindings }>,
	limit: number,
	remaining: number,
	reset: number,
) {
	c.header("X-RateLimit-Limit", String(limit));
	c.header("X-RateLimit-Remaining", String(remaining));
	c.header("X-RateLimit-Reset", String(reset));
}

// ==========================
// Application Setup & Routes
// ==========================

const app = new Hono<{ Bindings: CloudflareBindings }>();

/**
 * POST /api/shorten - Create a short URL
 */
app.post("/api/shorten", rateLimit(), async (c) => {
	const parsed = await parseShortenRequestBody(c);
	if ("code" in parsed) {
		return c.json(parsed, 400);
	}
	const url = parsed.url;
	const db = c.env.DB;

	// Check if URL already exists
	const existing = await db
		.prepare("SELECT short_code FROM urls WHERE original_url = ?")
		.bind(url)
		.first<Pick<URLTable, "short_code">>();
	if (existing?.short_code) {
		const shortUrl = `${getBaseUrl(c.req.url)}/${existing.short_code}`;
		return c.json({ short_url: shortUrl });
	}

	// Generate unique short code
	let shortCode: string;
	do {
		shortCode = randomCode();
	} while (
		await db
			.prepare("SELECT 1 FROM urls WHERE short_code = ?")
			.bind(shortCode)
			.first()
	);

	// Insert new short URL into DB
	await db
		.prepare("INSERT INTO urls (short_code, original_url) VALUES (?, ?)")
		.bind(shortCode, url)
		.run();

	const shortUrl = `${getBaseUrl(c.req.url)}/${shortCode}`;
	return c.json({ short_url: shortUrl });
});

/**
 * 短縮コードから元のURLを取得する関数
 */
const shortCodeToOriginalURL = async (
	shortCode: string,
	db: D1Database,
): Promise<string | undefined> => {
	const result = await db
		.prepare("SELECT original_url FROM urls WHERE short_code = ?")
		.bind(shortCode)
		.first<Pick<URLTable, "original_url">>();
	return result?.original_url;
};

/**
 * GET /:short_code - Redirect to the original URL
 */
app.get(":short_code", async (c) => {
	const shortCode = c.req.param("short_code");
	const db = c.env.DB;
	const originalUrl = await shortCodeToOriginalURL(shortCode, db);
	if (originalUrl) {
		return c.redirect(originalUrl, 308);
	}
	return c.json({ message: "Short URL not found" }, 404);
});

export const getMcpServer = async (
	c: Context<{ Bindings: CloudflareBindings }>,
) => {
	const server = new McpServer({
		name: "URL Shortener MCP Server",
		version: "0.0.1",
	});
	server.tool(
		"expand_url",
		"Expand a short URL to its original form",
		{
			short_url: z.string().describe("The short URL to expand"),
		},
		async ({ short_url }) => {
			const db = c.env.DB;
			const urlObj = new URL(short_url);
			const shortCode = urlObj.pathname.replace(/^\/+/, "");
			const originalUrl = await shortCodeToOriginalURL(shortCode, db);
			if (originalUrl) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ original_url: originalUrl }),
						},
					],
				};
			}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ message: "Short URL not found" }),
					},
				],
			};
		},
	);
	return server;
};

app.post("/mcp", async (c) => {
	const { req, res } = toReqRes(c.req.raw);
	const mcpServer = await getMcpServer(c);
	const transport: StreamableHTTPServerTransport =
		new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
	await mcpServer.connect(transport);
	await transport.handleRequest(req, res, await c.req.json());
	res.on("close", () => {
		transport.close();
		mcpServer.close();
	});
	return toFetchResponse(res);
});

app.on(["GET", "DELETE"], "/mcp", (c) => {
	return c.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Method not allowed.",
			},
			id: null,
		},
		405,
	);
});

app.onError((e, c) => {
	console.error(e.message);
	return c.json(
		{
			jsonrpc: "2.0",
			error: {
				code: -32603,
				message: "Internal server error",
			},
			id: null,
		},
		500,
	);
});

export default app;
