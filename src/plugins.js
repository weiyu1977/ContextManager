class DomainPluginRegistry {
  constructor(plugins = []) {
    this.contextTypes = new Map();
    this.importanceScorers = [];
    this.promptBuilders = new Map();
    for (const plugin of plugins) this.registerPlugin(plugin);
  }

  registerPlugin(plugin = {}) {
    const id = plugin.id || `plugin-${this.contextTypes.size + 1}`;
    for (const type of plugin.contextTypes || []) {
      this.contextTypes.set(type.id || type, { id: type.id || type, pluginId: id, ...type });
    }
    if (typeof plugin.importanceScorer === "function") this.importanceScorers.push({ pluginId: id, score: plugin.importanceScorer });
    for (const builder of plugin.promptBuilders || []) {
      if (builder.id && typeof builder.build === "function") this.promptBuilders.set(builder.id, { pluginId: id, ...builder });
    }
    return this.status();
  }

  registerContextType(type) {
    if (!type) return this.status();
    this.contextTypes.set(type.id || type, { id: type.id || type, ...type });
    return this.status();
  }

  registerImportanceScorer(score) {
    if (typeof score === "function") this.importanceScorers.push({ pluginId: "manual", score });
    return this.status();
  }

  registerPromptBuilder(builder) {
    if (builder?.id && typeof builder.build === "function") this.promptBuilders.set(builder.id, { pluginId: "manual", ...builder });
    return this.status();
  }

  scoreImportance(event) {
    const scores = this.importanceScorers
      .map((item) => Number(item.score(event)))
      .filter((score) => Number.isFinite(score));
    if (!scores.length) return null;
    return Math.max(0, Math.min(1, Math.max(...scores)));
  }

  buildPrompt(id, input = {}) {
    const builder = this.promptBuilders.get(id);
    if (!builder) return null;
    return builder.build(input);
  }

  status() {
    return {
      contextTypes: [...this.contextTypes.values()],
      importanceScorerCount: this.importanceScorers.length,
      promptBuilders: [...this.promptBuilders.values()].map((item) => ({ id: item.id, pluginId: item.pluginId, label: item.label || item.id }))
    };
  }
}

function createDomainPluginRegistry(plugins = []) {
  return new DomainPluginRegistry(plugins);
}

function commerceGrowthPlugin() {
  const contextTypes = [
    ["connector_event", "External connector events such as OAuth, draft creation, webhooks and sync results."],
    ["strategy_signal", "Accepted, rejected or executed strategy recommendations."],
    ["growth_outcome", "Win, loss or neutral commercial outcome signal."],
    ["offer_memory", "Offer positioning, packaging, proof and objection memory."],
    ["channel_memory", "Channel performance and platform fit memory."],
    ["pricing_memory", "Price, package, discount and quote conversion memory."],
    ["delivery_memory", "Fulfillment, project, revision and delivery risk memory."],
    ["customer_memory", "Buyer persona, trigger, objection and segment memory."],
    ["compliance_memory", "Policy, claim, legal and platform-risk memory."],
    ["workflow_run", "Workflow execution trace and approval memory."],
    ["external_account", "Connected account, workspace or platform identity memory."],
    ["asset_performance", "Creative, video, page or ad asset performance memory."]
  ].map(([id, description]) => ({ id, label: id.replace(/_/g, " "), description }));
  return {
    id: "commerce_growth",
    contextTypes,
    importanceScorer(event = {}) {
      const value = `${event.eventType || ""} ${event.category || ""} ${event.outcome || ""}`.toLowerCase();
      if (/paid|order|win|conversion|checkout_completed/.test(value)) return 0.92;
      if (/loss|refund|chargeback|blocked|compliance|rejected/.test(value)) return 0.88;
      if (/executed|published|submitted|approved/.test(value)) return 0.76;
      if (/draft|viewed|synced/.test(value)) return 0.58;
      return 0.5;
    },
    promptBuilders: [
      {
        id: "commerce_growth_decision",
        label: "Commerce growth decision prompt",
        build(input = {}) {
          const pack = input.pack || {};
          return [
            "Use the commerce growth context below to make a draft-first decision.",
            `Objective: ${input.objective || pack.objective || ""}`,
            `Subject: ${JSON.stringify(pack.subject || {})}`,
            `Positive signals: ${(pack.positiveSignals || []).map((item) => item.text).join(" | ") || "none"}`,
            `Negative signals: ${(pack.negativeSignals || []).map((item) => item.text).join(" | ") || "none"}`,
            "Return: decision, why, risk, confidence, nextAction, rollbackWindow."
          ].join("\n");
        }
      }
    ]
  };
}

module.exports = {
  DomainPluginRegistry,
  createDomainPluginRegistry,
  commerceGrowthPlugin
};
