const { normalizeContentItems, contentToSearchText } = require("./content");

const CONTEXT_SOURCE_TYPES = Object.freeze([
  "chat",
  "user_profile",
  "recommendation_input",
  "profile_patch",
  "policy_analysis",
  "provider_search",
  "file_summary",
  "audio_transcript",
  "video_summary",
  "document_upload",
  "manual_note"
]);

function normalizeContextSourceType(value, fallback = "chat") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (CONTEXT_SOURCE_TYPES.includes(normalized)) return normalized;
  if (normalized === "conversation" || normalized === "message") return "chat";
  if (normalized === "profile") return "user_profile";
  if (normalized === "recommendation") return "recommendation_input";
  if (normalized === "policy") return "policy_analysis";
  if (normalized === "audio") return "audio_transcript";
  if (normalized === "video") return "video_summary";
  return fallback;
}

function understandRawContext(input = {}, options = {}) {
  const sourceType = normalizeContextSourceType(input.sourceType || input.source || input.category, options.defaultSourceType || "chat");
  const content = normalizeContentItems(input.content || buildContentFromInput(input));
  const primaryContentType = normalizeContentType(input.contentType || content[0]?.type || "text");
  const directText = trimText(input.text || "", options.maxTextChars || 8000);
  const directTranscript = trimText(input.transcript || "", options.maxTextChars || 8000);
  const isAudioVideo = primaryContentType === "audio" || primaryContentType === "video";
  const mediaHasTranscript = Boolean(directText || directTranscript || contentHasTranscript(content));
  const needsExtraction = determineExtractionNeed(primaryContentType, content, directText, directTranscript);
  const rawDataText = needsExtraction ? "" : stringifyRawData(input.rawData);
  const normalizedText = trimText(directText || directTranscript || contentToSearchText(content) || rawDataText, options.maxTextChars || 8000);
  const parsedJson = parseJsonLike(input.rawData ?? input.text);
  const textForAnalysis = normalizedText || stringifyRawData(parsedJson);
  const analysis = analyzeInsuranceText(textForAnalysis);
  const needsTranscription = needsExtraction === "needs_transcription";
  const tags = uniqueStrings([
    sourceType,
    primaryContentType,
    ...analysis.tags,
    ...(needsExtraction ? [needsExtraction] : [])
  ]);
  const summary = needsExtraction
    ? buildExtractionSummary(primaryContentType, needsExtraction)
    : buildSummary(textForAnalysis, analysis, sourceType);

  return {
    ok: true,
    sourceType,
    contentType: primaryContentType,
    content,
    normalizedText: needsExtraction ? "" : textForAnalysis,
    transcript: input.transcript || (isAudioVideo && mediaHasTranscript ? textForAnalysis : ""),
    summary,
    tags,
    structuredData: {
      ...analysis.structuredData,
      rawJsonKeys: parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson) ? Object.keys(parsedJson).slice(0, 30) : []
    },
    confidence: needsExtraction ? 0.2 : analysis.confidence,
    userConfirmed: Boolean(input.userConfirmed || input.metadata?.userConfirmed),
    understandingStatus: needsExtraction || "parsed",
    diagnostics: {
      parser: "local_context_understanding_v1",
      transcriptionRequired: needsTranscription,
      extractionRequired: Boolean(needsExtraction),
      extractionType: needsExtraction || "",
      externalProviderUsed: false,
      textLength: needsExtraction ? 0 : textForAnalysis.length,
      tagCount: tags.length
    },
    metadata: {
      ...(input.metadata || {}),
      sourceType,
      contentType: primaryContentType
    }
  };
}

function contentHasTranscript(content) {
  return (Array.isArray(content) ? content : []).some((item) => {
    if (!item) return false;
    if (trimText(item.transcript || "")) return true;
    if ((item.type === "audio" || item.type === "video") && trimText(item.text || "")) return true;
    return false;
  });
}

function determineExtractionNeed(primaryContentType, content, directText, directTranscript) {
  const hasUsableText = Boolean(directText || directTranscript || contentHasSemanticText(content));
  if (hasUsableText) return "";
  if (primaryContentType === "audio" || primaryContentType === "video") return "needs_transcription";
  if (primaryContentType === "image") return "needs_visual_analysis";
  if (primaryContentType === "file") return "needs_text_extraction";
  return "";
}

