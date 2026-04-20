import {AeoTopNav} from "../../components/aeo-top-nav";
import {DashboardView} from "../../components/dashboard-view";

export default function DashboardPage() {
  return (
    <main>
      <AeoTopNav secondaryLabel="Dashboard" secondaryHref="/dashboard" />

      <div className="page-shell report-page">
        <DashboardView />

        <section className="section-block lead-footer lead-footer-light">
          <h2>Need help implementing fixes?</h2>
          <p>Use the main site form to connect with the MO ADS agency team for rollout and execution.</p>
          <a className="cta-nav" href="https://moads.agency/#form" target="_blank" rel="noreferrer">
            Open Agency Lead Form
          </a>
        </section>
      </div>
    </main>
  );
}
