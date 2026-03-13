const SENSITIVE_KEYS = new Set([
	"authorization",
	"chatgpt-account-id",
	"chatgptaccountid",
	"session_id",
	"sessionid",
	"refresh_token",
	"access_token",
	"id_token",
	"token",
	"api_key",
	"apikey",
	"password",
	"secret",
	"cookie",
	"set-cookie",
	"email"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Object.prototype.toString.call(value) === "[object Object]";
}

export function maskSecret(value: string): string {
	if (!value) {
		return "[REDACTED]";
	}
	const visibleChars = 4;
	if (value.length <= visibleChars) {
		return "*".repeat(value.length);
	}
	return `${"*".repeat(Math.max(4, value.length - visibleChars))}${value.slice(-visibleChars)}`;
}

function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase();
	const compact = normalized.replace(/[^a-z0-9]/g, "");
	if (SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEYS.has(compact)) {
		return true;
	}
	return compact.includes("token") || compact.includes("secret") || compact.includes("password");
}

export function redactForLogging(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => redactForLogging(item));
	}

	if (isPlainObject(value)) {
		const redacted: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			redacted[key] = isSensitiveKey(key)
				? typeof val === "string"
					? maskSecret(val)
					: "[REDACTED]"
				: redactForLogging(val);
		}
		return redacted;
	}

	return value;
}

export function redactHeadersForLogging(headers: HeadersInit): Record<string, string> {
	const entries = new Headers(headers).entries();
	const normalized: Record<string, string> = {};
	for (const [key, value] of entries) {
		normalized[key] = value;
	}
	return redactForLogging(normalized) as Record<string, string>;
}
