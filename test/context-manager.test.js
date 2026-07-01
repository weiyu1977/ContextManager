const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  createContextManager,
  CONTEXT_TYPES,
  normalizeContextType,
  listContextProviderAdapters,
  normalizeContentItems,
  normalizeContextConfig,
  normalizeExtractedMemory,
  normalizeContextEvent,
  contextEventToMemory,
  buildTaskContextPack,
  buildDecisionContextPack,
  buildConnectorContextPack,
  commerceGrowthPlugin,
  createLlmContextProviderContract,
  buildBoundedChatContext,
  buildSessionSummary,
  understandRawContext,
  buildUserProfilePrompt,
  buildContextSummaryPrompt,
  normalizeContextSummaryResult,
  validateSelfHostedUrl,
  Mem0OssProvider
} = require("../src");
const multimodalFixture = require("./fixtures/multimodal-context.json");

test("local provider stores, retrieves, searches, and deletes text memories", async () => {
  const manager = createContextManager();
  const saved = await manager.add({
    userId: "user-1",
    memory: "Traveler wants PPO network and direct billing.",
    category: "preference"
  });

  assert.equal(saved.provider, "local_context_manager");
  assert.equal(saved.category, "preference");

  const results = await manager.search({ userId: "user-1", query: "PPO billing", limit: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, saved.id);

  const loaded = await manager.get({ userId: "user-1", id: saved.id });
  assert.equal(loaded.memory, saved.memory);

  assert.equal(await manager.delete({ userId: "user-1", id: saved.id }), true);
  assert.equal(await manager.get({ userId: "user-1", id: saved.id }), null);
});

test("local provider updates memories without changing ownership", async () => {
  const manager = createContextManager();
  const saved = await manager.add({
    userId: "user-update",
    memory: "Traveler prefers paper claim forms.",
    category: "claim"
  });

  const updated = await manager.update({
    userId: "user-update",
    id: saved.id,
    memory: "Traveler prefers online claim forms and itemized bills.",
    category: "preference",
    metadata: { source: "admin-debug" },
    confidence: 0.82
  });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.userId, "user-update");
  assert.equal(updated.category, "preference");
  assert.equal(updated.metadata.source, "admin-debug");
  assert.equal(updated.confidence, 0.82);
  assert.match(updated.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const oldQuery = await manager.search({ userId: "user-update", query: "paper" });
  assert.equal(oldQuery.length, 0);

  const newQuery = await manager.search({ userId: "user-update", query: "itemized bills" });
  assert.equal(newQuery.length, 1);
  assert.equal(newQuery[0].id, saved.id);

  const wrongUserUpdate = await manager.update({
    userId: "different-user",
    id: saved.id,
    memory: "Should not update another user's memory."
  });
  assert.equal(wrongUserUpdate, null);
});

test("normalizes multimodal context and supports content type filters", async () => {
  const manager = createContextManager();
  const content = normalizeContentItems(multimodalFixture);
  assert.deepEqual(content.map((item) => item.type), ["text", "file", "image", "audio", "video"]);
  assert.match(content.find((item) => item.type === "image").description, /Insurance ID card/);
  assert.match(content.find((item) => item.type === "audio").transcript, /claim form/);

  await manager.add(multimodalFixture);
  const fileResults = await manager.search({
    userId: "user-fixture",
    query: "deductible",
    filters: { contentTypes: ["file"] }
  });
  assert.equal(fileResults.length, 1);

  const audioResults = await manager.search({
    userId: "user-fixture",
    query: "claim form",
    filters: { contentTypes: ["audio"] }
  });
  assert.equal(audioResults.length, 1);
});

test("understands text, audio, and video context without requiring cloud providers", async () => {
  const text = understandRawContext({
    sourceType: "recommendation_input",
    contentType: "text",
    text: "My mother is 72, has hypertension, will stay in WA for 60 days, and wants PPO direct billing."
  });
  assert.equal(text.ok, true);
  assert.equal(text.sourceType, "recommendation_input");
  assert.ok(text.tags.includes("senior"));
  assert.ok(text.tags.includes("pre_existing"));
  assert.ok(text.tags.includes("network_billing"));
  assert.deepEqual(text.structuredData.ages, [72]);
  assert.equal(text.structuredData.durationDays, 60);

  const audio = understandRawContext({ sourceType: "audio_transcript", contentType: "audio" });
  assert.equal(audio.understandingStatus, "needs_transcription");
  assert.ok(audio.tags.includes("needs_transcription"));

  const audioWithTranscript = understandRawContext({
    sourceType: "audio_transcript",
    contentType: "audio",
    transcript: "My father is 76 and needs direct billing for urgent care."
  });
  assert.equal(audioWithTranscript.understandingStatus, "parsed");
  assert.ok(audioWithTranscript.tags.includes("senior"));

  const video = understandRawContext({
    sourceType: "video_summary",
    contentType: "video",
    transcript: "The policy mentions claim deadline and itemized bill requirements."
  });
  assert.equal(video.understandingStatus, "parsed");
  assert.ok(video.tags.includes("claim_preparation"));

  const videoMetadataOnly = understandRawContext({
    sourceType: "video_summary",
    contentType: "video",
    rawData: { fileName: "parent-trip-call.mp4", mimeType: "video/mp4" }
  });
  assert.equal(videoMetadataOnly.understandingStatus, "needs_transcription");
  assert.ok(videoMetadataOnly.tags.includes("needs_transcription"));

  const image = understandRawContext({
    sourceType: "document_upload",
    content: [{ type: "image", name: "insurance-card.png", mimeType: "image/png", url: "s3://bucket/card.png" }]
  });
  assert.equal(image.understandingStatus, "needs_visual_analysis");
  assert.ok(image.tags.includes("needs_visual_analysis"));

  const file = understandRawContext({
    sourceType: "document_upload",
    content: [{ type: "file", name: "policy.pdf", mimeType: "application/pdf", url: "s3://bucket/policy.pdf" }]
  });
  assert.equal(file.understandingStatus, "needs_text_extraction");
  assert.ok(file.tags.includes("needs_text_extraction"));
});

test("builds user profile prompts with confirmed context prioritized", async () => {
  const manager = createContextManager();
  const inferred = await manager.add({
    userId: "prompt-user",
    memory: "AI inferred a low deductible preference.",
    category: "profile_patch",
    confidence: 0.95,
    metadata: { userConfirmed: false }
  });
  const confirmed = await manager.add({
    userId: "prompt-user",
    memory: "User confirmed the traveler is 72 and has hypertension.",
    category: "profile_patch",
    confidence: 0.7,
    metadata: { userConfirmed: true }
  });

  const prompt = await manager.buildUserProfilePrompt({
    userId: "prompt-user",
    profile: { travelerAges: [72] },
    question: "What insurance type should I compare?",
    language: "en"
  });
  assert.equal(prompt.confirmedContextCount, 1);
  assert.equal(prompt.usedContextIds[0], confirmed.id);
  assert.ok(prompt.usedContextIds.includes(inferred.id));
  assert.match(prompt.prompt, /confirmed the traveler is 72/);

  const direct = buildUserProfilePrompt({ profile: { id: "u1" }, contexts: [confirmed], question: "test" });
  assert.equal(direct.contextCount, 1);
});

test("builds context summary prompts and normalizes LLM summary output", async () => {
  const manager = createContextManager();
  const inferred = await manager.add({
    userId: "summary-user",
    memory: "AI inferred the traveler may prefer a high maximum.",
    category: "profile_patch",
    confidence: 0.9,
    metadata: { userConfirmed: false }
  });
  const confirmed = await manager.add({
    userId: "summary-user",
    memory: "User confirmed father is 72, has hypertension, and will stay 60 days in Washington.",
    category: "profile_patch",
    confidence: 0.75,
    metadata: { userConfirmed: true }
  });

  const prompt = await manager.buildContextSummaryPrompt({
    userId: "summary-user",
    profile: { travelerAges: [72] },
    maxContexts: 10
  });
  assert.equal(prompt.confirmedContextCount, 1);
  assert.equal(prompt.usedContextIds[0], confirmed.id);
  assert.ok(prompt.usedContextIds.includes(inferred.id));
  assert.match(prompt.prompt, /Return strict JSON only/);

  const directPrompt = buildContextSummaryPrompt({
    profile: {},
    contexts: [confirmed],
    extraInstructions: "Only propose pending patches."
  });
  assert.equal(directPrompt.contextCount, 1);
  assert.match(directPrompt.prompt, /Only propose pending patches/);

  const normalized = normalizeContextSummaryResult("```json\n{\"summary\":\"Senior visitor with chronic condition.\",\"profilePatch\":{\"travelerAges\":[72]},\"tags\":[\"senior\"],\"confidence\":\"high\",\"sourceContextIds\":[\"" + confirmed.id + "\"],\"manualReviewRequired\":true}\n```");
  assert.equal(normalized.ok, true);
  assert.equal(normalized.confidence, "high");
  assert.equal(normalized.profilePatch.travelerAges[0], 72);
  assert.equal(normalized.sourceContextIds[0], confirmed.id);

  const fallback = normalizeContextSummaryResult("not json", { fallbackText: "Plain text summary" });
  assert.equal(fallback.ok, false);
  assert.equal(fallback.confidence, "low");
  assert.equal(fallback.manualReviewRequired, true);
  assert.equal(fallback.summary, "Plain text summary");
});

test("buildContext returns lifecycle, recent messages, memory results, and diagnostics", async () => {
  const manager = createContextManager({ maxMemories: 2 });
  await manager.add({ userId: "user-2", memory: "Uploaded Patriot America Plus policy.", category: "policy" });
  await manager.add({ userId: "user-2", memory: "Prefers urgent care over ER for non-emergency visits.", category: "care" });

  const built = await manager.buildContext({
    userId: "user-2",
    query: "policy urgent care",
    recentMessages: Array.from({ length: 20 }, (_, index) => ({ role: "user", text: `message ${index}` })),
    lifecycle: { uploadedPolicies: ["policy-1"], emptyList: [] }
  });

  assert.equal(built.context.memories.length, 2);
  assert.equal(built.context.recentMessages.length, 12);
  assert.deepEqual(built.diagnostics.lifecycleSections, ["uploadedPolicies"]);
});

test("chat workflow helpers normalize memory extraction and bounded context", async () => {
  const config = normalizeContextConfig({
    maxMemories: 1,
    recentMessageLimit: 2,
    recentMessageChars: 16,
    memoryTextChars: 28
  });
  const fallbackMemory = normalizeExtractedMemory(null, "Need PPO and urgent care advice", "Check network wording carefully.", config);
  assert.equal(fallbackMemory.shouldRemember, true);
  assert.equal(fallbackMemory.category, "chat");
  assert.match(fallbackMemory.text, /^User: Need PPO/);

  const explicitMemory = normalizeExtractedMemory(
    { shouldRemember: false, text: "Do not store this.", category: "temporary", confidence: 0.91 },
    "",
    "",
    config
  );
  assert.equal(explicitMemory.shouldRemember, false);
  assert.equal(explicitMemory.category, "chat");
  assert.equal(explicitMemory.confidence, 0.91);

  const manager = createContextManager({ maxMemories: 3 });
  await manager.add({ userId: "workflow-user", memory: "Traveler needs direct billing and PPO.", category: "preference" });
  await manager.add({ userId: "workflow-user", memory: "Traveler uploaded policy documents.", category: "policy" });

  const result = await buildBoundedChatContext({
    manager,
    userId: "workflow-user",
    query: "PPO policy",
    language: "en",
    lifecycle: { uploadedPolicies: ["p1"], empty: [] },
    recentMessages: [
      { role: "user", text: "first message that should be dropped" },
      { role: "assistant", text: "second message is very long and should be trimmed" },
      { role: "user", text: "third message" }
    ],
    config
  });

  assert.equal(result.context.recentMessages.length, 2);
  assert.equal(result.context.memories.length, 1);
  assert.equal(result.context.sessionSummary, null);
  assert.equal(result.context.language, "en");
  assert.equal(result.context.contextInjectionStrategy.type, "bounded_local_context");
  assert.equal(result.diagnostics.provider, "context_manager");
  assert.deepEqual(result.diagnostics.lifecycleSections, ["uploadedPolicies", "empty"]);
  assert.equal(typeof result.diagnostics.latencyMs.retrieval, "number");
  assert.equal(result.memoryIds.length, 1);
});

test("chat workflow exposes context types, adapters, confirmed priority, summaries, and fallback diagnostics", async () => {
  assert.ok(CONTEXT_TYPES.includes("policy_analysis"));
  assert.ok(CONTEXT_TYPES.includes("audio_transcript"));
  assert.ok(CONTEXT_TYPES.includes("video_summary"));
  assert.ok(CONTEXT_TYPES.includes("document_upload"));
  assert.ok(CONTEXT_TYPES.includes("growth_outcome"));
  assert.ok(CONTEXT_TYPES.includes("connector_event"));
  assert.equal(normalizeContextType("conversation"), "chat");
  assert.equal(normalizeContextType("offer"), "offer_memory");
  assert.equal(normalizeContextType("audio"), "audio_transcript");
  assert.equal(normalizeContextType("video"), "video_summary");
  assert.ok(listContextProviderAdapters().some((adapter) => adapter.id === "gemini_embedding"));

  const manager = createContextManager({ maxMemories: 5 });
  await manager.add({
    userId: "priority-user",
    memory: "AI inferred the traveler may prefer a low deductible.",
    category: "profile_patch",
    confidence: 0.95,
    metadata: { source: "ai_inferred", userConfirmed: false }
  });
  await manager.add({
    userId: "priority-user",
    memory: "User confirmed the traveler has chronic hypertension.",
    category: "profile_patch",
    confidence: 0.7,
    metadata: { source: "user_confirmation", userConfirmed: true }
  });

  const result = await buildBoundedChatContext({
    manager,
    userId: "priority-user",
    query: "traveler profile",
    recentMessages: Array.from({ length: 7 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `message ${index}` })),
    config: { maxMemories: 5, recentMessageLimit: 2, summaryProvider: "local" }
  });

  assert.equal(result.context.memories[0].userConfirmed, true);
  assert.equal(result.diagnostics.confirmedMemoryCount, 1);
  assert.equal(result.diagnostics.inferredMemoryCount, 1);
  assert.equal(result.diagnostics.sessionSummaryGenerated, true);
  assert.equal(result.context.sessionSummary.sourceMessageCount, 5);

  const summary = buildSessionSummary(Array.from({ length: 4 }, (_, index) => ({ text: `older ${index}` })), {
    recentMessageLimit: 1,
    summaryProvider: "local"
  });
  assert.equal(summary.type, "session_summary");

  const fallback = await buildBoundedChatContext({
    manager: { buildContext: async () => { throw new Error("temporary retrieval outage"); } },
    userId: "fallback-user",
    query: "anything",
    recentMessages: [{ role: "user", text: "hello" }],
    config: { maxMemories: 3 }
  });
  assert.equal(fallback.diagnostics.fallback, true);
  assert.equal(fallback.context.memories.length, 0);
  assert.equal(fallback.context.recentMessages.length, 1);
  assert.match(fallback.diagnostics.errors.retrieval, /temporary retrieval outage/);
});

