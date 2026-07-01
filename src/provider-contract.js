function createLlmContextProviderContract(provider = {}) {
  return new LlmContextProviderContract(provider);
}

class LlmContextProviderContract {
  constructor(provider = {}) {
    this.provider = provider || {};
    this.id = this.provider.id || this.provider.name || "llm_context_provider";
  }

  status() {
    return {
      provider: this.id,
      capabilities: {
        extractMemory: typeof this.provider.extractMemory === "function",
        summarizeContext: typeof this.provider.summarizeContext === "function",
        embedText: typeof this.provider.embedText === "function"
      }
    };
  }

  async extractMemory(input = {}) {
    return this.call("extractMemory", input, {
      ok: false,
      memory: "",
      category: "manual_note",
      confidence: 0,
      reason: "provider_extract_memory_not_configured"
    });
  }

  async summarizeContext(input = {}) {
    return this.call("summarizeContext", input, {
      ok: false,
      summary: "",
      reason: "provider_summarize_context_not_configured"
    });
  }

  async embedText(input = {}) {
    return this.call("embedText", input, {
      ok: false,
      embedding: [],
      reason: "provider_embed_text_not_configured"
    });
  }

  async call(method, input, fallback) {
    const fn = this.provider[method];
    if (typeof fn !== "function") return fallback;
    try {
      const result = await fn(input);
      return result && typeof result === "object" ? result : { ok: true, value: result };
    } catch (error) {
      return { ok: false, error: error.message, method, provider: this.id };
    }
  }
}

module.exports = {
  LlmContextProviderContract,
  createLlmContextProviderContract
};
