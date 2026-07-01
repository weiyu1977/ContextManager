const { prepareMemoryItems, prepareRecentMessages, trimText } = require("./chat-workflow");

async function buildTaskContextPack(input = {}) {
  const context = await resolveContext(input);
  const memories = prepareMemoryItems(context.memories || [], input.config || {});
  return {
    type: "task_context_pack",
    task: input.task || input.objective || "general_task",
    objective: input.objective || input.task || "",
    subject: normalizeSubject(input),
    constraints: normalizeList(input.constraints),
    recentMessages: prepareRecentMessages(context.recentMessages || input.recentMessages || [], input.config || {}),
    relevantMemories: memories.slice(0, input.maxMemories || 8),
    facts: selectFacts(memories),
    risks: selectByCategory(memories, ["compliance_memory", "delivery_memory"]),
    signals: selectByCategory(memories, ["growth_outcome", "strategy_signal", "asset_performance"]),
    diagnostics: context.diagnostics || {}
  };
}

async function buildDecisionContextPack(input = {}) {
  const taskPack = await buildTaskContextPack(input);
  const positiveSignals = taskPack.signals.filter((item) => /win|paid|accepted|executed|scale/i.test(`${item.text} ${JSON.stringify(item.metadata || {})}`));
  const negativeSignals = taskPack.signals.filter((item) => /loss|rejected|blocked|failed|refund/i.test(`${item.text} ${JSON.stringify(item.metadata || {})}`));
  return {
    ...taskPack,
    type: "decision_context_pack",
    decision: input.decision || input.objective || "",
    positiveSignals,
    negativeSignals,
    approvalHints: [
      ...taskPack.risks.map((item) => `Review risk: ${trimText(item.text, 160)}`),
      negativeSignals.length ? "Previous negative signals exist; keep action draft-first." : ""
    ].filter(Boolean),
    explainabilityInputs: {
      memoryIds: taskPack.relevantMemories.map((item) => item.id).filter(Boolean),
      riskCount: taskPack.risks.length,
      positiveSignalCount: positiveSignals.length,
      negativeSignalCount: negativeSignals.length
    }
  };
}

async function buildConnectorContextPack(input = {}) {
  const taskPack = await buildTaskContextPack({
    ...input,
    task: input.task || "connector_action",
    constraints: [
      ...(Array.isArray(input.constraints) ? input.constraints : []),
      "Prefer draft-first execution for external platform changes.",
      "Require approval for spend, publish, pricing, policy, or destructive changes."
    ]
  });
  const connector = input.connector || input.source || input.provider || "";
  const connectorMemories = taskPack.relevantMemories.filter((item) => {
    const text = `${item.source || ""} ${item.subjectType || ""} ${item.text || ""} ${JSON.stringify(item.metadata || {})}`.toLowerCase();
    return connector ? text.includes(String(connector).toLowerCase()) : item.category === "connector_event";
  });
  return {
    ...taskPack,
    type: "connector_context_pack",
    connector,
    externalAccount: connectorMemories.find((item) => item.category === "external_account") || null,
    priorConnectorEvents: connectorMemories.filter((item) => item.category === "connector_event").slice(0, 8),
    executionGuardrails: {
      draftFirst: true,
      approvalRequiredFor: ["publish", "spend", "pricing", "policy", "delete", "customer_message"],
      rollbackRequired: true
    }
  };
}

async function resolveContext(input) {
  if (input.context && typeof input.context === "object") return input.context;
  if (input.manager && typeof input.manager.buildContext === "function" && input.userId) {
    const built = await input.manager.buildContext({
      userId: input.userId,
      query: input.query || input.objective || input.task || "",
      recentMessages: input.recentMessages || [],
      lifecycle: input.lifecycle || {},
      limit: input.maxMemories || input.limit || 8
    });
    return { ...(built.context || {}), diagnostics: built.diagnostics || {} };
  }
  return {
    lifecycle: input.lifecycle || {},
    recentMessages: input.recentMessages || [],
    memories: input.memories || [],
    diagnostics: { fallback: true, fallbackReason: "no_context_manager" }
  };
}

function normalizeSubject(input) {
  return {
    type: input.subjectType || input.entityType || "",
    id: input.subjectId || input.entityId || "",
    title: input.subjectTitle || input.title || ""
  };
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [value]).map((item) => String(item || "").trim()).filter(Boolean);
}

function selectFacts(memories) {
  return memories
    .filter((item) => item.userConfirmed || Number(item.confidence || 0) >= 0.7)
    .slice(0, 8)
    .map((item) => ({ id: item.id, category: item.category, text: item.text, confidence: item.confidence, userConfirmed: item.userConfirmed }));
}

function selectByCategory(memories, categories) {
  const set = new Set(categories);
  return memories.filter((item) => set.has(item.category)).slice(0, 8);
}

module.exports = {
  buildTaskContextPack,
  buildDecisionContextPack,
  buildConnectorContextPack
};
