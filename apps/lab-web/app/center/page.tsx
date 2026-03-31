import Image from "next/image";
import Link from "next/link";

import {CenterView} from "../../components/center-view";

export default function CenterPage() {
  return (
    <main>
      <header className="top-nav">
        <Link href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </Link>
        <nav>
          <Link href="/">LAB Home</Link>
          <a href="https://aeo.moads.agency">AEO App</a>
        </nav>
      </header>

      <div className="page-shell">
        <section className="hero hero-compact">
          <p className="eyebrow">LAB Center</p>
          <h1>Live packs now, monitoring access next</h1>
          <p>Use LAB for current credit purchases and order history while Starter, Pro, and Store stay in launch access mode.</p>
        </section>

        <CenterView />

        <section className="lead-footer">
          <h2>Need implementation support?</h2>
          <p>Submit a request and our team will connect this stack for your project.</p>
          <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
            Open Agency Lead Form
          </a>
        </section>
      </div>
    </main>
  );
}
