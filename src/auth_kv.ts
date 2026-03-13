import { AuthDotJson, TokenData, RefreshRequest, RefreshResponse, Env } from "./types";
import { redactHeadersForLogging } from "./log_redaction";

type JwtClaims = {
	"https://api.openai.com/auth"?: {
		chatgpt_account_id?: string;
	};
} & Record<string, unknown>;

function urlBase64Decode(input: string): string {
	input = input.replace(/-/g, "+").replace(/_/g, "/");
	const pad = input.length % 4;
	if (pad) {
		input += new Array(5 - pad).join("=");
	}
	return atob(input);
}

function parseJwtClaims(token: string): JwtClaims | null {
	if (!token || token.split(".").length !== 3) {
		return null;
	}
	try {
		const payload = token.split(".");
		const decoded = urlBase64Decode(payload[1]);
		return JSON.parse(decoded);
	} catch (e) {
		console.error("Error parsing JWT claims:", e);
		return null;
	}
}

export async function getEffectiveChatgptAuth(
	env: Env
): Promise<{ accessToken: string | null; accountId: string | null }> {
	if (!env.OPENAI_CODEX_AUTH) {
		return { accessToken: null, accountId: null };
	}

	try {
		const auth: AuthDotJson = JSON.parse(env.OPENAI_CODEX_AUTH);
		const tokens = auth.tokens;

		if (!tokens) {
			return { accessToken: null, accountId: null };
		}

		let accountId: string | null = tokens.account_id || null;

		if (!accountId && tokens.id_token) {
			const claims = parseJwtClaims(tokens.id_token);
			if (claims && claims["https://api.openai.com/auth"]) {
				accountId = claims["https://api.openai.com/auth"].chatgpt_account_id || null;
			}
		}

		return { accessToken: tokens.access_token, accountId: accountId };
	} catch (e) {
		console.error("Error parsing OPENAI_CODEX_AUTH:", e);
		return { accessToken: null, accountId: null };
	}
}

export async function refreshAccessToken(env: Env): Promise<TokenData | null> {
	if (!env.OPENAI_CODEX_AUTH) {
		return null;
	}

	try {
		const auth: AuthDotJson = JSON.parse(env.OPENAI_CODEX_AUTH);
		const tokens = auth.tokens;

		if (!tokens || !tokens.refresh_token) {
			console.error("No refresh token available");
			return null;
		}

		const clientId = env.CHATGPT_LOCAL_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann";
		const tokenEndpoint = "https://auth.openai.com/oauth/token";
		const refreshRequest: RefreshRequest = {
			client_id: clientId,
			grant_type: "refresh_token",
			refresh_token: tokens.refresh_token,
			scope: "openid profile email"
		};

		const response = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(refreshRequest)
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unable to read error response");
			const correlationId =
				response.headers.get("x-request-id") || response.headers.get("cf-ray") || response.headers.get("traceparent");
			console.error("=== TOKEN REFRESH FAILURE ===");
			console.error("Status:", response.status, response.statusText);
			console.error("Endpoint:", tokenEndpoint);
			if (correlationId) {
				console.error("Correlation ID:", correlationId);
			}
			if (env.VERBOSE === "true") {
				console.error("Response Headers:", redactHeadersForLogging(response.headers));
				console.error("Error Body:", errorText);
			}
			console.error("=============================");
			return null;
		}

		const refreshResponse: RefreshResponse = await response.json();
		const updatedTokens: TokenData = {
			id_token: refreshResponse.id_token,
			access_token: refreshResponse.access_token || tokens.access_token,
			refresh_token: refreshResponse.refresh_token || tokens.refresh_token,
			account_id: tokens.account_id
		};

		if (env.KV) {
			await env.KV.put("auth_tokens", JSON.stringify(updatedTokens));
			await env.KV.put("auth_last_refresh", new Date().toISOString());
		}
		return updatedTokens;
	} catch (e) {
		console.error("=== TOKEN REFRESH EXCEPTION ===");
		console.error("Error:", e);
		if (e instanceof Error) {
			console.error("Error Message:", e.message);
			console.error("Error Stack:", e.stack);
		}
		console.error("===============================");
		return null;
	}
}

export async function getRefreshedAuth(env: Env): Promise<{ accessToken: string | null; accountId: string | null }> {
	const currentAuth = await getEffectiveChatgptAuth(env);

	if (!currentAuth.accessToken) {
		return currentAuth;
	}

	let needsRefresh = false;

	if (env.OPENAI_CODEX_AUTH) {
		try {
			const auth: AuthDotJson = JSON.parse(env.OPENAI_CODEX_AUTH);
			if (auth.last_refresh) {
				const lastRefresh = new Date(auth.last_refresh);
				const daysSinceRefresh = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24);
				if (daysSinceRefresh > 28) {
					needsRefresh = true;
				}
			}
		} catch (e) {
			console.error("Error checking refresh time:", e);
		}
	}

	if (env.KV && !needsRefresh) {
		try {
			const kvLastRefresh = await env.KV.get("auth_last_refresh");
			if (kvLastRefresh) {
				const kvRefreshTime = new Date(kvLastRefresh);
				if (kvRefreshTime.getTime() > Date.now() - 28 * 24 * 60 * 60 * 1000) {
					const kvTokens = await env.KV.get("auth_tokens", "json");
					if (kvTokens) {
						const tokens = kvTokens as TokenData;
						return {
							accessToken: tokens.access_token,
							accountId: tokens.account_id || null
						};
					}
				}
			}
		} catch (e) {
			console.error("Error checking KV for tokens:", e);
		}
	}

	if (needsRefresh) {
		const refreshedTokens = await refreshAccessToken(env);
		if (refreshedTokens) {
			return {
				accessToken: refreshedTokens.access_token,
				accountId: refreshedTokens.account_id || null
			};
		}
	}

	return currentAuth;
}
