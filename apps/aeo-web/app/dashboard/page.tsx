import {AeoTopNav} from "../../components/aeo-top-nav";
import {DashboardView} from "../../components/dashboard-view";

export default function DashboardPage() {
  return (
    <main>
      <AeoTopNav secondaryLabel="Dashboard" secondaryHref="/dashboard" />

      <div className="page-shell report-page">
        <DashboardView />

        <section className="section-block lead-footer lead-footer-light">
          <h2>Want to improve your site for AEO? Request a rollout plan</h2>
          <p>Our team can implement priority AEO fixes and build a growth plan for AI traffic to your site.</p>
          <a className="cta-nav" href="https://moads.agency/#form" target="_blank" rel="noreferrer">
            Request AEO help
          </a>
        </section>
      </div>
    </main>
  );
}