test("storage contract preserves workspace, subject, tags, retention, and importance", async () => {
  const manager = createContextManager();
  const saved = await manager.add({
    workspaceId: "workspace-1",
    tenantId: "tenant-a",
    userId: "commerce-user",
    memory: "LinkedIn offer won two qualified calls at $299 starter package.",
    category: "growth_outcome",
    source: "outcome_tracker",
    subjectType: "offer",
    subjectId: "offer-123",
    importance: 0.91,
    retention: "long_term",
    expiresAt: "2026-12-31T00:00:00.000Z",
    tags: ["linkedin", "starter"],
    dedupeKey: "workspace-1:offer-123:win"
  });

  assert.equal(saved.workspaceId, "workspace-1");
  assert.equal(saved.tenantId, "tenant-a");
  assert.equal(saved.category, "growth_outcome");
  assert.equal(saved.source, "outcome_tracker");
  assert.equal(saved.subjectType, "offer");
  assert.equal(saved.subjectId, "offer-123");
  assert.equal(saved.importance, 0.91);
  assert.equal(saved.retention, "long_term");
  assert.deepEqual(saved.tags, ["linkedin", "starter"]);

  const filtered = await manager.search({
    userId: "commerce-user",
    query: "qualified calls",
    filters: {
      workspaceId: "workspace-1",
      tenantId: "tenant-a",
      source: "outcome_tracker",
      subjectType: "offer",
      subjectId: "offer-123",
      tags: ["linkedin"]
    }
  });
  assert.equal(filtered.length, 1);

  const updated = await manager.update({
    userId: "commerce-user",
    id: saved.id,
    memory: "LinkedIn offer won three qualified calls.",
    importance: 0.96,
    tags: ["linkedin", "proven"]
  });
  assert.equal(updated.importance, 0.96);
  assert.deepEqual(updated.tags, ["linkedin", "proven"]);
});

