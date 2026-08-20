// Environment-variable access — single source of truth.
// No API keys are hardcoded anywhere; everything comes from process.env.

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";

export function getConfig() {
  const openaiBaseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return {
    proxyApiKey: process.env.PROXY_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiBaseUrl,
  };
}