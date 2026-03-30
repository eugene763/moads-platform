import Link from "next/link";

import {ScanForm} from "../components/scan-form";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="top-nav">
        <div className="brand">MO ADS</div>
        <nav>
          <a href="#how-it-works">How It Works</a>
          <a href="#dimensions">Dimensions</a>
          <a href="#pricing">Pricing</a>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">AI Engine Optimization for E-Commerce</p>
        <h1>AI is the new search. Is your brand visible?</h1>
        <p className="hero-copy">
          See how your brand shows up in ChatGPT, Perplexity, Gemini and more.
          Start with a deterministic score from raw page evidence.
        </p>
        <ScanForm />
      </section>

      <section id="how-it-works" className="section-block">
        <h2>Three steps to understanding AI discoverability</h2>
        <div className="cards three">
          <article>
            <h3>Step 01</h3>
            <p>Enter your store URL. Everything else is optional.</p>
          </article>
          <article>
            <h3>Step 02</h3>
            <p>We run deterministic checks: access, SEO and ratings schema evidence.</p>
          </article>
          <article>
            <h3>Step 03</h3>
            <p>Get your score and top fixes. Full recommendations unlock after sign-in.</p>
          </article>
        </div>
      </section>

      <section id="dimensions" className="section-block">
        <h2>8 dimensions roadmap</h2>
        <div className="cards four">
          <article><h3>Product Data</h3><p>Attributes, variants, taxonomy.</p></article>
          <article><h3>Schema</h3><p>JSON-LD, rating consistency, rich-result readiness.</p></article>
          <article><h3>AI Engine</h3><p>Crawlability, citations, trust factors.</p></article>
          <article><h3>Content</h3><p>Buying intent structure and answerable blocks.</p></article>
          <article><h3>Marketplace</h3><p>Platform compliance and listing readiness.</p></article>
          <article><h3>Social Proof</h3><p>Rating quality and velocity signals.</p></article>
          <article><h3>Visuals</h3><p>Image/video evidence quality.</p></article>
          <article><h3>Technical</h3><p>Core web performance and pricing signals.</p></article>
        </div>
      </section>

      <section id="pricing" className="section-block">
        <h2>Simple pricing</h2>
        <div className="cards three">
          <article>
            <h3>Free</h3>
            <p>Score + top evidence. Full breakdown after auth.</p>
          </article>
          <article>
            <h3>Starter</h3>
            <p>Expanded data, higher precision, GA4 widgets and realtime stream.</p>
          </article>
          <article>
            <h3>Pro+</h3>
            <p>Automation, competitor intelligence and implementation support.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
