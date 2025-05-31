// ==========================
// Types & Interfaces
// ==========================
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { mcpApp } from "./mcp";

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
export function rateLimit({ limit = 100, windowSec = 86400 } = {}) {
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
	const baseUrl = c.req.url.replace(/\/api\/shorten$/, "");

	const result = await toShortUrl(url, db, baseUrl);
	return c.json(result);
});

/**
 * 短縮コードから元のURLを取得する関数
 */
export const shortCodeToOriginalURL = async (
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

/**
 * URLを短縮URLに変換する関数
 */
export async function toShortUrl(
	url: string,
	db: D1Database,
	baseUrl: string,
): Promise<{ short_url: string }> {
	// 既存の短縮URLがあるか確認
	const existing = await db
		.prepare("SELECT short_code FROM urls WHERE original_url = ?")
		.bind(url)
		.first<Pick<URLTable, "short_code">>();
	if (existing?.short_code) {
		return { short_url: `${baseUrl}/${existing.short_code}` };
	}

	// ユニークな短縮コードを生成
	let shortCode: string;
	do {
		shortCode = randomCode();
	} while (
		await db
			.prepare("SELECT 1 FROM urls WHERE short_code = ?")
			.bind(shortCode)
			.first()
	);

	// 新しい短縮URLをDBに挿入
	await db
		.prepare("INSERT INTO urls (short_code, original_url) VALUES (?, ?)")
		.bind(shortCode, url)
		.run();

	return { short_url: `${baseUrl}/${shortCode}` };
}

app.route("/mcp", mcpApp);

export default app;
