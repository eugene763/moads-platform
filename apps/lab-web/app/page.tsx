import Link from "next/link";
import Image from "next/image";

const overviewCards = [
  {
    title: "Credit Packs",
    description: "Buy Pack S, Pack M, or Pack L only when you need more AI tips.",
  },
  {
    title: "Orders",
    description: "Keep purchase history and fulfillment status in one account center.",
  },
  {
    title: "Launch Access",
    description: "Track Starter, Pro, and Store status while subscriptions stay in coming soon.",
  },
];

export default function LabHome() {
  return (
    <main>
      <header className="top-nav">
        <Link href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </Link>
        <nav>
          <Link href="/center">Open Center</Link>
          <a href="https://aeo.moads.agency">Go to AEO</a>
          <a href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">Agency</a>
        </nav>
      </header>

      <div className="page-shell">
        <section className="hero">
          <p className="eyebrow">Account + Billing Center</p>
          <h1>Manage credits, orders, and launch access</h1>
          <p>
            LAB is the commerce surface for AEO: wallet, pack checkout, order history,
            and the coming-soon queue for deeper monitoring plans.
          </p>
          <div className="hero-actions">
            <Link className="cta-primary" href="/center">Open Center</Link>
            <a className="cta-ghost" href="https://aeo.moads.agency">Go to AEO</a>
          </div>
        </section>

        <section className="cards cards-three">
          {overviewCards.map((card) => (
            <article key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </section>

        <section className="lead-footer">
          <h2>Need agency onboarding?</h2>
          <p>Use the main MO ADS form and we will help you configure rollout, tracking, and implementation.</p>
          <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
            Open Agency Lead Form
          </a>
        </section>
      </div>
    </main>
  );
}
