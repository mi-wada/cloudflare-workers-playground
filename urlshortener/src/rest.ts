/**
 * REST API handlers and request/response types for the URL shortener service.
 * @module rest
 */
import { Hono } from "hono";
import {
	rateLimit,
	shortCodeToOriginalURL,
	toShortUrl,
	isValidUrl,
} from "./domain";

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
 * Parses and validates the request body for the shorten API endpoint.
 * @param c - Hono context
 * @returns The parsed URL or an error response
 */
async function parseShortenRequestBody(
	c: import("hono").Context,
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

/**
 * Hono app instance for REST API endpoints.
 */
const restApp = new Hono<{ Bindings: CloudflareBindings }>();

restApp.post("/api/shorten", rateLimit(), async (c) => {
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
