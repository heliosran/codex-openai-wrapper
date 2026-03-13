import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("CORS configuration", () => {
	it("returns CORS headers and credentials for allowlisted origin preflight", async () => {
		const request = new IncomingRequest("http://example.com/v1/chat/completions", {
			method: "OPTIONS",
			headers: {
				Origin: "https://app.example.com",
				"Access-Control-Request-Method": "POST"
			}
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			request,
			{ ...env, ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com" },
			ctx
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST,GET,OPTIONS");
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type,Authorization");
	});

	it("does not return origin or credential headers for disallowed origin preflight", async () => {
		const request = new IncomingRequest("http://example.com/v1/chat/completions", {
			method: "OPTIONS",
			headers: {
				Origin: "https://evil.example.com",
				"Access-Control-Request-Method": "POST"
			}
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			request,
			{ ...env, ALLOWED_ORIGINS: "https://app.example.com" },
			ctx
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
	});

	it("returns origin and credentials for allowlisted origin on regular responses", async () => {
		const request = new IncomingRequest("http://example.com/health", {
			headers: {
				Origin: "https://app.example.com"
			}
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			request,
			{ ...env, ALLOWED_ORIGINS: "https://app.example.com" },
			ctx
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example.com");
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
	});

	it("omits credentials header when no origin is allowlisted", async () => {
		const request = new IncomingRequest("http://example.com/health", {
			headers: {
				Origin: "https://app.example.com"
			}
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { ...env, ALLOWED_ORIGINS: "" }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
		expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
	});
});
