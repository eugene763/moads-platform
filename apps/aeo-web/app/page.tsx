import type {CSSProperties} from "react";
import Image from "next/image";
import Link from "next/link";

import {AeoTopNav} from "../components/aeo-top-nav";
import {FeatureTabs} from "../components/feature-tabs";
import {ScanForm} from "../components/scan-form";

const floatLogos = [
  {label: "ChatGPT", src: "/logos/chatgpt.svg", top: "28%", left: "2%", duration: "4.2s", delay: "0s"},
  {label: "Perplexity", src: "/logos/perplexity.svg", top: "58%", left: "3%", duration: "3.8s", delay: "0.6s"},
  {label: "DeepSeek", src: "/logos/deepseek.svg", top: "78%", left: "2%", duration: "5s", delay: "1.2s"},
  {label: "Grok", src: "/logos/grok.svg", top: "15%", left: "82%", duration: "4s", delay: "0.3s"},
  {label: "Gemini", src: "/logos/gemini.svg", top: "42%", left: "84%", duration: "4.5s", delay: "0.9s"},
  {label: "Claude", src: "/logos/claude.svg", top: "68%", left: "81%", duration: "3.6s", delay: "1.5s"},
] as const;

const tickerItems = [
  "ChatGPT Shopping",
  "Amazon",
  "Google AI Overview",
  "Walmart",
  "Perplexity",
  "TikTok Shop",
  "eBay",
  "Claude",
  "Shopee",
  "Gemini Shopping",
  "Etsy",
  "Shopify",
];

const dimensionCards = [
  {
    title: "AI Crawler Accessibility",
    weight: "Scored now",
    description: "Reachability, crawl directives, bot access, and snapshot confidence for the scanned URL.",
    tags: ["HTTP access", "Robots", "AI bots"],
  },
  {
    title: "Answer Optimization",
    weight: "Scored now",
    description: "Question-led headings, direct answers, FAQs, and structured answer formats on page.",
    tags: ["Question headings", "Direct answers", "FAQ"],
  },
  {
    title: "Citation Readiness",
    weight: "Scored now",
    description: "Trust and citation signals from schema, visible evidence, and consistency checks.",
    tags: ["Schema", "Visible trust", "Consistency"],
  },
  {
    title: "Technical Hygiene",
    weight: "Scored now",
    description: "Canonical, metadata, and response quality needed for stable machine interpretation.",
    tags: ["Canonical", "Meta tags", "Response quality"],
  },
  {
    title: "Product Page Sample",
    weight: "Evidence layer",
    description: "If you scan a homepage, one richer product-like URL is sampled to reduce under-reading.",
    tags: ["Sample PDP", "Fallback evidence", "Scope note"],
  },
  {
    title: "LLM Guidance Surface",
    weight: "Evidence layer",
    description: "Optional /llms.txt and guidance pages are checked as bonus machine-readability signals.",
    tags: ["llms.txt", "Guidance link", "Bonus"],
  },
  {
    title: "Top Fixes",
    weight: "Evidence layer",
    description: "A compact prioritized action list highlights the fastest fix and highest-impact gaps.",
    tags: ["Priority fixes", "Fastest win", "Impact"],
  },
  {
    title: "Locked Deep Signals",
    weight: "Post-auth",
    description: "After sign-in you unlock deeper diagnostics, multi-page context, and credit-powered actions.",
    tags: ["Unlock", "Site scope", "Workspace"],
  },
];

interface PricingCard {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  href: string;
  cta: string;
  external?: boolean;
  popular?: boolean;
}

const pricingCards: PricingCard[] = [
  {
    name: "Free",
    price: "$0",
    period: "always",
    description: "Run the first page scan for free and get AI Discovery Readiness of page.",
    features: [
      "Single URL free check",
      "Top fixes preview",
      "Share + print report",
      "Auth unlock for deeper data",
      "No card required",
    ],
    href: "/#scan",
    cta: "Open Checker",
  },
  {
    name: "Credit Packs",
    price: "from $4.99",
    period: "one-time",
    description: "Buy credits only when needed for usage actions. No recurring subscription required.",
    features: [
      "Pack S - 30 credits",
      "Pack M - 80 credits",
      "Pack L - 200 credits",
      "AI tips cost 1 credit",
      "Checkout via LAB",
    ],
    href: "https://lab.moads.agency/center",
    cta: "Open Billing Center",
    external: true,
    popular: true,
  },
  {
    name: "Deep Audit",
    price: "$690",
    period: "one-time",
    description: "Manual AEO implementation plan with specialist support and agency rollout.",
    features: [
      "Manual AEO review",
      "Priority implementation list",
      "30-day action roadmap",
      "Competitive context",
      "Agency delivery support",
    ],
    href: "https://moads.agency/#form",
    cta: "Request Audit",
    external: true,
  },
];

function iconForStep(kind: "globe" | "chart" | "check") {
  if (kind === "globe") {
    return (
      <svg className="step-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a15 15 0 0 1 0 18" />
        <path d="M12 3a15 15 0 0 0 0 18" />
      </svg>
    );
  }

  if (kind === "chart") {
    return (
      <svg className="step-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="10" width="4" height="10" rx="1" />
        <rect x="10" y="6" width="4" height="14" rx="1" />
        <rect x="16" y="3" width="4" height="17" rx="1" />
      </svg>
    );
  }

  return (
    <svg className="step-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.4 2.4 4.8-5.3" />
    </svg>
  );
}