function contentHasSemanticText(content) {
  return (Array.isArray(content) ? content : []).some((item) => {
    if (!item) return false;
    if (trimText(item.text || "")) return true;
    if (trimText(item.transcript || "")) return true;
    if ((item.type === "image" || item.type === "file") && trimText(item.description || "")) return true;
    return false;
  });
}

function buildExtractionSummary(primaryContentType, extractionNeed) {
  if (extractionNeed === "needs_transcription") {
    return `${primaryContentType} context received; transcription is required before semantic extraction.`;
  }
  if (extractionNeed === "needs_visual_analysis") {
    return "Image context received; visual analysis or OCR is required before semantic extraction.";
  }
  if (extractionNeed === "needs_text_extraction") {
    return "File context received; text extraction, OCR, or document understanding is required before semantic extraction.";
  }
  return `${primaryContentType} context received; additional extraction is required before semantic extraction.`;
}

function buildUserProfilePrompt({ profile = {}, contexts = [], question = "", language = "en", maxContexts = 8 } = {}) {
  const selected = preparePromptContexts(contexts, maxContexts);
  const prompt = [
    "You are given user context for an insurance decision-support assistant.",
    "Use confirmed user profile fields as facts. Treat inferred or unconfirmed context as tentative.",
    "Do not invent eligibility, price, PPO/network, or claim outcomes. Ask for provider confirmation when needed.",
    `Response language: ${language || "en"}.`,
    "",
    "User profile JSON:",
    JSON.stringify(profile || {}, null, 2),
    "",
    "Relevant context:",
    selected.length
      ? selected.map((item, index) => `${index + 1}. [${item.category || item.sourceType || "context"}${item.userConfirmed ? "; confirmed" : "; inferred"}] ${item.text || item.memory || item.summary || ""}`).join("\n")
      : "No stored context is available.",
    "",
    "User question:",
    String(question || "").trim() || "(none)",
    "",
    "Return concise guidance, cite which context items influenced the answer, and list any missing fields."
  ].join("\n");

  return {
    prompt,
    usedContextIds: selected.map((item) => item.id).filter(Boolean),
    profileSnapshot: profile || {},
    contextCount: selected.length,
    confirmedContextCount: selected.filter((item) => item.userConfirmed).length,
    diagnostics: {
      builder: "user_profile_prompt_v1",
      maxContexts,
      language
    }
  };
}

function buildContentFromInput(input) {
  if (input.text) return [{ type: "text", text: input.text }];
  if (input.transcript) return [{ type: input.contentType || "audio", transcript: input.transcript, text: input.transcript }];
  if (input.rawData !== undefined) return [{ type: "json", text: stringifyRawData(input.rawData), data: input.rawData }];
  return [];
}

function normalizeContentType(value) {
  const type = String(value || "text").trim().toLowerCase();
  if (["text", "markdown", "html", "json", "image", "audio", "video", "file"].includes(type)) return type;
  return "text";
}

