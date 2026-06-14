const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const {
  createContextManager,
  normalizeContentItems,
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
