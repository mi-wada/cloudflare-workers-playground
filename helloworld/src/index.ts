import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/message", (c) => {
  const name = c.req.query("name") || undefined;
  const message = generateGreeting(name);
  return c.text(message);
});

/**
 * Generates a greeting message for the provided name.
 *
 * @param name - The name of the person to greet. If not provided, "Anonymous" will be used.
 * @returns A greeting message string.
 */
const generateGreeting = (name: string = "Anonymous"): string => {
  return `Hello, ${name}!`;
};

export default app;
