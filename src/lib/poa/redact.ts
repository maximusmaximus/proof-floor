export function redact(input: string): string {
  return input
    .replace(/pk_[A-Za-z0-9_-]{4,}/g, "pk_••••")
    .replace(/([?&](?:key|token|api_key)=)[^&\s"']+/gi, "$1••••")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1••••")
    .replace(/https?:\/\/\S+/g, (url) => url.replace(/([?&](?:key|token|api_key)=)[^&\s"']+/gi, "$1••••"))
    .replace(/\s*\(Gemini[^)]*Grok Bot\)/gi, "");
}

export function scrub<T>(value: T): T {
  try {
    return JSON.parse(redact(JSON.stringify(value))) as T;
  } catch {
    return value;
  }
}
