"use client";

import {useMemo, useState} from "react";

interface FeatureCard {
  label: string;
  value: string;
  tone: "brand" | "accent" | "warning" | "danger";
}

interface FeatureTabItem {
  id: string;
  label: string;
  title: string;
  description: string;
  cards: FeatureCard[];
}

const FEATURE_TABS: FeatureTabItem[] = [
  {
    id: "visibility",
    label: "AI Visibility Intelligence",
    title: "AI Visibility Intelligence",
    description:
      "See exactly how AI assistants and answer engines interpret your brand. Track mentions, citations, and discovery patterns across the surfaces that matter most.",
    cards: [
      {label: "AI Mentions", value: "24 this month", tone: "accent"},
      {label: "Citations", value: "8 linked answers", tone: "brand"},
      {label: "Confidence", value: "Deterministic", tone: "warning"},
    ],
  },
  {
    id: "optimization",
    label: "Actionable Optimization",
    title: "Actionable Optimization",
    description:
      "Every score comes with concrete fixes you can implement immediately. Prioritize high-impact improvements before you spend on broader AEO or marketplace work.",
    cards: [
      {label: "High Priority", value: "Schema consistency", tone: "danger"},
      {label: "Medium Priority", value: "Answer blocks", tone: "warning"},
      {label: "Quick Win", value: "Meta cleanup", tone: "accent"},
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace Scale",
    title: "Marketplace Scale",
    description:
      "Use one decision surface for your storefront and marketplace presence. Monitor readiness, identify missing signals, and keep discovery consistent across channels.",
    cards: [
      {label: "Shopify", value: "Ready", tone: "accent"},
      {label: "Amazon", value: "Upcoming adapter", tone: "brand"},
      {label: "TikTok Shop", value: "Launch queue", tone: "warning"},
    ],
  },
  {
    id: "competitive",
    label: "Competitive Intelligence",
    title: "Competitive Intelligence",
    description:
      "Understand where competitors outrank you in citations, trust signals, and structured data quality before you commit to deeper monitoring packages.",
    cards: [
      {label: "Gap Signal", value: "Schema depth", tone: "danger"},
      {label: "Opportunity", value: "Answer formatting", tone: "accent"},
      {label: "Watchlist", value: "Competitor velocity", tone: "brand"},
    ],
  },
];

export function FeatureTabs() {
  const [activeId, setActiveId] = useState(FEATURE_TABS[0]?.id ?? "visibility");

  const activeTab = useMemo(() => {
    return FEATURE_TABS.find((item) => item.id === activeId) ?? FEATURE_TABS[0];
  }, [activeId]);

  return (
    <div className="features-layout">
      <div className="feature-tabs" role="tablist" aria-label="Why MO ADS">
        {FEATURE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`feature-tab${item.id === activeTab.id ? " active" : ""}`}
            onClick={() => setActiveId(item.id)}
            role="tab"
            aria-selected={item.id === activeTab.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="feature-content" role="tabpanel" aria-live="polite">
        <div className="feature-content-title">
          <span className="feature-dot" />
          <span>{activeTab.title}</span>
        </div>
        <p>{activeTab.description}</p>

        <div className="feature-widget">
          {activeTab.cards.map((card) => (
            <article key={card.label} className={`feature-widget-card tone-${card.tone}`}>
              <p className="feature-widget-label">{card.label}</p>
              <p className="feature-widget-value">{card.value}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
