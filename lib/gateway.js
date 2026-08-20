// Request pipeline: auth → config validation → OpenAI forward.
// Shared by the Vercel function (api/gateway.js) and the local server (server.js).

import { getConfig } from "./config.js";
import { checkAuth } from "./auth.js";
import { openAiError } from "./errors.js";
import { forward } from "./openai.js";

function sendJson(res, status, bodyString) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(bodyString);
}

export async function handleRequest(req, res) {
  const cfg = getConfig();

  // 1) Auth: client must present PROXY_API_KEY.
  const auth = checkAuth(req, cfg);
  if (!auth.ok) return sendJson(res, auth.status, auth.body);

  // 2) Config: provider key and base URL are required, server-side only.
  if (!cfg.openaiApiKey) {
    return sendJson(
      res,
      500,
      openAiError(
        "Gateway misconfigured: OPENAI_API_KEY env var is not set",
        "server_error",
      ),
    );
  }
  if (!/^https?:\/\//i.test(cfg.openaiBaseUrl)) {
    return sendJson(
      res,
      500,
      openAiError(
        "Gateway misconfigured: OPENAI_BASE_URL must be http(s)",
        "server_error",
      ),
    );
  }

  // 3) Forward (streaming included) and relay the provider's response.
  await forward(req, res, cfg);
}