/**
 * REST API handlers and request/response types for the URL shortener service.
 * @module rest
 */
import { Hono } from "hono";
import {
	isValidUrl,
	rateLimit,
	shortCodeToOriginalURL,
	toShortUrl,
} from "./core";

/**
 * Error codes for API responses.
 */
type ErrorCode =
	| "JSON_INVALID"
	| "URL_REQUIRED"
	| "URL_TOO_LONG"
	| "URL_INVALID_FORMAT";

/**
 * Error response object returned by the API.
 */
type ErrorResponse = {
	message: string;
	code: ErrorCode;
};

/**
 * Request body for the shorten API endpoint.
 */
type ShortenRequestBody = {
	url: string;
};

/**
 * Predefined error responses for each error code.
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

/**
 * Hono app instance for REST API endpoints.
 */
const restApp = new Hono<{ Bindings: CloudflareBindings }>();

restApp.post("/api/shorten", rateLimit(), async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ message: "Invalid JSON", code: "JSON_INVALID" }, 400);
	}
	if (
		typeof body !== "object" ||
		body === null ||
		!("url" in body) ||
		typeof (body as { url?: unknown }).url !== "string" ||
		((body as { url?: unknown }).url as string).length === 0
	) {
		return c.json({ message: "'url' is required", code: "URL_REQUIRED" }, 400);
	}
	const url = (body as { url: string }).url;
	if (url.length > 4096) {
		return c.json(
			{ message: "URL length must be <= 4096", code: "URL_TOO_LONG" },
			400,
		);
	}
	if (!isValidUrl(url)) {
		return c.json(
			{ message: "Invalid URL format", code: "URL_INVALID_FORMAT" },
			400,
		);
	}
	const db = c.env.DB;
	const baseUrl = c.req.url.replace(/\/api\/shorten$/, "");
	const result = await toShortUrl(url, db, baseUrl);
	return c.json(result);
});

restApp.get(":short_code", async (c) => {
	const shortCode = c.req.param("short_code");
	const db = c.env.DB;
	const originalUrl = await shortCodeToOriginalURL(shortCode, db);
	if (originalUrl) {
		return c.redirect(originalUrl, 308);
	}
	return c.json({ message: "Short URL not found" }, 404);
});

export { restApp };
