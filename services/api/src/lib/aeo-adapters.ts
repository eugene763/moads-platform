import {PlatformError} from "@moads/db";

import {ApiConfig} from "../types.js";

export type AeoAdapterMode = "mock" | "live";

export interface AeoAiTipItem {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  category: "schema" | "content" | "technical" | "trust";
}

export interface AeoAiTipsResult {
  tips: AeoAiTipItem[];
  providerCode: string;
  modelCode: string;
  internalCostMinor: number;
}

export interface AeoGaSnapshot {
  source: "ga4";
  mode: AeoAdapterMode;
  collectedAt: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
  aiAttributedSessions: number;
  aiSources: Array<{source: string; sessions: number}>;
}

export interface AeoRealtimeSnapshot {
  source: "realtime";
  mode: AeoAdapterMode;
  collectedAt: string;
  mentionCount: number;
  citationCount: number;
  engines: Array<{engine: string; visibilityScore: number; mentions: number}>;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function pickPriority(index: number): AeoAiTipItem["priority"] {
  if (index === 0) {
    return "high";
  }
  if (index === 1) {
    return "medium";
  }
  return "low";
}

function buildMockTips(scanSummary: string): AeoAiTipItem[] {
  const normalized = scanSummary.toLowerCase();
  const tips: AeoAiTipItem[] = [];

  if (normalized.includes("aggregate_rating_missing")) {
    tips.push({
      title: "Add Product + AggregateRating JSON-LD",
      detail: "Publish JSON-LD with ratingValue plus reviewCount or ratingCount directly on product pages.",
      priority: "high",
      category: "schema",
    });
  }

  if (normalized.includes("aggregate_visible_mismatch")) {
    tips.push({
      title: "Align visible ratings and schema",
      detail: "Keep the same rating value and count in the UI and in JSON-LD to avoid citation trust loss.",
      priority: tips.length === 0 ? "high" : "medium",
      category: "trust",
    });
  }

  if (normalized.includes("canonical_missing")) {
    tips.push({
      title: "Add canonical URL",
      detail: "Set a canonical tag per product page variant so discovery signals consolidate on one URL.",
      priority: tips.length === 0 ? "high" : "medium",
      category: "technical",
    });
  }

  if (tips.length < 3) {
    const defaults: Omit<AeoAiTipItem, "priority">[] = [
      {
        title: "Add concise FAQ section",
        detail: "Short Q&A blocks help AI systems extract direct answers and improve product recommendation context.",
        category: "content",
      },
      {
        title: "Strengthen trust evidence",
        detail: "Surface shipping, return, and warranty facts near price and ratings to improve answer confidence.",
        category: "trust",
      },
      {
        title: "Improve title and meta description",
        detail: "Use clear product identifiers and key differentiators for cleaner snippet extraction.",
        category: "content",
      },
    ];

    for (const fallback of defaults) {
      if (tips.length >= 3) {
        break;
      }
      tips.push({...fallback, priority: pickPriority(tips.length)});
    }
  }

  return tips.slice(0, 3);
}

export interface AeoAiTipsAdapter {
  generateTips(input: {
    scanSummary: string;
    planCode: "free" | "starter";
  }): Promise<AeoAiTipsResult>;
}

export interface AeoGaAdapter {
  getSnapshot(input: {
    accountId: string;
    siteId?: string | null;
  }): Promise<AeoGaSnapshot>;
}

export interface AeoRealtimeAdapter {
  getSnapshot(input: {
    accountId: string;
    siteId?: string | null;
  }): Promise<AeoRealtimeSnapshot>;
}

class MockAeoAiTipsAdapter implements AeoAiTipsAdapter {
  async generateTips(input: {scanSummary: string; planCode: "free" | "starter"}): Promise<AeoAiTipsResult> {
    const tips = buildMockTips(input.scanSummary);
    return {
      tips,
      providerCode: "mock",
      modelCode: "rules_v1",
      internalCostMinor: input.planCode === "starter" ? 2 : 1,
    };
  }
}

class LiveAeoAiTipsAdapter implements AeoAiTipsAdapter {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ApiConfig) {
    if (!config.aeoOpenAiApiKey) {
      throw new PlatformError(500, "aeo_openai_key_missing", "AEO live AI mode requires OPENAI_API_KEY.");
    }
    this.apiKey = config.aeoOpenAiApiKey;
    this.model = config.aeoAiTipsModel;
  }

