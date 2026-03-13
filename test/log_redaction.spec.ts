import { describe, it, expect } from "vitest";
import { maskSecret, redactForLogging, redactHeadersForLogging } from "../src/log_redaction";

describe("log redaction", () => {
	it("masks secret values while preserving last four characters", () => {
		expect(maskSecret("abcd")).toBe("****");
		expect(maskSecret("abcdefghijkl")).toBe("********ijkl");
	});

	it("redacts known sensitive key names recursively", () => {
		const payload = {
			authorization: "Bearer top-secret-token",
			chatgptAccountId: "acc_123456789",
			nested: {
				session_id: "session-secret",
				refresh_token: "refresh-secret"
			},
			safe: "value"
		};

		const redacted = redactForLogging(payload) as Record<string, unknown>;

		expect(redacted.authorization).toBe("*******************oken");
		expect(redacted.chatgptAccountId).toBe("*********6789");
		expect((redacted.nested as Record<string, unknown>).session_id).toBe("**********cret");
		expect((redacted.nested as Record<string, unknown>).refresh_token).toBe("**********cret");
		expect(redacted.safe).toBe("value");
	});

	it("redacts sensitive headers", () => {
		const headers = redactHeadersForLogging({
			Authorization: "Bearer abcdefghijkl",
			"chatgpt-account-id": "account-123456",
			"x-custom": "visible"
		});

		expect(headers.authorization).toBe("***************ijkl");
		expect(headers["chatgpt-account-id"]).toBe("**********3456");
		expect(headers["x-custom"]).toBe("visible");
	});
});
