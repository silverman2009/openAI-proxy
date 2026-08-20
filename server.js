// Local dev server — runs the exact same pipeline as the Vercel function.
//
//   PROXY_API_KEY=... OPENAI_API_KEY=... node server.js
//   PROXY_API_KEY=... OPENAI_API_KEY=... OPENAI_BASE_URL=http://127.0.0.1:9999 node server.js

import http from "node:http";
import { handleRequest } from "./lib/gateway.js";

const PORT = Number(process.env.PORT || 8787);



http
  .createServer((req, res) => handleRequest(req, res))
  .listen(PORT, () => {
    console.log(`OpenAI gateway listening on http://localhost:${PORT}`);
  });
