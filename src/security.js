function validateSelfHostedUrl(rawUrl, options = {}) {
  if (!rawUrl) throw new Error("baseUrl is required");
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("baseUrl must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("baseUrl must use http or https");
  const host = parsed.hostname.toLowerCase();
  const blockedHosts = new Set([...(options.blockedHosts || []), "api.mem0.ai"]);
  if (blockedHosts.has(host) || host.endsWith(".mem0.ai")) throw new Error("Cloud Mem0 endpoints are blocked; use a self-hosted OSS endpoint.");
  const allowedLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const allowedPrivate = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  const allowedDomains = (options.allowedDomains || [".local", ".internal"]).some((suffix) => host.endsWith(suffix));
  if (!options.allowPublicHosts && !allowedLocal && !allowedPrivate && !allowedDomains) {
    throw new Error("baseUrl must be localhost, private network, or an allowed self-hosted domain.");
  }
  return parsed;
}

module.exports = { validateSelfHostedUrl };
