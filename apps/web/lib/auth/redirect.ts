/**
 * Edge-compatible safe-path helper for `next` redirect targets.
 *
 * A valid `next` must be a same-origin relative path beginning with a single
 * `/`. Anything that could leave the site (protocol-relative URLs, backslashes,
 * schemes, userinfo, or malformed encoding) is rejected and the fallback is
 * returned.
 */
export function safeRedirectPath(
  input: string | null | undefined,
  fallback = "/app",
): string {
  if (!input) return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//")) return fallback;
  if (input.includes("\\")) return fallback;
  if (input.includes("://")) return fallback;
  if (input.includes("@")) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return fallback;
  }

  if (decoded.startsWith("//")) return fallback;
  if (decoded.includes("\\")) return fallback;
  if (decoded.includes("://")) return fallback;
  if (decoded.includes("@")) return fallback;

  return input;
}
