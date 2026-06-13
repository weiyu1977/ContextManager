# Context Manager

Provider-pluggable, local-first context and memory manager for LLM applications.

The package is designed for products that need user-scoped context across chat, files, images, audio, video, policy documents, recommendations, tasks, and other lifecycle records.

## Providers

The current providers are intentionally explicit:

- `local_context_manager`: default provider. Durable memory is stored in your own storage adapter.
- `mem0_oss_self_hosted`: optional provider for a self-hosted Mem0 OSS service. Mem0 Cloud endpoints are blocked by default.

## Install

```bash
npm install github:weiyu1977/ContextManager
```

## Quick Start

```js
const { createContextManager } = require("@richai/context-manager");

const manager = createContextManager();

await manager.add({
  userId: "user-1",
  memory: "Traveler prefers PPO/direct billing.",
  category: "preference"
});

const results = await manager.search({
  userId: "user-1",
  query: "PPO billing",
  limit: 5
});
```

## Multimodal Context

`content` accepts multiple content item types:

- `text`
- `markdown`
- `html`
- `json`
- `image`
- `audio`
- `video`
- `file`

Example:

```js
await manager.add({
  userId: "user-1",
  category: "policy",
  content: [
    {
      type: "file",
      name: "policy.pdf",
      mimeType: "application/pdf",
      text: "Extracted or OCR text can be stored here."
    },
    {
      type: "image",
      name: "insurance-card-front.png",
      mimeType: "image/png",
      url: "s3://bucket/card.png",
      description: "Insurance card front image"
    }
  ]
});
```

## API Semantics

The package exposes memory-service style methods:

- `add`
- `search`
- `get`
- `list`
- `delete`
- `clear`
- `buildContext`
- `status`
- `testProvider`

Express-compatible handlers can expose:

```txt
GET    /api/context-manager/status
POST   /api/context-manager/provider/test
GET    /api/context-manager/memories
POST   /api/context-manager/memories
POST   /api/context-manager/memories/search
GET    /api/context-manager/memories/:id
DELETE /api/context-manager/memories/:id
DELETE /api/context-manager/memory
```

Your host application should add authentication, authorization, CSRF, audit logging, data export, and deletion policies.

## Mem0 OSS

Mem0 OSS is optional and must be self-hosted:

```js
const manager = createContextManager({
  provider: "mem0_oss_self_hosted",
  localFirst: true,
  externalSync: false,
  mem0: {
    baseUrl: "http://127.0.0.1:8888",
    apiKey: process.env.MEM0_OSS_API_KEY
  }
});
```

`localFirst: true` keeps local storage as the source of truth. `externalSync` is disabled by default.

Blocked by default:

- `https://api.mem0.ai`
- `*.mem0.ai`

Allowed by default:

- localhost
- private network hosts
- `.local`
- `.internal`

## Storage Adapter

The default storage is in-memory and intended for tests or demos. Production applications should provide a storage adapter:

```js
const storage = {
  async add(item) {},
  async get({ userId, id }) {},
  async list({ userId, limit }) {},
  async delete({ userId, id }) {},
  async clear({ userId }) {},
  async logEvent(event) {}
};
```

## Design Principles

- Local-first durable memory.
- Provider switchable.
- No hidden cloud memory dependency.
- Multimodal context schema from day one.
- Host app owns auth, permissions, encryption, audit, retention, export, and delete workflows.
- External LLM or embedding calls must be optional and fail-open.
