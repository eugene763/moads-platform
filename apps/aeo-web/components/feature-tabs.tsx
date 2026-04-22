"use client";

import {useMemo, useState} from "react";

interface FeatureCard {
  value: string;
  tone: "brand" | "accent" | "warning" | "danger";
}

interface FeatureTabItem {
  id: string;
  label: string;
  title: string;
  description: string;
  cards: FeatureCard[];
  comingSoon?: boolean;
}

const FEATURE_TABS: FeatureTabItem[] = [
  {
    id: "visibility",
    label: "Real Page Signals",
    title: "Real Page Signals",
    description:
      "We check the page itself - not just model guesses. Structure, schema, visible facts, and trust signals go into one explainable score.",
    cards: [
      {value: "HTML", tone: "accent"},
      {value: "SCHEMA", tone: "brand"},
      {value: "FACTS", tone: "warning"},
    ],
  },
  {
    id: "optimization",
    label: "Practical Fixes",
    title: "Practical Fixes",
    description:
      "See what to fix first. Each recommendation is tied to a real issue found on the page.",
    cards: [
      {value: "ACCESS", tone: "danger"},
      {value: "CLARITY", tone: "warning"},
      {value: "TRUST", tone: "accent"},
    ],
  },
  {
    id: "marketplace",
    label: "AI Tips for Marketplaces",
    title: "AI Tips for Marketplaces",
    description:
      "Planned recommendations for product and category pages on marketplace surfaces.",
    cards: [
      {value: "PRODUCT", tone: "accent"},
      {value: "CATEGORY", tone: "brand"},
      {value: "REVIEWS", tone: "warning"},
    ],
    comingSoon: true,
  },
  {
    id: "competitive",
    label: "Marketplace Score",
    title: "Marketplace Score",
    description:
      "A future score and tip layer for marketplace discovery quality.",
    cards: [
      {value: "SCORE", tone: "danger"},
      {value: "SIGNALS", tone: "accent"},
      {value: "NEXT STEPS", tone: "brand"},
    ],
    comingSoon: true,
  },
];

export function FeatureTabs() {
  const [activeId, setActiveId] = useState(FEATURE_TABS[0]?.id ?? "visibility");

  const activeTab = useMemo(() => {
    return FEATURE_TABS.find((item) => item.id === activeId) ?? FEATURE_TABS[0];
  }, [activeId]);

  return (
    <div className="features-layout">
      <div className="feature-tabs" role="tablist" aria-label="Why MO CHECKER">
        {FEATURE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`feature-tab${item.id === activeTab.id ? " active" : ""}${item.comingSoon ? " coming-soon" : ""}`}
            onClick={() => setActiveId(item.id)}
            role="tab"
            aria-selected={item.id === activeTab.id}
          >
            {item.label}
            {item.comingSoon ? <span className="coming-soon-pill">Coming soon</span> : null}
          </button>
        ))}
      </div>

      <div className={`feature-content${activeTab.comingSoon ? " coming-soon" : ""}`} role="tabpanel" aria-live="polite">
        <div className="feature-content-title">
          <span className="feature-dot" />
          <span>{activeTab.title}</span>
          {activeTab.comingSoon ? <span className="coming-soon-pill">Coming soon</span> : null}
        </div>
        <p>{activeTab.description}</p>

        <div className="feature-widget">
          {activeTab.cards.map((card, index) => (
            <article key={`${card.value}-${index}`} className={`feature-widget-card tone-${card.tone}`}>
              <p className="feature-widget-value">{card.value}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
