const crypto = require("node:crypto");
const { normalizeMemoryInput, contentToSearchText } = require("../content");

class LocalContextManagerProvider {
  constructor({ storage, clock = () => new Date() } = {}) {
    if (!storage) throw new Error("LocalContextManagerProvider requires storage");
    this.id = "local_context_manager";
    this.storage = storage;
    this.clock = clock;
  }

  status() {
    return {
      provider: this.id,
      status: "ready",
      storage: "local",
      externalCloud: false,
      capabilities: ["add", "search", "get", "list", "delete", "clear", "multimodal_content"]
    };
  }

  async add(input = {}) {
    const normalized = normalizeMemoryInput(input);
    if (!normalized.userId) throw new Error("userId is required");
    if (!normalized.memory && !normalized.content.length) throw new Error("memory or content is required");
    const now = this.clock().toISOString();
    const item = {
      id: normalized.id || `mem-${crypto.randomUUID()}`,
      userId: normalized.userId,
      agentId: normalized.agentId,
      runId: normalized.runId,
      provider: this.id,
      memory: normalized.memory,
      text: normalized.memory,
      content: normalized.content,
      categories: normalized.categories,
      category: normalized.categories[0] || "conversation",
      metadata: normalized.metadata,
      confidence: normalized.confidence,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastUsedAt: ""
    };
    const saved = await this.storage.add(item);
    await this.storage.logEvent?.({ userId: item.userId, eventType: "memory.add", provider: this.id, status: "ok", metadata: { id: item.id } });
    return saved;
  }

  async search({ userId, query, limit = 8, filters = {} } = {}) {
    if (!userId) throw new Error("userId is required");
    const all = await this.storage.list({ userId, limit: Math.max(100, limit * 10) });
    const terms = tokenize(query);
    const results = all
      .map((item) => {
        const haystack = [
          item.memory,
          contentToSearchText(item.content || []),
          JSON.stringify(item.metadata || {}),
          (item.categories || []).join(" ")
        ].join(" ").toLowerCase();
        const score = terms.length ? terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) : 1;
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .filter((item) => matchFilters(item, filters))
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit);
    await this.storage.logEvent?.({ userId, eventType: "memory.search", provider: this.id, status: "ok", metadata: { count: results.length } });
    return results;
  }

  async get({ userId, id }) {
    if (!userId || !id) throw new Error("userId and id are required");
    return this.storage.get({ userId, id });
  }

  async list({ userId, limit = 50 }) {
    if (!userId) throw new Error("userId is required");
    return this.storage.list({ userId, limit });
  }

  async delete({ userId, id }) {
    if (!userId || !id) throw new Error("userId and id are required");
    return this.storage.delete({ userId, id });
  }

  async clear({ userId }) {
    if (!userId) throw new Error("userId is required");
    return this.storage.clear({ userId });
  }

  async test() {
    return { ok: true, ...this.status() };
  }
}

function tokenize(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/i).filter((term) => term.length >= 2).slice(0, 32);
}

function matchFilters(item, filters = {}) {
  if (filters.category && !(item.categories || []).includes(filters.category) && item.category !== filters.category) return false;
  if (filters.agentId && item.agentId !== filters.agentId) return false;
  if (filters.runId && item.runId !== filters.runId) return false;
  if (Array.isArray(filters.contentTypes) && filters.contentTypes.length) {
    const types = new Set((item.content || []).map((content) => content.type));
    if (!filters.contentTypes.some((type) => types.has(type))) return false;
  }
  return true;
}

module.exports = { LocalContextManagerProvider };
