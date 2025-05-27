import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.post("/api/shorten", async (c) => {
	return c.json({ message: "Not implemented yet" }, 501);
});

app.get(":short_url", async (c) => {
	// TODO: 実装
	return c.json({ message: "Not implemented yet" }, 501);
});

export default app;
