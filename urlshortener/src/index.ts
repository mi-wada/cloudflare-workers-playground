import { Hono } from "hono";
import { mcpApp } from "./mcp";
import { restApp } from "./rest";

/**
 * Main entrypoint for the URL shortener worker.
 * Sets up routing for both REST and MCP APIs.
 */
const app = new Hono<{ Bindings: CloudflareBindings }>();
app.route("/mcp", mcpApp);
app.route("/", restApp);

export default app;