test("context event normalizer turns connector and outcome events into memories", () => {
  const event = normalizeContextEvent({
    workspaceId: "workspace-1",
    userId: "growth-user",
    eventType: "stripe.order.paid",
    source: "stripe",
    subjectType: "offer",
    subjectId: "offer-1",
    title: "Starter package paid",
    summary: "Customer paid for the first revenue starter offer.",
    outcome: "win",
    tags: ["paid", "starter"]
  });

  assert.equal(event.category, "growth_outcome");
  assert.equal(event.importance >= 0.8, true);
  assert.match(event.dedupeKey, /workspace-1:growth-user:stripe:stripe\.order\.paid/);

  const memory = contextEventToMemory(event);
  assert.equal(memory.category, "growth_outcome");
  assert.equal(memory.source, "stripe");
  assert.equal(memory.subjectId, "offer-1");
  assert.match(memory.memory, /Starter package paid/);
  assert.equal(memory.metadata.outcome, "win");

  const connector = normalizeContextEvent({
    userId: "growth-user",
    eventType: "shopify.draft.created",
    source: "shopify",
    subjectType: "product",
    subjectId: "product-1"
  });
  assert.equal(connector.category, "connector_event");
});

test("context pack builders create task, decision, and connector packs", async () => {
  const manager = createContextManager();
  await manager.add({
    userId: "pack-user",
    memory: "Offer won on LinkedIn with a $299 starter package.",
    category: "growth_outcome",
    confidence: 0.9,
    source: "outcome_tracker",
    subjectType: "offer",
    subjectId: "offer-1"
  });
  await manager.add({
    userId: "pack-user",
    memory: "Compliance review rejected exaggerated income claims.",
    category: "compliance_memory",
    confidence: 0.8,
    source: "review"
  });
  await manager.add({
    userId: "pack-user",
    memory: "Shopify draft was created for the service package.",
    category: "connector_event",
    source: "shopify",
    subjectType: "offer",
    subjectId: "offer-1"
  });
  await manager.add({
    userId: "pack-user",
    memory: "Strategy was rejected after attracting unqualified leads.",
    category: "strategy_signal",
    source: "strategy_card",
    subjectType: "offer",
    subjectId: "offer-1"
  });

  const taskPack = await buildTaskContextPack({
    manager,
    userId: "pack-user",
    objective: "Create next best offer",
    subjectType: "offer",
    subjectId: "offer-1",
    query: "offer LinkedIn Shopify compliance"
  });
  assert.equal(taskPack.type, "task_context_pack");
  assert.equal(taskPack.subject.id, "offer-1");
  assert.equal(taskPack.risks.length, 1);
  assert.equal(taskPack.signals.length >= 1, true);

  const decisionPack = await buildDecisionContextPack({
    manager,
    userId: "pack-user",
    decision: "Publish a Shopify draft",
    query: "offer LinkedIn rejected Shopify"
  });
  assert.equal(decisionPack.type, "decision_context_pack");
  assert.equal(decisionPack.negativeSignals.length >= 1, true);
  assert.equal(decisionPack.explainabilityInputs.riskCount, 1);

  const connectorPack = await buildConnectorContextPack({
    manager,
    userId: "pack-user",
    connector: "shopify",
    query: "Shopify draft"
  });
  assert.equal(connectorPack.type, "connector_context_pack");
  assert.equal(connectorPack.executionGuardrails.draftFirst, true);
  assert.equal(connectorPack.priorConnectorEvents.length, 1);
});

