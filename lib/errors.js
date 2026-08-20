// OpenAI-format error payloads, so clients (and Oh My Pi) can parse
// gateway errors the same way they parse provider errors.

export function openAiError(message, type, code = null) {
  return JSON.stringify({
    error: { message, type, param: null, code },
  });
}