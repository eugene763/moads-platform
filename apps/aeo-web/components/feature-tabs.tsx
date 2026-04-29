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
  comingSoon?: boolean;
}

const FEATURE_TABS: FeatureTabItem[] = [
  {
    id: "visibility",
    label: "Data-Driven AEO Score",
    title: "Data-Driven AEO Score",
    description:
      "A fast page-level check built on real page signals. We parse HTML, headings, schema, and visible trust elements to show what AI can read and where discovery breaks.",
    cards: [
      {label: "REAL SIGNALS", value: "HTML + JSON-LD", tone: "accent"},
      {label: "EXPLAINABLE", value: "No black box", tone: "brand"},
      {label: "PAGE-LEVEL", value: "Fast to run", tone: "warning"},
    ],
  },
  {
    id: "optimization",
    label: "Clear Next Steps",
    title: "Clear Next Steps",
    description:
      "Every issue maps to a visible signal and a concrete fix. Start with deterministic improvements before moving into deeper AEO work.",
    cards: [
      {label: "CRAWL", value: "Access issues", tone: "danger"},
      {label: "CLARITY", value: "Content structure", tone: "warning"},
      {label: "TRUST", value: "Schema and policy signals", tone: "accent"},
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace AI Tips",
    title: "AI Tips for Marketplace Pages",
    description:
      "Planned guidance for product and category pages across major commerce surfaces. Focus: stronger AI-readable copy, cleaner structure, and better trust signals.",
    cards: [
      {label: "PRODUCT COPY", value: "AI-readable wording", tone: "accent"},
      {label: "STRUCTURE", value: "Cleaner PDP signals", tone: "brand"},
      {label: "TRUST", value: "Policy and review context", tone: "warning"},
    ],
    comingSoon: true,
  },
  {
    id: "competitive",
    label: "Marketplace AEO Score",
    title: "Marketplace AEO Score",
    description:
      "A future score layer for marketplace presence. Designed to combine structured page signals with marketplace-specific tips for product discovery.",
    cards: [
      {label: "CATEGORY FIT", value: "Discovery signals", tone: "danger"},
      {label: "CONSISTENCY", value: "Feed and content quality", tone: "accent"},
      {label: "TIPS", value: "Next actions by page type", tone: "brand"},
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
      <div className="feature-tabs" role="tablist" aria-label="Why MO AEO CHECKER">
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
            <article key={`${card.label}-${index}`} className={`feature-widget-card tone-${card.tone}`}>
              <p className="feature-widget-label">{card.label}</p>
              <p className="feature-widget-value">{card.value}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
