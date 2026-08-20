// Mock OpenAI-compatible upstream for local testing.
// Simulates chat completions (streaming + non-streaming), /v1/models, and a
// rate-limit error. Echoes what the gateway actually sent (auth key, path,
// headers) so you can verify the key swap and header hygiene.
//
//   Usage: node mock-openai.js   (listens on PORT or 9999)

import http from "node:http";

const PORT = Number(process.env.PORT || 9999);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload = {};
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {}

    console.log(
      `[mock] ${req.method} ${req.url} auth=${req.headers.authorization || "(none)"} ` +
        `accept-encoding=${req.headers["accept-encoding"]} host=${req.headers.host}`,
    );

    if (req.url.startsWith("/v1/models")) {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-test", object: "model", owned_by: "mock" }],
        }),
      );
    }

    if (payload.model === "rate-limit") {
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "30",
      });
      return res.end(
        JSON.stringify({
          error: {
            message: "Rate limit reached for mock-model",
            type: "rate_limit_error",
            param: null,
            code: "rate_limit_exceeded",
          },
        }),
      );
    }

    if (payload.stream) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const chunks = [
        {
          id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: "gpt-test",
          choices: [{ index: 0, delta: { role: "assistant", content: "Hel" }, finish_reason: null }],
        },
        {
          id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: "gpt-test",
          choices: [{ index: 0, delta: { content: "lo" }, finish_reason: null }],
        },
        {
          id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: "gpt-test",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        },
      ];
      // Chunks spaced 300 ms apart — proves the gateway streams without buffering
      // (a buffering gateway would deliver everything only at the end).
      chunks.forEach((c, i) =>
        setTimeout(() => res.write(`data: ${JSON.stringify(c)}\n\n`), (i + 1) * 300),
      );
      setTimeout(() => res.end("data: [DONE]\n\n"), chunks.length * 300 + 100);
      return;
    }

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: 0,
        model: payload.model || "gpt-test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "pong" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        echo: {
          path: req.url,
          method: req.method,
          auth: req.headers.authorization || null,
          host: req.headers.host || null,
          xApiKey: req.headers["x-api-key"] || null,
          acceptEncoding: req.headers["accept-encoding"] || null,
        },
      }),
    );
  });
});

server.listen(PORT, () =>
  console.log(`Mock OpenAI listening on http://localhost:${PORT}`),
);