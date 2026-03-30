import Image from "next/image";
import {DashboardView} from "../../components/dashboard-view";

export default function DashboardPage() {
  return (
    <main className="page-shell report-page">
      <header className="top-nav compact">
        <a href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </a>
      </header>
      <DashboardView />
      <section className="section-block lead-footer">
        <h2>Need help implementing fixes?</h2>
        <p>Use the main site form to connect with the MO ADS agency team.</p>
        <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
          Open Agency Lead Form
        </a>
      </section>
    </main>
  );
}
