// ==========================
// Types & Interfaces
// ==========================
import type { Context, Next } from "hono";

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

// ==========================
// Constants
// ==========================

export const errorResponses: Record<ErrorCode, ErrorResponse> = {
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

export function randomCode(length = 6): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return Array.from(
		{ length },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("");
}

export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

export async function parseShortenRequestBody(
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

export async function toShortUrl(
	url: string,
	db: D1Database,
	baseUrl: string,
): Promise<{ short_url: string }> {
	const shortCode = randomCode();
	const createdAt = new Date().toISOString();
	await db
		.prepare(
			"INSERT INTO urls (short_code, original_url, created_at) VALUES (?, ?, ?)",
		)
		.bind(shortCode, url, createdAt)
		.run();
	return { short_url: `${baseUrl}/${shortCode}` };
}

// ==========================
// Middleware
// ==========================

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

export function setRateLimitHeaders(
	c: Context<{ Bindings: CloudflareBindings }>,
	limit: number,
	remaining: number,
	reset: number,
) {
	c.header("X-RateLimit-Limit", String(limit));
	c.header("X-RateLimit-Remaining", String(remaining));
	c.header("X-RateLimit-Reset", String(reset));
}
