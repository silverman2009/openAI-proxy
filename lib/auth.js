// Authentication middleware: validates the client's key (PROXY_API_KEY)
// before any request is forwarded. The provider key never appears here —
// it is attached later in lib/openai.js, server-side only.

import { openAiError } from "./errors.js";

export function checkAuth(req, cfg) {
  if (!cfg.proxyApiKey) {
    return {
      ok: false,
      status: 500,
      body: openAiError(
        "Gateway misconfigured: PROXY_API_KEY env var is not set",
        "server_error",
      ),
    };
  }

  // Accepted forms: `Authorization: Bearer <key>`, `x-api-key: <key>`, `api-key: <key>`
  const provided =
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "") ||
    req.headers["x-api-key"] ||
    req.headers["api-key"];

  if (!provided || provided !== cfg.proxyApiKey) {
    return {
      ok: false,
      status: 401,
      body: openAiError(
        "Invalid API key",
        "invalid_request_error",
        "invalid_api_key",
      ),
    };
  }
  return { ok: true };
}