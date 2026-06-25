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

const CONTEXT_TYPES = Object.freeze([
  "chat",
  "user_profile",
  "recommendation_input",
  "profile_patch",
  "policy_analysis",
  "provider_search",
  "file_summary",
  "session_summary",
  "audio_transcript",
  "video_summary",
  "document_upload",
  "manual_note"
]);

const LEGACY_CONTEXT_TYPE_MAP = Object.freeze({
  conversation: "chat",
  message: "chat",
  profile: "user_profile",
  policy: "policy_analysis",
  document: "document_upload",
  provider: "provider_search",
  recommendation: "recommendation_input",
  audio: "audio_transcript",
  video: "video_summary",
  note: "manual_note"
});

function normalizeContextType(value, fallback = "chat") {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = LEGACY_CONTEXT_TYPE_MAP[raw] || raw;
  return CONTEXT_TYPES.includes(normalized) ? normalized : fallback;
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
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

function listContextProviderAdapters() {
  return [
    {
      id: "local_context_manager",
      label: "Local Context Manager",
      role: "context_store",
      externalCloud: false,
      capabilities: ["text", "image", "audio", "video", "file", "keyword_search", "crud"]
    },
    {
      id: "mem0_oss_self_hosted",
      label: "Mem0 OSS self-hosted",
      role: "context_store",
      externalCloud: false,
      capabilities: ["self_hosted_endpoint", "crud", "search"],
      note: "Data should remain in the project-controlled/self-hosted service, not Mem0 Cloud."
    },
    {
      id: "openai_embedding",
      label: "OpenAI embedding",
      role: "embedding_provider",
      externalCloud: true,
      capabilities: ["embedding"]
    },
    {
      id: "gemini_embedding",
      label: "Gemini embedding",
      role: "embedding_provider",
      externalCloud: true,
      capabilities: ["embedding"]
    },
    {
      id: "custom_embedding",
      label: "Custom embedding",
      role: "embedding_provider",
      externalCloud: "depends_on_endpoint",
      capabilities: ["embedding", "openai_compatible"]
    }
  ];
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
    providerAdapters: listContextProviderAdapters(),
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
  return (Array.isArray(memories) ? memories : [])
    .map((memory) => {
      const metadata = memory.metadata && typeof memory.metadata === "object" ? memory.metadata : {};
      const category = normalizeContextType(memory.category || (Array.isArray(memory.categories) ? memory.categories[0] : ""));
      const confidence = Number.isFinite(Number(memory.confidence ?? metadata.confidence)) ? Number(memory.confidence ?? metadata.confidence) : null;
      const userConfirmed = memory.userConfirmed === true || metadata.userConfirmed === true;
      const createdAt = memory.createdAt || metadata.createdAt || "";
      const updatedAt = memory.updatedAt || metadata.updatedAt || createdAt || "";
      return {
        id: memory.id,
        provider: memory.provider || "local_context_manager",
        category,
        type: category,
        text: trimText(memory.text || memory.memory || "", config.memoryTextChars),
        memory: trimText(memory.memory || memory.text || "", config.memoryTextChars),
        confidence,
        score: memory.score ?? null,
        createdAt,
        updatedAt,
        userConfirmed,
        metadata: {
          ...metadata,
          source: metadata.source || memory.source || "context_manager",
          confidence,
          createdAt,
          updatedAt,
          userConfirmed
        }
      };
    })
    .sort((a, b) => {
      if (a.userConfirmed !== b.userConfirmed) return a.userConfirmed ? -1 : 1;
      const confidenceDelta = Number(b.confidence || 0) - Number(a.confidence || 0);
      if (confidenceDelta) return confidenceDelta;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
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
    category: normalizeContextType(memory.category || memory.type || "chat"),
    confidence: Number.isFinite(Number(memory.confidence)) ? Number(memory.confidence) : 0.55,
    metadata: {
      source: "ai_chat",
      userConfirmed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(memory.metadata && typeof memory.metadata === "object" ? memory.metadata : {})
    }
  };
}

function buildSessionSummary(messages = [], configInput = {}) {
  const config = normalizeContextConfig(configInput);
  const allMessages = Array.isArray(messages) ? messages : [];
  if (!config.summaryProvider || config.summaryProvider === "none") return null;
  if (allMessages.length <= config.recentMessageLimit) return null;
  const older = allMessages.slice(0, Math.max(0, allMessages.length - config.recentMessageLimit));
  if (!older.length) return null;
  const first = older[0];
  const last = older[older.length - 1];
  const topics = older
    .map((message) => String(message.text || message.content || "").trim())
    .filter(Boolean)
    .slice(-6)
    .map((text) => trimText(text, 90));
  return {
    type: "session_summary",
    text: trimText(`Earlier conversation summary (${older.length} messages): ${topics.join(" | ")}`, config.memoryTextChars),
    sourceMessageCount: older.length,
    generatedBy: config.summaryProvider === "local" ? "local_session_summary" : `configured_${config.summaryProvider}_summary`,
    firstMessageAt: first?.createdAt || first?.time || "",
    lastMessageAt: last?.createdAt || last?.time || "",
    createdAt: new Date().toISOString()
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
        fallback: false,
        memoryCount: 0,
        recentMessageCount: 0,
        latencyMs: { retrieval: 0, summary: 0, embedding: 0, total: 0 },
        errors: {},
        lifecycleSections: Object.keys(lifecycle || {}).filter((key) => Boolean(lifecycle[key]))
      },
      memoryIds: []
    };
  }

  if (!manager || typeof manager.buildContext !== "function") {
    const boundedMessages = prepareRecentMessages(recentMessages, config);
    return {
      context: {
        language,
        lifecycle,
        recentMessages: boundedMessages,
        memories: [],
        memoryProvider: "context_manager",
        selectedProvider: config.provider,
        memoryStatus: "fallback",
        contextInjectionStrategy: createContextInjectionStrategy(config)
      },
      diagnostics: {
        provider: "context_manager",
        selectedProvider: config.provider,
        status: "fallback",
        fallback: true,
        fallbackReason: "context_manager_unavailable",
        memoryCount: 0,
        recentMessageCount: boundedMessages.length,
        latencyMs: { retrieval: 0, summary: 0, embedding: 0, total: 0 },
        errors: { retrieval: "buildBoundedChatContext requires a context manager" },
        lifecycleSections: Object.keys(lifecycle || {}).filter((key) => Boolean(lifecycle[key]))
      },
      memoryIds: []
    };
  }

  const totalStart = nowMs();
  const errors = {};
  let built;
  let retrievalMs = 0;
  try {
    const retrievalStart = nowMs();
    built = await manager.buildContext({
      userId,
      query: query || message || "",
      recentMessages,
      lifecycle,
      limit: config.maxMemories
    });
    retrievalMs = nowMs() - retrievalStart;
  } catch (error) {
    retrievalMs = nowMs() - totalStart;
    errors.retrieval = error.message;
    built = {
      context: {
        lifecycle,
        recentMessages,
        memories: [],
        memoryProvider: "context_manager",
        selectedProvider: config.provider
      },
      diagnostics: {
        status: "fallback",
        fallback: true,
        fallbackReason: "retrieval_failed"
      }
    };
  }
  const diagnostics = built.diagnostics || {};
  const sourceContext = built.context || {};
  const memories = prepareMemoryItems(sourceContext.memories || [], config);
  const boundedMessages = prepareRecentMessages(sourceContext.recentMessages || recentMessages, config);
  const summaryStart = nowMs();
  const sessionSummary = buildSessionSummary(sourceContext.recentMessages || recentMessages, config);
  const summaryMs = nowMs() - summaryStart;
  const context = {
    language,
    lifecycle,
    recentMessages: boundedMessages,
    memories,
    sessionSummary,
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
      fallback: Boolean(diagnostics.fallback || errors.retrieval),
      fallbackReason: diagnostics.fallbackReason || (errors.retrieval ? "retrieval_failed" : ""),
      memoryCount: memories.length,
      confirmedMemoryCount: memories.filter((memory) => memory.userConfirmed).length,
      inferredMemoryCount: memories.filter((memory) => !memory.userConfirmed).length,
      recentMessageCount: boundedMessages.length,
      sessionSummaryGenerated: Boolean(sessionSummary),
      sessionSummaryMessageCount: sessionSummary?.sourceMessageCount || 0,
      latencyMs: {
        retrieval: retrievalMs,
        summary: summaryMs,
        embedding: 0,
        total: nowMs() - totalStart
      },
      errors,
      providers: {
        retrieval: config.retrievalProvider,
        embedding: config.embeddingProvider,
        summary: config.summaryProvider
      },
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
  CONTEXT_TYPES,
  normalizeContextType,
  listContextProviderAdapters,
  normalizeContextConfig,
  buildContextStatus,
  trimText,
  prepareRecentMessages,
  prepareMemoryItems,
  createContextInjectionStrategy,
  buildMemoryText,
  normalizeExtractedMemory,
  buildSessionSummary,
  buildBoundedChatContext,
  buildContextConnectionTest
};
