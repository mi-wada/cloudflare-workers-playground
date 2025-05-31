import { Hono } from "hono";
import {
	rateLimit,
	shortCodeToOriginalURL,
	toShortUrl,
	parseShortenRequestBody,
} from "./index";

export const restApp = new Hono<{ Bindings: CloudflareBindings }>();

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
