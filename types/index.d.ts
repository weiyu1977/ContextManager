export type ContentType = "text" | "markdown" | "html" | "json" | "image" | "audio" | "video" | "file";

export interface ContextContentItem {
  id?: string;
  type: ContentType;
  text?: string;
  transcript?: string;
  description?: string;
  mimeType?: string;
  name?: string;
  fileName?: string;
  url?: string;
  data?: string;
  base64?: string;
  size?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryInput {
  id?: string;
  userId: string;
  agentId?: string;
  runId?: string;
  sessionId?: string;
  memory?: string;
  text?: string;
  messages?: Array<{ role?: string; text?: string; content?: string }>;
  content?: ContextContentItem[];
  category?: string;
  categories?: string[];
  metadata?: Record<string, unknown>;
  confidence?: number;
}

export interface ContextMemory {
  id: string;
  userId: string;
  agentId?: string;
  runId?: string;
  provider: string;
  memory: string;
  text: string;
  content: ContextContentItem[];
  category: string;
  categories: string[];
  metadata: Record<string, unknown>;
  confidence?: number | null;
  status: string;
  score?: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface SearchInput {
  userId: string;
  query?: string;
  limit?: number;
  filters?: {
    category?: string;
    agentId?: string;
    runId?: string;
    contentTypes?: ContentType[];
  };
}

export interface ContextManagerOptions {
  provider?: "local_context_manager" | "mem0_oss_self_hosted" | string;
  storage?: ContextStorage;
  providers?: Record<string, ContextProvider>;
  mem0?: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    allowPublicHosts?: boolean;
    allowedDomains?: string[];
    paths?: Record<string, string>;
  };
  localFirst?: boolean;
  externalSync?: boolean;
  maxMemories?: number;
}

export interface ContextWorkflowConfig {
  enabled?: boolean | string | number;
  maxMemories?: number | string;
  recentMessageLimit?: number | string;
  recentMessageChars?: number | string;
  memoryTextChars?: number | string;
  retentionMode?: string;
  provider?: string;
  extractorProvider?: string;
  extractorModel?: string;
  retrievalProvider?: string;
  embeddingProvider?: string;
  embeddingModel?: string;
  summaryProvider?: string;
  summaryModel?: string;
  mem0OssBaseUrl?: string;
  mem0OssApiKey?: string;
  mem0OssApiKeyConfigured?: boolean;
}

export interface BoundedChatContextInput {
  manager: ContextManager;
  userId: string;
  query?: string;
  message?: string;
  language?: string;
  lifecycle?: Record<string, unknown>;
  recentMessages?: Array<Record<string, unknown>>;
  config?: ContextWorkflowConfig;
}

export interface ContextStorage {
  add(item: ContextMemory): Promise<ContextMemory>;
  get(input: { userId: string; id: string }): Promise<ContextMemory | null>;
  list(input: { userId: string; limit?: number }): Promise<ContextMemory[]>;
  update(input: { userId: string; id: string; patch?: Partial<ContextMemory> }): Promise<ContextMemory | null>;
  delete(input: { userId: string; id: string }): Promise<boolean>;
  clear(input: { userId: string }): Promise<number>;
  logEvent?(event: Record<string, unknown>): Promise<void>;
  listEvents?(input: { userId: string; limit?: number }): Promise<Array<Record<string, unknown>>>;
}

export interface ContextProvider {
  id?: string;
  status?(): Record<string, unknown>;
  test?(input?: Record<string, unknown>): Promise<Record<string, unknown>>;
  add?(input: MemoryInput): Promise<unknown>;
  search?(input: SearchInput): Promise<unknown>;
  get?(input: { userId: string; id: string }): Promise<unknown>;
  update?(input: MemoryInput & { id: string; userId: string }): Promise<unknown>;
  delete?(input: { userId: string; id: string }): Promise<unknown>;
}

export class ContextManager {
  constructor(options?: ContextManagerOptions);
  status(): Record<string, unknown>;
  add(input: MemoryInput): Promise<ContextMemory>;
  search(input: SearchInput): Promise<ContextMemory[]>;
  get(input: { userId: string; id: string }): Promise<ContextMemory | null>;
  list(input: { userId: string; limit?: number }): Promise<ContextMemory[]>;
  update(input: MemoryInput & { id: string; userId: string }): Promise<ContextMemory | null>;
  delete(input: { userId: string; id: string }): Promise<boolean>;
  clear(input: { userId: string }): Promise<number>;
  buildContext(input: { userId: string; query?: string; recentMessages?: unknown[]; lifecycle?: Record<string, unknown>; limit?: number }): Promise<{ context: Record<string, unknown>; diagnostics: Record<string, unknown> }>;
  testProvider(input?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class InMemoryStorage implements ContextStorage {
  add(item: ContextMemory): Promise<ContextMemory>;
  get(input: { userId: string; id: string }): Promise<ContextMemory | null>;
  list(input: { userId: string; limit?: number }): Promise<ContextMemory[]>;
  update(input: { userId: string; id: string; patch?: Partial<ContextMemory> }): Promise<ContextMemory | null>;
  delete(input: { userId: string; id: string }): Promise<boolean>;
  clear(input: { userId: string }): Promise<number>;
}

export class LocalContextManagerProvider implements ContextProvider {
  constructor(options: { storage: ContextStorage; clock?: () => Date });
}

export class Mem0OssProvider implements ContextProvider {
  constructor(options: { baseUrl?: string; apiKey?: string; timeoutMs?: number; paths?: Record<string, string>; allowPublicHosts?: boolean; allowedDomains?: string[] });
}

export function createContextManager(options?: ContextManagerOptions): ContextManager;
export function normalizeContentItems(input: unknown): ContextContentItem[];
export function normalizeMemoryInput(input: MemoryInput): MemoryInput;
export function contentToSearchText(content: ContextContentItem[]): string;
export function validateSelfHostedUrl(rawUrl: string, options?: { allowPublicHosts?: boolean; allowedDomains?: string[]; blockedHosts?: string[] }): URL;
export function createContextManagerHandlers(manager: ContextManager, options?: Record<string, unknown>): { mount(app: unknown, basePath?: string): void };
export function normalizeBooleanFlag(value: unknown, defaultValue?: boolean): boolean;
export function normalizeContextConfig(input?: ContextWorkflowConfig): Required<ContextWorkflowConfig>;
export function buildContextStatus(input?: ContextWorkflowConfig): Record<string, unknown>;
export function trimText(value: unknown, maxChars: number): string;
export function prepareRecentMessages(messages?: Array<Record<string, unknown>>, config?: ContextWorkflowConfig): Array<Record<string, unknown>>;
export function prepareMemoryItems(memories?: Array<Record<string, unknown>>, config?: ContextWorkflowConfig): Array<Record<string, unknown>>;
export function createContextInjectionStrategy(config?: ContextWorkflowConfig): Record<string, unknown>;
export function buildMemoryText(userMessage?: string, assistantText?: string, config?: ContextWorkflowConfig): string;
export function normalizeExtractedMemory(extractedMemory?: unknown, userMessage?: string, assistantText?: string, config?: ContextWorkflowConfig): { shouldRemember: boolean; text: string; category: string; confidence: number; metadata: Record<string, unknown> };
export function buildBoundedChatContext(input: BoundedChatContextInput): Promise<{ context: Record<string, unknown>; diagnostics: Record<string, unknown>; memoryIds: string[] }>;
export function buildContextConnectionTest(input?: ContextWorkflowConfig): Record<string, unknown>;