test("domain plugins register commerce growth behavior and build prompts", () => {
  const manager = createContextManager({ domainPlugins: [commerceGrowthPlugin()] });
  const status = manager.status();
  assert.equal(status.domainPlugins.importanceScorerCount, 1);
  assert.ok(status.domainPlugins.contextTypes.some((type) => type.id === "offer_memory"));

  const score = manager.scoreImportance({ eventType: "order.paid", outcome: "win" });
  assert.equal(score > 0.8, true);

  const prompt = manager.buildPluginPrompt("commerce_growth_decision", {
    objective: "Choose best first revenue channel",
    pack: {
      subject: { type: "offer", id: "offer-1" },
      positiveSignals: [{ text: "LinkedIn produced qualified calls." }],
      negativeSignals: [{ text: "TikTok produced unqualified leads." }]
    }
  });
  assert.match(prompt, /draft-first decision/);
  assert.match(prompt, /LinkedIn produced/);
});

test("LLM provider contract safely wraps extract, summarize, and embed hooks", async () => {
  const contract = createLlmContextProviderContract({
    id: "test-llm",
    extractMemory: async () => ({ ok: true, memory: "Remember accepted offer.", category: "offer_memory" }),
    summarizeContext: () => ({ ok: true, summary: "User has a proven LinkedIn starter offer." }),
    embedText: () => ({ ok: true, embedding: [0.1, 0.2, 0.3] })
  });

  assert.equal(contract.status().provider, "test-llm");
  assert.equal((await contract.extractMemory({ text: "accepted" })).category, "offer_memory");
  assert.match((await contract.summarizeContext({})).summary, /LinkedIn/);
  assert.deepEqual((await contract.embedText({ text: "offer" })).embedding, [0.1, 0.2, 0.3]);

  const empty = createLlmContextProviderContract();
  assert.equal((await empty.extractMemory()).ok, false);
});

