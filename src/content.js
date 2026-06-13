const crypto = require("node:crypto");

const supportedContentTypes = new Set([
  "text",
  "markdown",
  "html",
  "json",
  "image",
  "audio",
  "video",
  "file"
]);

function normalizeContentItems(input = {}) {
  if (Array.isArray(input)) return input.flatMap((item) => normalizeOneContentItem(item));
  if (Array.isArray(input.content)) return input.content.flatMap((item) => normalizeOneContentItem(item));
  if (Array.isArray(input.messages)) {
    return input.messages.map((message) => normalizeOneContentItem({
      type: "text",
      text: `${message.role || "message"}: ${message.text || message.content || ""}`,
      metadata: { role: message.role || "" }
    }));
  }
  const text = input.memory || input.text || input.query || "";
  if (text) return [normalizeOneContentItem({ type: "text", text })];
  return [];
}

function normalizeOneContentItem(item = {}) {
  if (typeof item === "string") return [buildContentItem({ type: "text", text: item })];
  const type = normalizeContentType(item.type || inferContentType(item));
  if (!type) return [];
  return [buildContentItem({
    id: item.id,
    type,
    text: item.text || item.transcript || item.description || "",
    mimeType: item.mimeType || item.mimetype || "",
    name: item.name || item.fileName || "",
    url: item.url || "",
    data: item.data || item.base64 || "",
    size: item.size,
    checksum: item.checksum || "",
    metadata: item.metadata || {}
  })];
}

function buildContentItem(input) {
  const normalized = {
    id: input.id || `content-${crypto.randomUUID()}`,
    type: input.type,
    text: String(input.text || "").slice(0, 20000),
    mimeType: String(input.mimeType || ""),
    name: String(input.name || ""),
    url: String(input.url || ""),
    data: String(input.data || ""),
    size: input.size === undefined || input.size === null ? null : Number(input.size),
    checksum: String(input.checksum || ""),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
  if (!normalized.checksum) normalized.checksum = contentChecksum(normalized);
  return normalized;
}

function normalizeContentType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "txt") return "text";
  if (value === "md") return "markdown";
  if (value === "application/pdf" || value === "pdf") return "file";
  return supportedContentTypes.has(value) ? value : "";
}

function inferContentType(item = {}) {
  const mime = String(item.mimeType || item.mimetype || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("json")) return "json";
  if (mime.includes("html")) return "html";
  if (mime.includes("markdown")) return "markdown";
  if (item.url || item.fileName || item.name || item.data || item.base64) return "file";
  return "text";
}

function contentToSearchText(content = []) {
  return normalizeContentItems({ content }).map((item) => [
    item.type,
    item.name,
    item.mimeType,
    item.text,
    item.url,
    JSON.stringify(item.metadata || {})
  ].filter(Boolean).join(" ")).join("\n");
}

function contentChecksum(item) {
  const hash = crypto.createHash("sha256");
  hash.update(String(item.type || ""));
  hash.update("\n");
  hash.update(String(item.text || ""));
  hash.update("\n");
  hash.update(String(item.url || ""));
  hash.update("\n");
  hash.update(String(item.data || ""));
  return hash.digest("hex");
}

function normalizeMemoryInput(input = {}) {
  const content = normalizeContentItems(input);
  const text = input.memory || input.text || contentToSearchText(content);
  return {
    id: input.id || "",
    userId: String(input.userId || input.user_id || "").trim(),
    agentId: String(input.agentId || input.agent_id || "").trim(),
    runId: String(input.runId || input.run_id || input.sessionId || "").trim(),
    memory: String(text || "").trim().slice(0, 20000),
    content,
    categories: normalizeStringList(input.categories || input.category || "conversation"),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    confidence: input.confidence === undefined ? null : Number(input.confidence)
  };
}

function normalizeStringList(value) {
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20);
}

module.exports = {
  supportedContentTypes,
  normalizeContentItems,
  normalizeMemoryInput,
  contentToSearchText,
  normalizeStringList
};
