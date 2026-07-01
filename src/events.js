const crypto = require("node:crypto");
const {
  normalizeContentItems,
  normalizeMemoryCategory,
  normalizeStringList,
  normalizeImportance,
  normalizeRetention
} = require("./content");

function normalizeContextEvent(input = {}, options = {}) {
  const eventType = String(input.eventType || input.type || "context.event").trim();
  const subjectType = String(input.subjectType || input.subject_type || input.entityType || "").trim();
  const subjectId = String(input.subjectId || input.subject_id || input.entityId || "").trim();
  const source = String(input.source || input.provider || input.connectorId || "context_manager").trim();
  const category = normalizeMemoryCategory(input.category || categoryForEvent(eventType));
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const normalized = {
    id: String(input.id || `ctxevt-${crypto.randomUUID()}`),
    workspaceId: String(input.workspaceId || input.workspace_id || metadata.workspaceId || options.workspaceId || "").trim(),
    tenantId: String(input.tenantId || input.tenant_id || metadata.tenantId || options.tenantId || "").trim(),
    userId: String(input.userId || input.user_id || metadata.userId || options.userId || "").trim(),
    agentId: String(input.agentId || input.agent_id || metadata.agentId || "").trim(),
    runId: String(input.runId || input.run_id || input.sessionId || metadata.runId || "").trim(),
    eventType,
    source,
    subjectType,
    subjectId,
    category,
    title: String(input.title || input.name || metadata.title || "").trim(),
    summary: String(input.summary || input.memory || input.text || input.note || "").trim(),
    content: normalizeContentItems(input),
    outcome: String(input.outcome || metadata.outcome || "").trim(),
    importance: normalizeImportance(input.importance ?? metadata.importance),
    retention: normalizeRetention(input.retention || metadata.retention),
    expiresAt: normalizeDateString(input.expiresAt || metadata.expiresAt),
    occurredAt: normalizeDateString(input.occurredAt || input.createdAt || metadata.occurredAt) || new Date().toISOString(),
    tags: normalizeStringList(input.tags || metadata.tags || []),
    metadata: {
      ...metadata,
      source,
      eventType,
      subjectType,
      subjectId
    }
  };
  normalized.dedupeKey = String(input.dedupeKey || input.dedupe_key || metadata.dedupeKey || buildDedupeKey(normalized)).trim();
  if (normalized.importance === null) normalized.importance = scoreContextImportance(normalized);
  return normalized;
}

function contextEventToMemory(eventInput = {}, options = {}) {
  const event = normalizeContextEvent(eventInput, options);
  const memory = [
    event.title,
    event.summary || `${event.eventType} from ${event.source}`,
    event.outcome ? `Outcome: ${event.outcome}` : ""
  ].filter(Boolean).join("\n");
  return {
    id: options.memoryId || "",
    workspaceId: event.workspaceId,
    tenantId: event.tenantId,
    userId: event.userId,
    agentId: event.agentId,
    runId: event.runId,
    source: event.source,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    importance: event.importance,
    retention: event.retention,
    expiresAt: event.expiresAt,
    tags: event.tags,
    dedupeKey: event.dedupeKey,
    memory,
    content: event.content,
    category: event.category,
    categories: [event.category],
    metadata: {
      ...event.metadata,
      contextEventId: event.id,
      outcome: event.outcome,
      occurredAt: event.occurredAt,
      title: event.title,
      summary: event.summary
    },
    confidence: Number.isFinite(Number(options.confidence)) ? Number(options.confidence) : 0.7
  };
}

function buildDedupeKey(eventInput = {}) {
  const event = eventInput.eventType ? eventInput : normalizeContextEvent(eventInput);
  return [
    event.workspaceId,
    event.tenantId,
    event.userId,
    event.source,
    event.eventType,
    event.subjectType,
    event.subjectId,
    event.occurredAt?.slice(0, 10)
  ].filter(Boolean).join(":") || crypto.createHash("sha256").update(JSON.stringify(eventInput)).digest("hex");
}

function scoreContextImportance(eventInput = {}) {
  const event = eventInput.eventType ? eventInput : normalizeContextEvent(eventInput);
  const eventText = `${event.eventType} ${event.category} ${event.outcome} ${(event.tags || []).join(" ")}`.toLowerCase();
  let score = 0.45;
  if (/win|paid|order|conversion|checkout|accepted|executed|scale/.test(eventText)) score += 0.3;
  if (/loss|refund|rejected|failed|blocked|risk|compliance/.test(eventText)) score += 0.25;
  if (/connector|external|workflow|strategy|growth/.test(eventText)) score += 0.1;
  if (event.subjectId) score += 0.05;
  return Math.max(0.05, Math.min(1, Number(score.toFixed(2))));
}

function categoryForEvent(eventType) {
  const value = String(eventType || "").toLowerCase();
  if (/outcome|win|loss|conversion|order|paid/.test(value)) return "growth_outcome";
  if (/strategy/.test(value)) return "strategy_signal";
  if (/connector|shopify|stripe|google|oauth|webhook/.test(value)) return "connector_event";
  if (/offer/.test(value)) return "offer_memory";
  if (/channel/.test(value)) return "channel_memory";
  if (/price|pricing/.test(value)) return "pricing_memory";
  if (/delivery|fulfillment/.test(value)) return "delivery_memory";
  if (/customer|lead/.test(value)) return "customer_memory";
  if (/compliance|risk|policy/.test(value)) return "compliance_memory";
  if (/workflow|job|run/.test(value)) return "workflow_run";
  if (/account|identity/.test(value)) return "external_account";
  if (/asset|creative|performance|metric/.test(value)) return "asset_performance";
  return "manual_note";
}

function normalizeDateString(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

module.exports = {
  normalizeContextEvent,
  contextEventToMemory,
  buildDedupeKey,
  scoreContextImportance
};
