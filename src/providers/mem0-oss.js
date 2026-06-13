const { validateSelfHostedUrl } = require("../security");

class Mem0OssProvider {
  constructor({
    baseUrl,
    apiKey = "",
    timeoutMs = 5000,
    paths = {},
    allowPublicHosts = false,
    allowedDomains = [".local", ".internal"]
  } = {}) {
    this.id = "mem0_oss_self_hosted";
    this.baseUrl = baseUrl ? validateSelfHostedUrl(baseUrl, { allowPublicHosts, allowedDomains }).toString().replace(/\/+$/, "") : "";
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.paths = {
      health: "/health",
      add: "/memories",
      search: "/memories/search",
      get: "/memories/{id}",
      delete: "/memories/{id}",
      ...paths
    };
  }

  status() {
    return {
      provider: this.id,
      status: this.baseUrl ? "configured" : "missing_base_url",
      baseUrlConfigured: Boolean(this.baseUrl),
      externalCloud: false,
      storagePolicy: "self_hosted_only",
      capabilities: ["test", "add", "search", "get", "delete"]
    };
  }

  async test() {
    if (!this.baseUrl) return { ok: false, ...this.status(), message: "Mem0 OSS baseUrl is required" };
    const response = await this.fetchJson(this.paths.health, { method: "GET" });
    return {
      ok: response.ok,
      ...this.status(),
      statusCode: response.status,
      message: response.ok ? "Self-hosted Mem0 OSS endpoint is reachable." : `Mem0 OSS endpoint returned HTTP ${response.status}.`,
      sample: response.body
    };
  }

  async add(input) {
    return this.fetchJson(this.paths.add, { method: "POST", body: input });
  }

  async search(input) {
    return this.fetchJson(this.paths.search, { method: "POST", body: input });
  }

  async get({ id, ...input }) {
    return this.fetchJson(this.paths.get.replace("{id}", encodeURIComponent(id)), { method: "GET", body: input });
  }

  async delete({ id, ...input }) {
    return this.fetchJson(this.paths.delete.replace("{id}", encodeURIComponent(id)), { method: "DELETE", body: input });
  }

  async fetchJson(path, { method = "GET", body } = {}) {
    if (!this.baseUrl) throw new Error("Mem0 OSS baseUrl is required");
    const url = new URL(path, this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init = {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        }
      };
      if (body !== undefined && method !== "GET") {
        init.body = JSON.stringify(body);
        init.headers["Content-Type"] = "application/json";
      }
      const response = await fetch(url, init);
      const text = await response.text();
      return { ok: response.ok, status: response.status, body: safeJson(text) ?? text };
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

module.exports = { Mem0OssProvider };
