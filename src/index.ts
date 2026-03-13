import { Hono } from "hono";
import openai from "./routes/openai"; // Import the openai router
import ollama from "./routes/ollama"; // Import the ollama router
import type { Env } from "./types";

const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];
const DEFAULT_ALLOWED_METHODS = ["POST", "GET", "OPTIONS"];

const parseAllowedOrigins = (allowedOrigins?: string): string[] => {
	if (!allowedOrigins) {
		return [];
	}

	return allowedOrigins
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
};

const resolveAllowedOrigin = (origin: string, allowedOrigins: string[]): string | null => {
	if (!origin || allowedOrigins.length === 0) {
		return null;
	}

	return allowedOrigins.includes(origin) ? origin : null;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
	const origin = c.req.header("origin") || "";
	const allowedOrigin = resolveAllowedOrigin(origin, parseAllowedOrigins(c.env.ALLOWED_ORIGINS));

	if (allowedOrigin) {
		c.header("Access-Control-Allow-Origin", allowedOrigin);
		c.header("Vary", "Origin");
	}

	if (c.req.method === "OPTIONS") {
		if (allowedOrigin) {
			c.header("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS.join(","));
			c.header("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS.join(","));
			c.header("Access-Control-Max-Age", "600");
			c.header("Access-Control-Allow-Credentials", "true");
		}
		return c.body(null, 204);
	}

	await next();

	if (allowedOrigin) {
		c.header("Access-Control-Allow-Credentials", "true");
	}
});

app.get("/", (c) => c.json({ status: "ok" }));

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/", openai); // Mount the OpenAI routes under /v1
app.route("/api", ollama); // Mount the Ollama routes under /api

export default app;
