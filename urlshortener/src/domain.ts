// ==========================
// Types & Interfaces
// ==========================
import type { Context, Next } from "hono";

/**
 * Table schema for storing short URLs.
 */
export type URLTable = {
	short_code: string;
	original_url: string;
	created_at: string;
};

/**
 * Generate a random alphanumeric code of the specified length.
 * @param length - Length of the code (default: 6)
 * @returns Random alphanumeric string
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
 * Check if a string is a valid URL.
 * @param url - The string to check
 * @returns True if valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Look up the original URL for a given short code in the database.
 * @param shortCode - The short code to look up
 * @param db - D1Database instance
 * @returns The original URL if found, otherwise undefined
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
 * Create a new short URL for the given original URL and store it in the database.
 * @param url - The original URL to shorten
 * @param db - D1Database instance
 * @param baseUrl - The base URL for the shortener
 * @returns An object containing the new short URL
 */
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

/**
 * Hono middleware for simple rate limiting by IP address.
 * @param options - Optional: limit (default 100), windowSec (default 86400)
 * @returns Middleware function
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
			c.header("X-RateLimit-Limit", String(limit));
			c.header("X-RateLimit-Remaining", String(0));
			c.header("X-RateLimit-Reset", String(data.reset));
			return c.json({ message: "Rate limit exceeded" }, 429);
		}
		data.count++;
		await kv.put(key, JSON.stringify(data), { expiration: data.reset });
		c.header("X-RateLimit-Limit", String(limit));
		c.header("X-RateLimit-Remaining", String(limit - data.count));
		c.header("X-RateLimit-Reset", String(data.reset));
		return next();
	};
}