function floatStyle(item: typeof floatLogos[number]): CSSProperties {
  return {
    left: item.left,
    top: item.top,
    ["--bob-dur" as string]: item.duration,
    ["--bob-delay" as string]: item.delay,
  };
}

export default function HomePage() {
  return (
    <main>
      <AeoTopNav />

      <section className="hero" id="top">
        <div className="hero-float-logos" aria-hidden="true">
          {floatLogos.map((item) => (
            <div key={item.label} className="float-logo" style={floatStyle(item)}>
              <span className="float-logo-mark svg-mark">
                <Image src={item.src} alt="" width={18} height={18} />
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="page-shell hero-content">
          <div className="section-inner">
            <p className="hero-eyebrow-pill">FREE AEO-CHECK</p>
            <h1>
              Check if AI can read this page.
              {" "}
              <span className="accent-line">Start with one free scan.</span>
            </h1>
            <p className="hero-copy">
              Run a free page scan and see how ready your content is for AI discovery, crawling, and direct answers.
            </p>

            <div id="scan">
              <ScanForm />
            </div>

            <div className="sample-report-card">
              <div className="sample-report-header">
                <span>Sample Readiness Snapshot</span>
                <span className="live-badge">Free</span>
              </div>
              <div className="sample-stats-row">
                <div className="sample-stat score">
                  <div className="stat-value">62/100</div>
                  <div className="stat-label">Readiness of page</div>
                </div>
                <div className="sample-stat vis">
                  <div className="stat-value">4</div>
                  <div className="stat-label">Top fixes</div>
                </div>
                <div className="sample-stat fixes">
                  <div className="stat-value">Locked</div>
                  <div className="stat-label">Deep blocks</div>
                </div>
              </div>
              <p className="sample-report-foot">
                First result is one-page readiness only. Sign in to unlock deeper diagnostics and full-site actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="platform-ticker" aria-label="Supported discovery surfaces">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <div key={`${item}-${index}`} className="ticker-item">
              <span className="ticker-dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">How It Works</p>
            <h2 className="section-title">Three steps to your first AI readiness result</h2>
            <div className="step-cards">
              <article className="step-card">
                <span className="step-badge">Step 01</span>
                {iconForStep("globe")}
                <h3>Enter URL</h3>
                <p>Paste one page URL and run a free check in under a minute.</p>
              </article>
              <article className="step-card">
                <span className="step-badge">Step 02</span>
                {iconForStep("chart")}
                <h3>Read AI Discovery Readiness of page</h3>
                <p>Get an objective score and compact top fixes for the scanned page.</p>
              </article>
              <article className="step-card">
                <span className="step-badge">Step 03</span>
                {iconForStep("check")}
                <h3>Unlock deeper data</h3>
                <p>Sign in to unlock hidden blocks, run more scans, and use credit-powered actions.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Why MO ADS</p>
            <h2 className="section-title">Simple launch flow, clear actions, no noise</h2>
            <FeatureTabs />
          </div>
        </div>
      </section>

      <section id="dimensions" className="dimensions-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Scoring System</p>
            <h2 className="section-title">Scored blocks now, deeper evidence after sign-in</h2>
            <div className="dimensions-grid">
              {dimensionCards.map((card, index) => (
                <article key={card.title} className={`dimension-card accent-${(index % 4) + 1}`}>
                  <div className="dimension-meta">
                    <span className="dimension-weight">{card.weight}</span>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                  <div className="dimension-tags">
                    {card.tags.map((tag) => (
                      <span key={tag} className="dimension-tag">{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <p className="pricing-note">
              AI Discovery Readiness of page is objective and rules-based.
              Additional evidence helps prioritize what to fix next without paid provider calls in the free scan.
            </p>
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Pricing</p>
            <h2 className="section-title">Free first check, then packs only when needed</h2>
            <div className="pricing-cards">
              {pricingCards.map((card) => (
                <article key={card.name} className={`pricing-card${card.popular ? " popular" : ""}`}>
                  {card.popular ? <span className="popular-badge">Live</span> : null}
                  <p className="pricing-plan-name">{card.name}</p>
                  <p className="pricing-price">
                    {card.price}
                    {" "}
                    <span>{card.period}</span>
                  </p>
                  <p className="pricing-desc">{card.description}</p>
                  <ul className="pricing-features">
                    {card.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {card.external ? (
                    <a className="pricing-cta" href={card.href} target="_blank" rel="noreferrer">{card.cta}</a>
                  ) : (
                    <Link className="pricing-cta" href={card.href}>{card.cta}</Link>
                  )}
                </article>
              ))}
            </div>
            <p className="pricing-note">
              Starter, Pro, and Store subscriptions stay coming soon.
              LAB is the live billing surface for packs.
            </p>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="page-shell">
          <div className="final-cta-card">
            <p className="section-eyebrow section-eyebrow-light">Agency Support</p>
            <h2>Need implementation help after the scan?</h2>
            <p>
              Use the main MO ADS form to hand off fixes and rollout to the agency team.
            </p>
            <a className="cta-nav final-cta-button" href="https://moads.agency/#form" target="_blank" rel="noreferrer">
              Open Agency Lead Form
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
