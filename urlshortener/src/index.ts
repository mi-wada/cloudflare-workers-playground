import { Hono } from "hono";

// 型定義
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

// エラーレスポンス定数
const errorResponses: Record<ErrorCode, ErrorResponse> = {
	JSON_INVALID: { message: "Invalid JSON", code: "JSON_INVALID" },
	URL_REQUIRED: { message: "'url' is required", code: "URL_REQUIRED" },
	URL_TOO_LONG: { message: "URL length must be <= 4096", code: "URL_TOO_LONG" },
	URL_INVALID_FORMAT: {
		message: "Invalid URL format",
		code: "URL_INVALID_FORMAT",
	},
};

// ランダムな短縮コード生成
export function randomCode(len = 6): string {
	const chars =
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	return Array.from(
		{ length: len },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("");
}

// ベースURL生成
function getBaseUrl(reqUrl: string): string {
	return reqUrl.split("/api/shorten")[0].replace(/\/$/, "");
}

// Honoアプリケーション
const app = new Hono<{ Bindings: CloudflareBindings }>();

app.post("/api/shorten", async (c) => {
	// 1. Parse and validate request body
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

	// 2. Check if URL already exists
	const db = c.env.DB;
	const selectRes = await db
		.prepare("SELECT short_code FROM urls WHERE original_url = ?")
		.bind(url)
		.first<Pick<URLTable, "short_code">>();
	if (selectRes?.short_code) {
		const shortUrl = `${getBaseUrl(c.req.url)}/${selectRes.short_code}`;
		return c.json({ short_url: shortUrl });
	}

	// 3. Generate unique short code
	let shortCode: string;
	do {
		shortCode = randomCode();
	} while (
		await db
			.prepare("SELECT 1 FROM urls WHERE short_code = ?")
			.bind(shortCode)
			.first()
	);

	// 4. Persist to DB
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
