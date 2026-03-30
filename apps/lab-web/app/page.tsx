import Link from "next/link";

export default function LabHome() {
  return (
    <main className="page-shell">
      <header className="top-nav">
        <div className="brand">MO ADS LAB</div>
        <nav>
          <Link href="/center">Open Center</Link>
          <a href="https://aeo.moads.agency">Go to AEO</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Account + Billing Center</p>
        <h1>Manage starter plan, credits, and launch offers</h1>
        <p>
          LAB is the commerce center for AEO in the pro contour: checkout, wallet, offer timers,
          and manual-safe fulfillment flow.
        </p>
        <Link className="cta-primary" href="/center">Open Center</Link>
      </section>
    </main>
  );
}
