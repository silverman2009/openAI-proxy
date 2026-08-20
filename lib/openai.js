// OpenAI forwarding: rebuilds headers with the provider key and relays the
// provider's response to the client — byte-for-byte, including SSE streams.
// No response JSON is parsed or buffered; provider errors (429, 401, …)
// pass through in their original OpenAI format.

import { Readable } from "node:stream";
import { openAiError } from "./errors.js";

// RFC 7230 hop-by-hop headers — never forwarded.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Client-auth and transport headers — replaced/regenerated, never forwarded.
const NEVER_FORWARD = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "host",
  "accept-encoding",
  "content-length",
]);

// Builds the upstream URL from the incoming path, preserving the query string.
// The destination host is always OPENAI_BASE_URL — never user-controlled.
export function buildUpstreamUrl(reqUrl, baseUrl) {
  const u = new URL(reqUrl, `${baseUrl}/`);
  let path = u.pathname;
  // Defensive: strip the rewrite destination if the platform exposes it.
  if (path.startsWith("/api/gateway")) {
    path = path.slice("/api/gateway".length) || "/";
  }
  // Normalize: /chat/completions -> /v1/chat/completions, so clients that
  // point their base URL at the origin (without /v1) still work.
  if (!path.startsWith("/v1")) path = `/v1${path}`;
  u.pathname = path;
  return u;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function forward(req, res, cfg) {
  const upstreamUrl = buildUpstreamUrl(req.url, cfg.openaiBaseUrl);

  // 1) Copy client headers, minus auth/hop-by-hop/transport.
  const fwd = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || NEVER_FORWARD.has(lk)) continue;
    fwd[k] = v;
  }
  // 2) Attach the real provider key — the client's key was never forwarded.
  fwd["authorization"] = `Bearer ${cfg.openaiApiKey}`;
  // 3) Relay raw bytes; undici would otherwise decompress for us.
  fwd["accept-encoding"] = "identity";

  // Request body: read fully, forward byte-for-byte (no JSON reconstruction).
  const hasBody = Boolean(
    req.headers["content-length"] || req.headers["transfer-encoding"],
  );
  const body = hasBody ? await readBody(req) : undefined;

  // Abort the upstream request when the client disconnects mid-stream.
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: fwd,
      body,
      redirect: "manual",
      signal: ac.signal,
    });
  } catch (err) {
    if (ac.signal.aborted) return; // client already gone
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    return res.end(
      openAiError(`Upstream request failed: ${err.message}`, "upstream_error"),
    );
  }

  // Relay status, headers, and body exactly as the provider sent them —
  // including OpenAI-format errors (rate limits, invalid key, …).
  res.statusCode = upstream.status;
  for (const [k, v] of upstream.headers) {
    const lk = k.toLowerCase();
    if (
      HOP_BY_HOP.has(lk) ||
      lk === "content-length" ||
      lk === "content-encoding"
    )
      continue;
    if (lk === "set-cookie") {
      const cookies =
        typeof upstream.headers.getSetCookie === "function"
          ? upstream.headers.getSetCookie()
          : [v];
      res.setHeader("set-cookie", cookies);
      continue;
    }
    res.setHeader(k, v);
  }

  if (upstream.body) {
    res.flushHeaders?.(); // push headers out before streaming starts (SSE)
    const stream = Readable.fromWeb(upstream.body);
    stream.on("error", () => {});
    stream.pipe(res); // backpressure-aware, no buffering
  } else {
    res.end();
  }
}