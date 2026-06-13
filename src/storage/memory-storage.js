class InMemoryStorage {
  constructor() {
    this.items = new Map();
    this.events = [];
  }

  async add(item) {
    this.items.set(item.id, { ...item });
    return { ...item };
  }

  async get({ userId, id }) {
    const item = this.items.get(id);
    if (!item || item.userId !== userId || item.status === "deleted") return null;
    return { ...item };
  }

  async list({ userId, limit = 50 }) {
    return [...this.items.values()]
      .filter((item) => item.userId === userId && item.status !== "deleted")
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async delete({ userId, id }) {
    const item = this.items.get(id);
    if (!item || item.userId !== userId || item.status === "deleted") return false;
    this.items.set(id, { ...item, status: "deleted", updatedAt: new Date().toISOString() });
    return true;
  }

  async clear({ userId }) {
    let count = 0;
    const now = new Date().toISOString();
    for (const [id, item] of this.items.entries()) {
      if (item.userId === userId && item.status !== "deleted") {
        this.items.set(id, { ...item, status: "deleted", updatedAt: now });
        count += 1;
      }
    }
    return count;
  }

  async logEvent(event) {
    this.events.push({ ...event, createdAt: event.createdAt || new Date().toISOString() });
  }

  async listEvents({ userId, limit = 50 }) {
    return this.events.filter((event) => event.userId === userId).slice(-limit).reverse();
  }
}

module.exports = { InMemoryStorage };
