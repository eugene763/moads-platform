import Image from "next/image";
import Link from "next/link";

export default function LabHome() {
  return (
    <main className="page-shell">
      <header className="top-nav">
        <Link href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </Link>
        <nav>
          <Link href="/center">Open Center</Link>
          <a href="https://aeo.moads.agency">Go to AEO</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Account + Billing Center</p>
        <h1>Manage credits, orders, and launch access</h1>
        <p>
          LAB is the commerce center for AEO: wallet, pack checkout, order history,
          and the next-wave access list for Starter, Pro, and Store.
        </p>
        <Link className="cta-primary" href="/center">Open Center</Link>
      </section>

      <section className="lead-footer">
        <h2>Need agency onboarding?</h2>
        <p>Use the main MO ADS form and we will help you configure rollout, tracking, and implementation.</p>
        <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
          Open Agency Lead Form
        </a>
      </section>
    </main>
  );
}