  async generateTips(input: {scanSummary: string; planCode: "free" | "starter"}): Promise<AeoAiTipsResult> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: "You are an AEO optimization assistant. Return concise JSON only.",
          },
          {
            role: "user",
            content: `Plan: ${input.planCode}. Analyze and return top 3 fixes as JSON array with keys title/detail/priority/category. Data: ${input.scanSummary}`,
          },
        ],
        max_output_tokens: 350,
        text: {
          format: {
            type: "json_schema",
            name: "aeo_tips",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["tips"],
              properties: {
                tips: {
                  type: "array",
                  minItems: 1,
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "detail", "priority", "category"],
                    properties: {
                      title: {type: "string"},
                      detail: {type: "string"},
                      priority: {type: "string", enum: ["high", "medium", "low"]},
                      category: {type: "string", enum: ["schema", "content", "technical", "trust"]},
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new PlatformError(502, "aeo_ai_provider_failed", "AI tips provider request failed.", {
        status: response.status,
        payload,
      });
    }

    const json = await response.json() as Record<string, unknown>;
    const outputText = typeof json.output_text === "string" ? json.output_text : "";
    let parsedTips = buildMockTips(input.scanSummary);

    if (outputText.trim()) {
      try {
        const parsed = JSON.parse(outputText) as {tips?: Array<Record<string, unknown>>};
        if (Array.isArray(parsed.tips) && parsed.tips.length > 0) {
          parsedTips = parsed.tips.slice(0, 3).map((tip, index) => ({
            title: typeof tip.title === "string" ? tip.title : `Recommendation ${index + 1}`,
            detail: typeof tip.detail === "string" ? tip.detail : "Apply this improvement to increase AI discoverability.",
            priority: tip.priority === "high" || tip.priority === "medium" || tip.priority === "low" ? tip.priority : pickPriority(index),
            category: tip.category === "schema" || tip.category === "content" || tip.category === "technical" || tip.category === "trust" ?
              tip.category :
              "content",
          }));
        }
      } catch {
        parsedTips = buildMockTips(input.scanSummary);
      }
    }

    return {
      tips: parsedTips,
      providerCode: "openai",
      modelCode: this.model,
      internalCostMinor: 4,
    };
  }
}

class MockAeoGaAdapter implements AeoGaAdapter {
  async getSnapshot(input: {accountId: string; siteId?: string | null}): Promise<AeoGaSnapshot> {
    const now = new Date();
    const bucket = `${input.accountId}:${input.siteId ?? "all"}:${now.toISOString().slice(0, 13)}`;
    const seed = hashString(bucket);
    const sessions = 80 + (seed % 220);
    const engagedSessions = Math.floor(sessions * (0.42 + (seed % 20) / 100));
    const conversions = Math.max(1, Math.floor(engagedSessions * 0.09));
    const aiAttributedSessions = Math.floor(sessions * (0.08 + (seed % 11) / 100));

    return {
      source: "ga4",
      mode: "mock",
      collectedAt: now.toISOString(),
      sessions,
      engagedSessions,
      conversions,
      aiAttributedSessions,
      aiSources: [
        {source: "chatgpt", sessions: Math.floor(aiAttributedSessions * 0.36)},
        {source: "perplexity", sessions: Math.floor(aiAttributedSessions * 0.24)},
        {source: "gemini", sessions: Math.floor(aiAttributedSessions * 0.2)},
        {source: "claude", sessions: Math.max(0, aiAttributedSessions - Math.floor(aiAttributedSessions * 0.8))},
      ],
    };
  }
}

class LiveAeoGaAdapter implements AeoGaAdapter {
  async getSnapshot(): Promise<AeoGaSnapshot> {
    throw new PlatformError(
      501,
      "aeo_ga4_live_not_configured",
      "GA4 live adapter module is scaffolded but credentials and property binding are not configured yet.",
    );
  }
}

class MockAeoRealtimeAdapter implements AeoRealtimeAdapter {
  async getSnapshot(input: {accountId: string; siteId?: string | null}): Promise<AeoRealtimeSnapshot> {
    const now = new Date();
    const minuteBucket = now.toISOString().slice(0, 16);
    const seed = hashString(`${input.accountId}:${input.siteId ?? "all"}:${minuteBucket}`);
    const mentionCount = 12 + (seed % 28);
    const citationCount = 4 + (seed % 14);

    return {
      source: "realtime",
      mode: "mock",
      collectedAt: now.toISOString(),
      mentionCount,
      citationCount,
      engines: [
        {
          engine: "chatgpt",
          visibilityScore: 45 + (seed % 35),
          mentions: Math.floor(mentionCount * 0.34),
        },
        {
          engine: "gemini",
          visibilityScore: 35 + (seed % 37),
          mentions: Math.floor(mentionCount * 0.25),
        },
        {
          engine: "perplexity",
          visibilityScore: 30 + (seed % 42),
          mentions: Math.floor(mentionCount * 0.2),
        },
        {
          engine: "claude",
          visibilityScore: 38 + (seed % 33),
          mentions: Math.max(1, mentionCount - Math.floor(mentionCount * 0.79)),
        },
      ],
    };
  }
}

class LiveAeoRealtimeAdapter implements AeoRealtimeAdapter {
  async getSnapshot(): Promise<AeoRealtimeSnapshot> {
    throw new PlatformError(
      501,
      "aeo_realtime_live_not_configured",
      "Realtime live adapter module is scaffolded but external provider credentials are not configured yet.",
    );
  }
}

export function createAeoAiTipsAdapter(config: ApiConfig): AeoAiTipsAdapter {
  return config.aeoAiTipsMode === "live" ? new LiveAeoAiTipsAdapter(config) : new MockAeoAiTipsAdapter();
}

export function createAeoGaAdapter(config: ApiConfig): AeoGaAdapter {
  return config.aeoGa4Mode === "live" ? new LiveAeoGaAdapter() : new MockAeoGaAdapter();
}

export function createAeoRealtimeAdapter(config: ApiConfig): AeoRealtimeAdapter {
  return config.aeoRealtimeMode === "live" ? new LiveAeoRealtimeAdapter() : new MockAeoRealtimeAdapter();
}
