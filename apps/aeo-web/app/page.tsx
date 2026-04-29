import type {CSSProperties} from "react";
import Image from "next/image";
import Link from "next/link";

import {AeoTopNav} from "../components/aeo-top-nav";
import {AgencySupportBlock} from "../components/agency-support-block";
import {FeatureTabs} from "../components/feature-tabs";
import {InstallAppButton} from "../components/install-app-button";
import {PaymentReturnModal} from "../components/payment-return-modal";
import {ScanForm} from "../components/scan-form";

const floatLogos = [
  {label: "ChatGPT", src: "/logos/chatgpt.svg", top: "28%", left: "2%", duration: "4.2s", delay: "0s"},
  {label: "Perplexity", src: "/logos/perplexity.svg", top: "58%", left: "3%", duration: "3.8s", delay: "0.6s"},
  {label: "DeepSeek", src: "/logos/deepseek.svg", top: "78%", left: "2%", duration: "5s", delay: "1.2s"},
  {label: "Grok", src: "/logos/grok.svg", top: "15%", left: "82%", duration: "4s", delay: "0.3s"},
  {label: "Gemini", src: "/logos/gemini.svg", top: "42%", left: "84%", duration: "4.5s", delay: "0.9s"},
  {label: "Claude", src: "/logos/claude.svg", top: "68%", left: "81%", duration: "3.6s", delay: "1.5s"},
] as const;

const tickerBaseItems = [
  {label: "Claude", src: "/logos/claude.svg"},
  {label: "Gemini", src: "/logos/gemini.svg"},
  {label: "ChatGPT", src: "/logos/chatgpt.svg"},
  {label: "Perplexity", src: "/logos/perplexity.svg"},
  {label: "Gemini", src: "/logos/gemini.svg"},
  {label: "Grok", src: "/logos/grok.svg"},
  {label: "DeepSeek", src: "/logos/deepseek.svg"},
] as const;

