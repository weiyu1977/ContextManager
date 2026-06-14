const { InMemoryStorage } = require("./storage/memory-storage");
const { LocalContextManagerProvider } = require("./providers/local-context-manager");
const { Mem0OssProvider } = require("./providers/mem0-oss");

function createContextManager(options = {}) {
  return new ContextManager(options);
}

class ContextManager {
  constructor({
    provider = "local_context_manager",
    storage = new InMemoryStorage(),
    providers = {},
    mem0 = {},
    localFirst = true,
    externalSync = false,
    maxMemories = 8
  } = {}) {
    this.storage = storage;
    this.localProvider = providers.local_context_manager || new LocalContextManagerProvider({ storage });
    this.providers = {
      local_context_manager: this.localProvider,
      ...(mem0.baseUrl ? { mem0_oss_self_hosted: new Mem0OssProvider(mem0) } : {}),
      ...providers
    };
    this.providerName = provider;
    this.localFirst = localFirst;
    this.externalSync = externalSync;
    this.maxMemories = maxMemories;
  }

  status() {
    const selected = this.selectedProvider();
    return {
      provider: "context_manager",
      selectedProvider: this.providerName,
      localFirst: this.localFirst,
      externalSync: this.externalSync,
      externalCloud: false,
      maxMemories: this.maxMemories,
      providers: Object.fromEntries(Object.entries(this.providers).map(([key, provider]) => [key, provider.status?.() || { provider: key }]))
    };
  }

  selectedProvider() {
    return this.providers[this.providerName] || this.localProvider;
  }

  async add(input) {
    const local = await this.localProvider.add(input);
    if (this.shouldSyncExternal()) await this.tryExternal("add", input);
    return local;
  }

  async search(input = {}) {
    const localResults = await this.localProvider.search(input);
    if (!this.shouldUseExternalSearch()) return localResults;
    const external = await this.tryExternal("search", input);
    return mergeResults(localResults, external?.body?.results || external?.body?.memories || []);
  }

  async get(input) {
    return this.localProvider.get(input);
  }

  async list(input) {
    return this.localProvider.list(input);
  }

  async update(input) {
    const updated = await this.localProvider.update(input);
    if (updated && this.shouldSyncExternal()) await this.tryExternal("update", input);
    return updated;
  }

  async delete(input) {
    const deleted = await this.localProvider.delete(input);
    if (deleted && this.shouldSyncExternal()) await this.tryExternal("delete", input);
    return deleted;
  }

  async clear({ userId }) {
    return this.localProvider.clear({ userId });
  }

  async buildContext({ userId, query = "", recentMessages = [], lifecycle = {}, limit = this.maxMemories } = {}) {
    const memories = await this.search({ userId, query, limit });
    const context = {
      lifecycle,
      recentMessages: recentMessages.slice(-12),
      memories,
      memoryProvider: "context_manager",
      selectedProvider: this.providerName
    };
    return {
      context,
      diagnostics: {
        provider: "context_manager",
        selectedProvider: this.providerName,
        memoryCount: memories.length,
        recentMessageCount: context.recentMessages.length,
        lifecycleSections: Object.keys(lifecycle).filter((key) => Array.isArray(lifecycle[key]) ? lifecycle[key].length : Boolean(lifecycle[key]))
      }
    };
  }

  async testProvider(input = {}) {
    const providerName = input.provider || this.providerName;
    const provider = this.providers[providerName] || this.localProvider;
    if (!provider.test) return { ok: false, provider: providerName, message: "Provider has no test method" };
    return provider.test(input);
  }

  shouldSyncExternal() {
    return this.externalSync && this.providerName !== "local_context_manager" && this.selectedProvider() !== this.localProvider;
  }

  shouldUseExternalSearch() {
    return !this.localFirst && this.providerName !== "local_context_manager" && this.selectedProvider() !== this.localProvider;
  }

  async tryExternal(method, input) {
    const provider = this.selectedProvider();
    if (!provider || provider === this.localProvider || !provider[method]) return null;
    try {
      return await provider[method](input);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}

function mergeResults(localResults, externalResults) {
  const seen = new Set();
  return [...localResults, ...externalResults].filter((item) => {
    const id = item.id || item.memory_id || item.externalId || JSON.stringify(item).slice(0, 200);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

module.exports = { createContextManager, ContextManager };
