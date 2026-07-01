const { createContextManager, ContextManager } = require("./context-manager");
const { InMemoryStorage } = require("./storage/memory-storage");
const { LocalContextManagerProvider } = require("./providers/local-context-manager");
const { Mem0OssProvider } = require("./providers/mem0-oss");
const {
  supportedContentTypes,
  normalizeContentItems,
  normalizeMemoryInput,
  normalizeImportance,
  normalizeRetention,
  contentToSearchText
} = require("./content");
const { validateSelfHostedUrl } = require("./security");
const { createContextManagerHandlers } = require("./http/routes");
const {
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
} = require("./chat-workflow");
const {
  CONTEXT_SOURCE_TYPES,
  normalizeContextSourceType,
  understandRawContext,
  buildUserProfilePrompt,
  buildContextSummaryPrompt,
  normalizeContextSummaryResult
} = require("./understanding");
const {
  normalizeContextEvent,
  contextEventToMemory,
  buildDedupeKey,
  scoreContextImportance
} = require("./events");
const {
  buildTaskContextPack,
  buildDecisionContextPack,
  buildConnectorContextPack
} = require("./context-packs");
const {
  DomainPluginRegistry,
  createDomainPluginRegistry,
  commerceGrowthPlugin
} = require("./plugins");
const {
  LlmContextProviderContract,
  createLlmContextProviderContract
} = require("./provider-contract");

module.exports = {
  createContextManager,
  ContextManager,
  InMemoryStorage,
  LocalContextManagerProvider,
  Mem0OssProvider,
  supportedContentTypes,
  normalizeContentItems,
  normalizeMemoryInput,
  normalizeImportance,
  normalizeRetention,
  contentToSearchText,
  validateSelfHostedUrl,
  createContextManagerHandlers,
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
  buildContextConnectionTest,
  CONTEXT_SOURCE_TYPES,
  normalizeContextSourceType,
  understandRawContext,
  buildUserProfilePrompt,
  buildContextSummaryPrompt,
  normalizeContextSummaryResult,
  normalizeContextEvent,
  contextEventToMemory,
  buildDedupeKey,
  scoreContextImportance,
  buildTaskContextPack,
  buildDecisionContextPack,
  buildConnectorContextPack,
  DomainPluginRegistry,
  createDomainPluginRegistry,
  commerceGrowthPlugin,
  LlmContextProviderContract,
  createLlmContextProviderContract
};
