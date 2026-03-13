import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { openaiAuthMiddleware } from "../src/middleware/openaiAuthMiddleware";
import type { Env } from "../src/types";

const buildApp = () => {
	const app = new Hono<{ Bindings: Env }>();
	app.use("*", openaiAuthMiddleware());
	app.get("/", (c) => c.json({ ok: true }, 200));
	return app;
};

describe("openaiAuthMiddleware", () => {
	it("returns 401 when Authorization header is missing", async () => {
		const app = buildApp();
		const response = await app.request("http://localhost/", {}, { OPENAI_API_KEY: "sk-configured" } as Env);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: { message: "Missing Authorization header" } });
	});

	it("returns 401 for invalid bearer format", async () => {
		const app = buildApp();
		const response = await app.request(
			"http://localhost/",
			{ headers: { Authorization: "Token sk-configured" } },
			{ OPENAI_API_KEY: "sk-configured" } as Env
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { message: "Invalid Authorization header format. Expected: Bearer <token>" }
		});
	});

	it("returns 500 when OPENAI_API_KEY is missing", async () => {
		const app = buildApp();
		const response = await app.request(
			"http://localhost/",
			{ headers: { Authorization: "Bearer sk-any" } },
			{} as Env
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: { message: "Server configuration error" } });
	});

	it("allows the request to proceed with a valid key", async () => {
		const app = buildApp();
		const response = await app.request(
			"http://localhost/",
			{ headers: { Authorization: "Bearer sk-valid" } },
			{ OPENAI_API_KEY: "sk-valid" } as Env
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});
});
