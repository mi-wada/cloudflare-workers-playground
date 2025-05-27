import { Hono } from "hono";

export type ErrorCode =
	| "JSON_INVALID"
	| "URL_REQUIRED"
	| "URL_TOO_LONG"
	| "URL_INVALID_FORMAT";

export type ErrorResponse = {
	message: string;
	code: ErrorCode;
};

export type ShortenRequestBody = {
	url: string;
};

export type URLTable = {
	short_code: string;
	original_url: string;
	created_at: string;
};

// Error response constants
const errorResponses: Record<ErrorCode, ErrorResponse> = {
	JSON_INVALID: { message: "Invalid JSON", code: "JSON_INVALID" },
	URL_REQUIRED: { message: "'url' is required", code: "URL_REQUIRED" },
	URL_TOO_LONG: { message: "URL length must be <= 4096", code: "URL_TOO_LONG" },
	URL_INVALID_FORMAT: {
		message: "Invalid URL format",
		code: "URL_INVALID_FORMAT",
	},
};

// Generate a random short code
export function randomCode(length = 6): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return Array.from(
		{ length },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("");
}

// Generate base URL from request URL
function getBaseUrl(reqUrl: string): string {
	return reqUrl.split("/api/shorten")[0].replace(/\/$/, "");
}

// Rate limit middleware
import type { Context, Next } from "hono";
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

// Set rate limit headers
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

// Hono application
const app = new Hono<{ Bindings: CloudflareBindings }>();

app.post("/api/shorten", rateLimit(), async (c) => {
	// Parse and validate request body
	let body: ShortenRequestBody;
	try {
		body = await c.req.json();
	} catch {
		return c.json(errorResponses.JSON_INVALID, 400);
	}
	const url = body.url;
	if (typeof url !== "string" || url.length === 0) {
		return c.json(errorResponses.URL_REQUIRED, 400);
	}
	if (url.length > 4096) {
		return c.json(errorResponses.URL_TOO_LONG, 400);
	}
	try {
		new URL(url);
	} catch {
		return c.json(errorResponses.URL_INVALID_FORMAT, 400);
	}

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

app.get(":short_code", async (c) => {
	const shortCode = c.req.param("short_code");
	const db = c.env.DB;
	const result = await db
		.prepare("SELECT original_url FROM urls WHERE short_code = ?")
		.bind(shortCode)
		.first<Pick<URLTable, "original_url">>();
	if (result?.original_url) {
		return c.redirect(result.original_url, 308);
	}
	return c.json({ message: "Short URL not found" }, 404);
});

export default app;
