import type {CSSProperties} from "react";
import Link from "next/link";

import {AeoTopNav} from "../components/aeo-top-nav";
import {FeatureTabs} from "../components/feature-tabs";
import {ScanForm} from "../components/scan-form";

const floatLogos = [
  {label: "ChatGPT", letter: "C", top: "28%", left: "2%", duration: "4.2s", delay: "0s", color: "#10A37F"},
  {label: "Perplexity", letter: "P", top: "58%", left: "3%", duration: "3.8s", delay: "0.6s", color: "#0EA5A4"},
  {label: "DeepSeek", letter: "D", top: "78%", left: "2%", duration: "5s", delay: "1.2s", color: "#2563EB"},
  {label: "Grok", letter: "G", top: "15%", left: "82%", duration: "4s", delay: "0.3s", color: "#111827"},
  {label: "Gemini", letter: "G", top: "42%", left: "84%", duration: "4.5s", delay: "0.9s", color: "#7C3AED"},
  {label: "Claude", letter: "C", top: "68%", left: "81%", duration: "3.6s", delay: "1.5s", color: "#C26D45"},
];

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
  {title: "Product Data Completeness", weight: "16%", description: "Attributes, variants, and taxonomy coverage for clearer engine understanding.", tags: ["Attributes", "Variants", "Taxonomy"]},
  {title: "Structured Data & Schema", weight: "15%", description: "JSON-LD health, rating markup, and citation-ready schema coverage.", tags: ["JSON-LD", "Product schema", "FAQ schema"]},
  {title: "AI Engine Optimization", weight: "18%", description: "Signals that help answer engines parse, cite, and trust the page.", tags: ["llms.txt", "Citation sources", "Trust signals"]},
  {title: "Content Architecture", weight: "11%", description: "Clear sections, headings, and answer blocks for shopping and discovery prompts.", tags: ["Headings", "Answer blocks", "Buying guides"]},
  {title: "Marketplace Compliance", weight: "12%", description: "Marketplace-specific readiness and structured requirements across channels.", tags: ["Platform specs", "Enhanced content", "Programs"]},
  {title: "Social Proof & Reviews", weight: "12%", description: "Review volume, rating consistency, and trust cues visible on page.", tags: ["Review volume", "Rating average", "Velocity"]},
  {title: "Visual Content Quality", weight: "7%", description: "Image/video presentation that helps engines and shoppers interpret context.", tags: ["Image count", "Video", "Alt text"]},
  {title: "Technical & Pricing", weight: "9%", description: "Performance and pricing clarity that support stronger page confidence.", tags: ["Core Web Vitals", "Mobile score", "Price signals"]},
];

const pricingCards = [
  {
    name: "Free",
    price: "$0",
    period: "always",
    description: "Launch with a deterministic score, shareable report, and auth-unlocked visibility details.",
    features: [
      "Public AI Discovery Score",
      "Top evidence and issues",
      "Share + print report",
      "Auth unlock for deeper breakdown",
      "No credit card required",
    ],
    href: "/",
    cta: "Get Free Score",
  },
  {
    name: "Credit Packs",
    price: "from $4.99",
    period: "one-time",
    description: "Buy credits only when you need AI tips and usage-based actions. No subscription required.",
    features: [
      "Pack S · 30 credits",
      "Pack M · 80 credits",
      "Pack L · 200 credits",
      "1 credit = 1 AI tips run",
      "Secure checkout via LAB",
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
    description: "Comprehensive manual + AI analysis with a 30-day roadmap and implementation guidance from the agency team.",
    features: [
      "Manual AEO review",
      "Top fixes ranked by impact",
      "30-day action plan",
      "Competitive context",
      "Agency implementation path",
    ],
    href: "https://moads.agency/footer#form",
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

      <section className="hero">
        <div className="hero-float-logos" aria-hidden="true">
          {floatLogos.map((item) => (
            <div key={item.label} className="float-logo" style={floatStyle(item)}>
              <span className="float-logo-mark" style={{backgroundColor: item.color}}>
                {item.letter}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="page-shell hero-content">
          <div className="section-inner">
            <p className="hero-eyebrow-pill">AI Engine Optimization</p>
            <h1>
              AI is the new search.
              {" "}
              <span className="accent-line">Is your brand visible?</span>
            </h1>
            <p className="hero-copy">
              See how your brand shows up on ChatGPT, Perplexity, Gemini, and more.
              Start with a deterministic score from raw page evidence.
            </p>

            <ScanForm />

            <div className="sample-report-card">
              <div className="sample-report-header">
                <span>Sample AI Visibility Report</span>
                <span className="live-badge">Live</span>
              </div>
              <div className="sample-stats-row">
                <div className="sample-stat score">
                  <div className="stat-value">47/100</div>
                  <div className="stat-label">AI Score</div>
                </div>
                <div className="sample-stat vis">
                  <div className="stat-value">2/6</div>
                  <div className="stat-label">Engines Visible</div>
                </div>
                <div className="sample-stat fixes">
                  <div className="stat-value">12</div>
                  <div className="stat-label">Fixes Found</div>
                </div>
              </div>
              <p className="sample-report-foot">
                Checked across ChatGPT, Gemini, Perplexity, Claude, Grok, and DeepSeek.
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
            <h2 className="section-title">Three steps to understanding your AI discoverability</h2>
            <div className="step-cards">
              <article className="step-card">
                <span className="step-badge">Step 01</span>
                {iconForStep("globe")}
                <h3>Enter Your Store URL</h3>
                <p>Paste your URL and run a fast deterministic scan with only one required field.</p>
              </article>
              <article className="step-card">
                <span className="step-badge">Step 02</span>
                {iconForStep("chart")}
                <h3>We Analyze 8 Dimensions</h3>
                <p>We check structure, accessibility, answer-readiness, schema, content, trust, visuals, and technical signals.</p>
              </article>
              <article className="step-card">
                <span className="step-badge">Step 03</span>
                {iconForStep("check")}
                <h3>Get Your Score + Fixes</h3>
                <p>See the score for free, unlock the deeper breakdown after sign-in, and buy credits only when you need AI tips.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Why MO ADS</p>
            <h2 className="section-title">Visibility, intelligence, and action in the age of AI commerce</h2>
            <FeatureTabs />
          </div>
        </div>
      </section>

      <section id="dimensions" className="dimensions-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Scoring System</p>
            <h2 className="section-title">8 dimensions of AI discoverability</h2>
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
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Pricing</p>
            <h2 className="section-title">Launch with free scoring, then buy credits only when you need them</h2>
            <div className="pricing-cards">
              {pricingCards.map((card) => (
                <article key={card.name} className={`pricing-card${card.popular ? " popular" : ""}`}>
                  {card.popular ? <span className="popular-badge">Launch Mode</span> : null}
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
              Starter, Pro, and Store monitoring plans stay in the launch queue for now.
              {" "}
              <a href="https://lab.moads.agency" target="_blank" rel="noreferrer">LAB</a>
              {" "}
              remains the live billing surface for packs, and
              {" "}
              <a href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">Deep Audit</a>
              {" "}
              stays lead-based.
            </p>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="page-shell">
          <div className="final-cta-card">
            <p className="section-eyebrow section-eyebrow-light">Agency Support</p>
            <h2>Need implementation help after the score?</h2>
            <p>
              Use the main MO ADS form to hand off schema fixes, answer optimization,
              and broader AEO rollout to the agency team.
            </p>
            <a className="cta-nav final-cta-button" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
              Open Agency Lead Form
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
