/**
 * Provides the MCP (Model Context Protocol) API endpoints for the URL shortener service.
 * @module mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { Hono } from "hono";
import { z } from "zod";
import { rateLimit, shortCodeToOriginalURL, toShortUrl } from "./domain";

/**
 * Hono app instance for MCP endpoints.
 */
export const mcpApp = new Hono<{ Bindings: CloudflareBindings }>();

mcpApp.post("/", rateLimit(), async (c) => {
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
	server.tool(
		"shorten_url",
		"Shorten a long URL",
		{
			url: z.string().describe("The URL to shorten"),
		},
		async ({ url }) => {
			const db = c.env.DB;
			const baseUrl = c.req.url.replace(/\/mcp$/, "");
			const result = await toShortUrl(url, db, baseUrl);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result),
					},
				],
			};
		},
	);
	const { req, res } = toReqRes(c.req.raw);
	const transport: StreamableHTTPServerTransport =
		new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
	await server.connect(transport);
	await transport.handleRequest(req, res, await c.req.json());
	res.on("close", () => {
		transport.close();
		server.close();
	});
	return toFetchResponse(res);
});

mcpApp.on(["GET", "DELETE"], "/", (c) => {
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

mcpApp.onError((e, c) => {
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
