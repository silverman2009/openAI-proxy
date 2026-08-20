// Vercel Serverless Function entry point.
// vercel.json rewrites /v1/* and /* to this function.

import { handleRequest } from "../lib/gateway.js";

export default async function handler(req, res) {
  await handleRequest(req, res);
}