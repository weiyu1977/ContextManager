const { createContextManager, ContextManager } = require("./context-manager");
const { InMemoryStorage } = require("./storage/memory-storage");
const { LocalContextManagerProvider } = require("./providers/local-context-manager");
const { Mem0OssProvider } = require("./providers/mem0-oss");
const {
  supportedContentTypes,
  normalizeContentItems,
  normalizeMemoryInput,
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
  buildUserProfilePrompt
} = require("./understanding");

module.exports = {
  createContextManager,
  ContextManager,
  InMemoryStorage,
  LocalContextManagerProvider,
  Mem0OssProvider,
  supportedContentTypes,
  normalizeContentItems,
  normalizeMemoryInput,
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
  buildUserProfilePrompt
};
