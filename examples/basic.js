const { createContextManager } = require("../src");

async function main() {
  const manager = createContextManager();
  await manager.add({
    userId: "user-1",
    memory: "Traveler is visiting Seattle and prefers PPO/direct billing.",
    category: "preference"
  });
  await manager.add({
    userId: "user-1",
    content: [
      {
        type: "file",
        name: "sample-policy.pdf",
        mimeType: "application/pdf",
        text: "Policy maximum is $100,000. Deductible is $250."
      }
    ],
    category: "policy"
  });
  const results = await manager.search({ userId: "user-1", query: "PPO deductible", limit: 5 });
  console.log(results.map((item) => ({ id: item.id, category: item.category, memory: item.memory })));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