const tickerItems = [...tickerBaseItems, ...tickerBaseItems, ...tickerBaseItems];

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
  period?: string;
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
    description: "First scan free in the MO AEO CHECKER with top fixes and auth unlock.",
    features: [
      "Single URL free check",
      "Top fixes preview",
      "Share + print report",
      "Auth unlock for deeper data",
      "Sign in to unlock deeper checks",
    ],
    href: "/#scan",
    cta: "Start free scan",
  },
  {
    name: "Credit Packs",
    price: "from $4.99",
    period: "one-time",
    description: "AEO tracker packs to grow AI traffic to your site without recurring billing.",
    features: [
      "Pack S - 30 credits",
      "Pack M - 80 credits",
      "Pack L - 200 credits",
      "Deep Site Scan costs 1 credit",
      "Checkout in AEO workspace",
    ],
    href: "/scans?intent=buy-credits",
    cta: "Buy credits",
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

const faqEntries = [
  {
    question: "What is a free AEO checker?",
    answer: "A free AEO checker is a tool that scans a page and shows how ready it is for AI discovery. It helps you review key signals such as crawlability, structured data, content clarity, canonicals, and question-and-answer formatting. In practice, it works as a simple starting point for improving AI search visibility before you move to deeper site analysis.",
  },
  {
    question: "What does an AEO tracker do?",
    answer: "An AEO tracker helps you monitor the signals that affect how pages may be discovered, interpreted, and reused in AI search experiences. It can highlight technical issues, content gaps, and readiness patterns across your pages. A strong AEO tracker gives you a repeatable way to measure progress instead of guessing what to fix first.",
  },
  {
    question: "How is an AEO visibility tool different from traditional SEO tools?",
    answer: "An AEO visibility tool focuses on whether your content is easy for AI systems to parse, trust, and summarize, while traditional SEO tools mainly focus on rankings, keywords, and search engine indexing. Good SEO still matters, but AEO adds another layer: direct answers, structured Q&A, machine-readable guidance, and content formats that work well in AI-driven discovery.",
  },
  {
    question: "What is the best AEO tracker for early-stage analysis?",
    answer: "The best AEO tracker for early-stage analysis is one that is fast, clear, and easy to act on. It should show a readable score, explain the most important issues, and help you understand what to fix on a page first. For most teams, the best AEO tracking tool is not the most complex one, but the one that turns signals into useful next steps.",
  },
  {
    question: "What should an AEO analysis tool check on a page?",
    answer: "A useful AEO analysis tool should check core technical and content signals such as indexable access, canonicals, meta tags, schema markup, FAQ visibility, question-style headings, short direct answers, and clear page structure. It should also review robots and sitemap hygiene. These checks help you see whether a page is ready for AI search visibility analytics and broader AEO monitoring.",
  },
  {
    question: "Why use AI tools for SEO and AEO together?",
    answer: "AI tools for SEO and AEO work best together because search visibility now depends on both classic search fundamentals and AI-ready content structure. SEO helps pages get discovered and indexed, while AEO helps content become easier to interpret and surface in AI experiences. Using both gives teams a more complete view of visibility, content quality, and technical readiness.",
  },
] as const;

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
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(faqJsonLd)}} />
      <AeoTopNav />
      <PaymentReturnModal />

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
            <h2 className="hero-eyebrow-pill">FREE AEO CHECK UP</h2>
            <p className="hero-main-h2">
              <span>Check if AI can read</span>
              <span><span className="accent-line">your site</span></span>
            </p>
            <h1 className="hero-copy hero-copy-h1">
              AEO visibility tool for fast page diagnostics and AI search visibility analysis.
            </h1>

            <div id="scan" className="scan-anchor">
              <ScanForm />
            </div>
            <InstallAppButton />

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
                First result is one-page readiness only. Sign in to unlock deeper diagnostics and Deep Site Scans.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="platform-ticker" aria-label="Supported discovery surfaces">
        <div className="ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <div key={`${item.label}-${index}`} className="ticker-item">
              <Image src={item.src} alt="" width={18} height={18} className="ticker-logo" />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">How It Works</p>
            <h2 className="section-title">Free AEO checker workflow in 3 steps</h2>
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
                <h3>Read your AEO visibility tool score</h3>
                <p>See AI Discovery Readiness of page and compact top fixes for quick action.</p>
              </article>
              <article className="step-card">
                <span className="step-badge">Step 03</span>
                {iconForStep("check")}
                <h3>Unlock the AEO tracker workspace</h3>
                <p>Sign in to unlock hidden blocks, run more scans, and use credit-powered actions.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Why MO AEO CHECKER</p>
            <h2 className="section-title">AEO checks built on real signals, with clear next steps</h2>
            <FeatureTabs />
          </div>
        </div>
      </section>

      <section id="dimensions" className="dimensions-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Scoring System</p>
            <h2 className="section-title">Best AEO tracker signals for AI search visibility growth</h2>
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
            <div className="dimensions-cta-wrap">
              <Link className="cta-primary dimensions-auth-cta" href="/scans">
                Open all features
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="page-shell">
          <div className="section-inner">
            <p className="section-eyebrow">Pricing</p>
            <h2 className="section-title">Packs to increase AI traffic to your site</h2>
            <div className="pricing-cards">
              {pricingCards.map((card) => (
                <article key={card.name} className={`pricing-card${card.popular ? " popular" : ""}`}>
                  {card.popular ? <span className="popular-badge">Live</span> : null}
                  <p className="pricing-plan-name">{card.name}</p>
                  <p className="pricing-price">
                    {card.price}
                    {card.period ? (
                      <>
                        {" "}
                        <span>{card.period}</span>
                      </>
                    ) : null}
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
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="page-shell">
          <div className="section-inner">
            <h2 className="faq-title">FAQ</h2>
            <div className="faq-list">
              {faqEntries.map((entry) => (
                <article key={entry.question} className="faq-item" itemScope itemType="https://schema.org/Question">
                  <div className="faq-question-bubble">
                    <h3 itemProp="name">{entry.question}</h3>
                  </div>
                  <div className="faq-answer-bubble" itemProp="acceptedAnswer" itemScope itemType="https://schema.org/Answer">
                    <p itemProp="text">{entry.answer}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="page-shell">
          <AgencySupportBlock className="final-cta-card" />
        </div>
      </section>
    </main>
  );
}
