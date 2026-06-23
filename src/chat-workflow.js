function normalizeBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return defaultValue;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeContextConfig(input = {}) {
  return {
    enabled: normalizeBooleanFlag(input.enabled, true),
    maxMemories: clampNumber(input.maxMemories, 8, 0, 100),
    recentMessageLimit: clampNumber(input.recentMessageLimit, 8, 0, 100),
    recentMessageChars: clampNumber(input.recentMessageChars, 900, 80, 10000),
    memoryTextChars: clampNumber(input.memoryTextChars, 900, 80, 10000),
    retentionMode: String(input.retentionMode || "project_db"),
    provider: String(input.provider || "local_context_manager"),
    extractorProvider: String(input.extractorProvider || "local_heuristic"),
    extractorModel: String(input.extractorModel || ""),
    retrievalProvider: String(input.retrievalProvider || "local_keyword"),
    embeddingProvider: String(input.embeddingProvider || "none"),
    embeddingModel: String(input.embeddingModel || ""),
    summaryProvider: String(input.summaryProvider || "none"),
    summaryModel: String(input.summaryModel || ""),
    mem0OssBaseUrl: String(input.mem0OssBaseUrl || ""),
    mem0OssApiKeyConfigured: Boolean(input.mem0OssApiKeyConfigured || input.mem0OssApiKey)
  };
}

function buildContextStatus(input = {}) {
  const config = normalizeContextConfig(input);
  return {
    provider: "context_manager",
    selectedProvider: config.provider,
    status: config.enabled ? "enabled" : "disabled",
    storage: config.retentionMode,
    externalCloud: false,
    maxMemories: config.maxMemories,
    recentMessageLimit: config.recentMessageLimit,
    recentMessageChars: config.recentMessageChars,
    memoryTextChars: config.memoryTextChars,
    retentionMode: config.retentionMode,
    extractorProvider: config.extractorProvider,
    extractorModel: config.extractorModel,
    retrievalProvider: config.retrievalProvider,
    embeddingProvider: config.embeddingProvider,
    embeddingModel: config.embeddingModel,
    summaryProvider: config.summaryProvider,
    summaryModel: config.summaryModel,
    mem0Oss: {
      enabled: config.provider === "mem0_oss_self_hosted",
      baseUrlConfigured: Boolean(config.mem0OssBaseUrl),
      apiKeyConfigured: config.mem0OssApiKeyConfigured,
      storagePolicy: "local_first"
    }
  };
}

