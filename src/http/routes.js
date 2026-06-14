function createContextManagerHandlers(manager, options = {}) {
  const getUserId = options.getUserId || ((req) => req.user?.id || req.auth?.user?.id || req.body?.userId || req.query?.userId);
  const requireAuth = options.requireAuth || ((req, res, next) => next());
  const requireAdmin = options.requireAdmin || ((req, res, next) => next());

  return {
    mount(app, basePath = "/api/context-manager") {
      app.get(`${basePath}/status`, requireAdmin, asyncHandler(async (_req, res) => res.json({ ok: true, status: manager.status() })));
      app.post(`${basePath}/provider/test`, requireAdmin, asyncHandler(async (req, res) => res.json(await manager.testProvider(req.body || {}))));
      app.get(`${basePath}/memories`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const memories = await manager.list({ userId, limit: Number(req.query.limit || 50) });
        res.json({ ok: true, memories });
      }));
      app.post(`${basePath}/memories`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const memory = await manager.add({ ...(req.body || {}), userId });
        res.json({ ok: true, memory });
      }));
      app.post(`${basePath}/memories/search`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const results = await manager.search({ ...(req.body || {}), userId });
        res.json({ ok: true, results, memories: results });
      }));
      app.get(`${basePath}/memories/:id`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const memory = await manager.get({ userId, id: req.params.id });
        if (!memory) return res.status(404).json({ error: "Memory not found" });
        res.json({ ok: true, memory });
      }));
      app.put(`${basePath}/memories/:id`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const memory = await manager.update({ ...(req.body || {}), userId, id: req.params.id });
        if (!memory) return res.status(404).json({ error: "Memory not found" });
        res.json({ ok: true, memory });
      }));
      app.delete(`${basePath}/memories/:id`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const deleted = await manager.delete({ userId, id: req.params.id });
        if (!deleted) return res.status(404).json({ error: "Memory not found" });
        res.json({ ok: true, deletedCount: 1 });
      }));
      app.delete(`${basePath}/memory`, requireAuth, asyncHandler(async (req, res) => {
        const userId = requireUserId(getUserId(req));
        const deletedCount = await manager.clear({ userId });
        res.json({ ok: true, deletedCount });
      }));
    }
  };
}

function requireUserId(value) {
  const userId = String(value || "").trim();
  if (!userId) {
    const error = new Error("Authenticated user id is required");
    error.statusCode = 401;
    throw error;
  }
  return userId;
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { createContextManagerHandlers };
