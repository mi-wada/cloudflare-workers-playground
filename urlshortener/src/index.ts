import { Hono } from "hono";
import { mcpApp } from "./mcp";
import { restApp } from "./rest";

const app = new Hono<{ Bindings: CloudflareBindings }>();
app.route("/mcp", mcpApp);
app.route("/", restApp);

export default app;