function trimText(value, maxChars) {
  const text = String(value || "");
  if (!text || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function prepareRecentMessages(messages = [], configInput = {}) {
  const config = normalizeContextConfig(configInput);
  return (Array.isArray(messages) ? messages : [])
    .slice(-config.recentMessageLimit)
    .map((message) => ({
      role: message.role || "user",
      text: trimText(message.text || message.content || "", config.recentMessageChars),
      createdAt: message.createdAt || message.time || ""
    }));
}

function prepareMemoryItems(memories = [], configInput = {}) {
  const config = normalizeContextConfig(configInput);
  return (Array.isArray(memories) ? memories : []).map((memory) => ({
    id: memory.id,
    provider: memory.provider || "local_context_manager",
    category: memory.category || (Array.isArray(memory.categories) ? memory.categories[0] : "") || "conversation",
    text: trimText(memory.text || memory.memory || "", config.memoryTextChars),
    memory: trimText(memory.memory || memory.text || "", config.memoryTextChars),
    confidence: memory.confidence ?? null,
    score: memory.score ?? null,
    updatedAt: memory.updatedAt || "",
    metadata: memory.metadata || {}
  }));
}

function createContextInjectionStrategy(configInput = {}) {
  const config = normalizeContextConfig(configInput);
  return {
    type: "bounded_local_context",
    maxMemories: config.maxMemories,
    recentMessageLimit: config.recentMessageLimit,
    retentionMode: config.retentionMode,
    summaryProvider: config.summaryProvider,
    embeddingProvider: config.embeddingProvider
  };
}

function buildMemoryText(userMessage, assistantText, configInput = {}) {
  const config = normalizeContextConfig(configInput);
  const text = [
    userMessage ? `User: ${userMessage}` : "",
    assistantText ? `Assistant: ${assistantText}` : ""
  ].filter(Boolean).join("\n");
  return trimText(text, config.memoryTextChars);
}

function normalizeExtractedMemory(extractedMemory, userMessage, assistantText, configInput = {}) {
  const memory = extractedMemory && typeof extractedMemory === "object" ? extractedMemory : {};
  const shouldRemember = memory.shouldRemember !== false;
  const text = trimText(
    memory.memory || memory.text || buildMemoryText(userMessage, assistantText, configInput),
    normalizeContextConfig(configInput).memoryTextChars
  );
  return {
    shouldRemember,
    text,
    category: String(memory.category || "conversation"),
    confidence: Number.isFinite(Number(memory.confidence)) ? Number(memory.confidence) : 0.55,
    metadata: memory.metadata && typeof memory.metadata === "object" ? memory.metadata : {}
  };
}

async function buildBoundedChatContext({
  manager,
  userId,
  query = "",
  message = "",
  language = "",
  lifecycle = {},
  recentMessages = [],
  config: configInput = {}
} = {}) {
  const config = normalizeContextConfig(configInput);
  if (!config.enabled) {
    const context = {
      language,
      lifecycle,
      recentMessages: [],
      memories: [],
      memoryProvider: "context_manager",
      selectedProvider: config.provider,
      memoryStatus: "disabled",
      contextInjectionStrategy: createContextInjectionStrategy(config)
    };
    return {
      context,
      diagnostics: {
        provider: "context_manager",
        selectedProvider: config.provider,
        status: "disabled",
        memoryCount: 0,
        recentMessageCount: 0,
        lifecycleSections: Object.keys(lifecycle || {}).filter((key) => Boolean(lifecycle[key]))
      },
      memoryIds: []
    };
  }

  if (!manager || typeof manager.buildContext !== "function") {
    throw new Error("buildBoundedChatContext requires a context manager");
  }

  const built = await manager.buildContext({
    userId,
    query: query || message || "",
    recentMessages,
    lifecycle,
    limit: config.maxMemories
  });
  const diagnostics = built.diagnostics || {};
  const sourceContext = built.context || {};
  const memories = prepareMemoryItems(sourceContext.memories || [], config);
  const boundedMessages = prepareRecentMessages(sourceContext.recentMessages || recentMessages, config);
  const context = {
    language,
    lifecycle,
    recentMessages: boundedMessages,
    memories,
    memoryProvider: sourceContext.memoryProvider || "context_manager",
    selectedProvider: sourceContext.selectedProvider || config.provider,
    memoryStatus: diagnostics.status || "ok",
    contextInjectionStrategy: createContextInjectionStrategy(config)
  };
  return {
    context,
    diagnostics: {
      ...diagnostics,
      provider: "context_manager",
      selectedProvider: context.selectedProvider,
      memoryCount: memories.length,
      recentMessageCount: boundedMessages.length,
      lifecycleSections: Object.keys(lifecycle || {}).filter((key) => Boolean(lifecycle[key]))
    },
    memoryIds: memories.map((memory) => memory.id).filter(Boolean)
  };
}

function buildContextConnectionTest(input = {}) {
  const status = buildContextStatus(input);
  return {
    ok: true,
    provider: status.selectedProvider,
    storage: status.storage,
    externalCloud: false,
    message: "Context manager is configured for local-first project storage.",
    status
  };
}

module.exports = {
  normalizeBooleanFlag,
  normalizeContextConfig,
  buildContextStatus,
  trimText,
  prepareRecentMessages,
  prepareMemoryItems,
  createContextInjectionStrategy,
  buildMemoryText,
  normalizeExtractedMemory,
  buildBoundedChatContext,
  buildContextConnectionTest
};
