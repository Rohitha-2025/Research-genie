// Pure TypeScript (unit-tested with vitest).
// Basic SSRF guard: the server fetches URLs on behalf of users, so refuse
// anything that points at localhost, private networks or cloud metadata.

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isIPv6 = host.includes(":");
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    PRIVATE_V4.some((re) => re.test(host)) ||
    (isIPv6 && (host === "::1" || host === "::" || /^(fc|fd|fe80)/.test(host) || host.startsWith("::ffff:"))) ||
    !host.includes("."); // bare hostnames like "metadata" or "intranet"

  if (blocked) throw new Error("That address isn't allowed. Please use a public website URL.");
  return url;
}