function analyzeInsuranceText(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  const tags = [];
  const ages = extractAges(value);
  const durationDays = extractDurationDays(value);
  const riskSignals = [];
  const insuranceTerms = [];

  if (ages.some((age) => age >= 60)) add(tags, "senior"), riskSignals.push("senior");
  if (/pre[- ]?existing|acute onset|chronic|hypertension|diabetes|既往|慢病|高血压|糖尿病|长期用药/i.test(value)) {
    add(tags, "pre_existing");
    riskSignals.push("pre_existing_or_chronic");
  }
  if (/already in|arrived|currently in|已到|在美国|已经到/i.test(value)) add(tags, "already_in_us"), riskSignals.push("already_in_us");
  if (/er\b|emergency room|urgent care|急诊|急救/i.test(value)) add(tags, "urgent_or_er"), insuranceTerms.push("ER/urgent care");
  if (/hospital|surgery|icu|住院|手术/i.test(value)) add(tags, "hospital_surgery"), insuranceTerms.push("hospital/surgery");
  if (/ambulance|evacuation|medical transport|救护车|医疗运送/i.test(value)) add(tags, "transport"), insuranceTerms.push("ambulance/evacuation");
  if (/claim|itemized bill|receipt|deadline|理赔|账单|收据|期限/i.test(value)) add(tags, "claim_preparation"), insuranceTerms.push("claim documentation");
  if (/ppo|network|direct billing|provider network|网络|直付/i.test(value)) add(tags, "network_billing"), insuranceTerms.push("PPO/network/direct billing");
  if (/policy maximum|deductible|coinsurance|out[- ]of[- ]pocket|保额|免赔|共同保险/i.test(value)) add(tags, "financial_terms"), insuranceTerms.push("maximum/deductible/coinsurance");
  if (/pregnan|maternity|怀孕|产科/i.test(value)) add(tags, "pregnancy_maternity"), riskSignals.push("pregnancy_or_maternity");
  if (/national park|road trip|driv|rental car|自驾|租车|国家公园/i.test(value)) add(tags, "road_trip"), riskSignals.push("road_trip_or_vehicle_injury");
  if (/cruise|邮轮/i.test(value)) add(tags, "cruise");

  return {
    tags,
    structuredData: {
      ages,
      durationDays,
      riskSignals: uniqueStrings(riskSignals),
      insuranceTerms: uniqueStrings(insuranceTerms),
      mentionedLocations: extractLikelyLocations(value)
    },
    confidence: lower || ages.length || tags.length ? Math.min(0.9, 0.45 + tags.length * 0.06 + ages.length * 0.05) : 0.25
  };
}

function extractAges(text) {
  const ages = new Set();
  for (const match of String(text || "").matchAll(/\b(1[89]|[2-9]\d|10\d)\b/g)) {
    const after = String(text || "").slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 16);
    if (/^\s*(day|days|天|日|month|months|个月)\b/i.test(after)) continue;
    const age = Number(match[1]);
    if (age >= 18 && age <= 110) ages.add(age);
  }
  for (const match of String(text || "").matchAll(/(\d{2,3})\s*(?:岁|yrs?|years?\s*old)/gi)) {
    const age = Number(match[1]);
    if (age >= 18 && age <= 110) ages.add(age);
  }
  return [...ages].sort((a, b) => a - b);
}

function extractDurationDays(text) {
  const value = String(text || "");
  const match = value.match(/(\d+)\s*(day|days|天|日|month|months|个月)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return /month|个月/i.test(match[2]) ? amount * 30 : amount;
}

function extractLikelyLocations(text) {
  const known = ["CA", "WA", "NY", "TX", "FL", "California", "Washington", "Seattle", "Bellevue", "Los Angeles", "New York", "China", "India", "US", "USA"];
  return known.filter((item) => new RegExp(`\\b${escapeRegExp(item)}\\b`, "i").test(text));
}

function preparePromptContexts(contexts, maxContexts) {
  return [...(Array.isArray(contexts) ? contexts : [])]
    .map((item) => ({
      ...item,
      text: item.text || item.memory || item.summary || item.metadata?.summary || "",
      userConfirmed: Boolean(item.userConfirmed || item.metadata?.userConfirmed),
      confidence: Number(item.confidence ?? item.metadata?.confidence ?? 0)
    }))
    .filter((item) => item.text)
    .sort((a, b) => Number(b.userConfirmed) - Number(a.userConfirmed) || (b.confidence || 0) - (a.confidence || 0))
    .slice(0, Number(maxContexts) || 8);
}

function buildSummary(text, analysis, sourceType) {
  const clean = trimText(String(text || "").replace(/\s+/g, " "), 260);
  if (!clean) return `${sourceType} context stored.`;
  const prefix = analysis.tags.length ? `Detected ${analysis.tags.slice(0, 5).join(", ")}. ` : "";
  return `${prefix}${clean}`;
}

function parseJsonLike(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function stringifyRawData(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function trimText(value, maxChars) {
  const text = String(value || "");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function add(list, value) {
  if (!list.includes(value)) list.push(value);
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  CONTEXT_SOURCE_TYPES,
  normalizeContextSourceType,
  understandRawContext,
  buildUserProfilePrompt
};