test("blocks Mem0 Cloud endpoints and allows localhost self-hosted endpoints", () => {
  assert.throws(
    () => validateSelfHostedUrl("https://api.mem0.ai"),
    /blocked/i
  );
  assert.throws(
    () => new Mem0OssProvider({ baseUrl: "https://api.mem0.ai" }),
    /blocked/i
  );
  assert.equal(validateSelfHostedUrl("http://127.0.0.1:8888").hostname, "127.0.0.1");
});

test("mem0_oss_self_hosted provider can test a local endpoint without becoming the source of truth", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ ok: true, service: "mem0-oss-test" }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const manager = createContextManager({
      provider: "mem0_oss_self_hosted",
      mem0: { baseUrl: `http://127.0.0.1:${port}` },
      localFirst: true,
      externalSync: false
    });
    const testResult = await manager.testProvider();
    assert.equal(testResult.ok, true);

    await manager.add({ userId: "user-3", memory: "Local-first memory remains local." });
    const results = await manager.search({ userId: "user-3", query: "local-first" });
    assert.equal(results.length, 1);
    assert.equal(results[0].provider, "local_context_manager");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("clear removes only the selected user's memories", async () => {
  const manager = createContextManager();
  await manager.add({ userId: "user-a", memory: "A memory" });
  await manager.add({ userId: "user-b", memory: "B memory" });

  assert.equal(await manager.clear({ userId: "user-a" }), 1);
  assert.equal((await manager.list({ userId: "user-a" })).length, 0);
  assert.equal((await manager.list({ userId: "user-b" })).length, 1);
});
