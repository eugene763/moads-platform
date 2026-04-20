import {AeoTopNav} from "../../../components/aeo-top-nav";
import {ReportView} from "../../../components/report-view";

export default async function PublicReportPage({params}: {params: Promise<{publicToken: string}>}) {
  const resolved = await params;

  return (
    <main>
      <AeoTopNav secondaryLabel="Dashboard" secondaryHref="/dashboard" />

      <div className="page-shell report-page">
        <ReportView publicToken={resolved.publicToken} />

        <section className="section-block lead-footer lead-footer-light">
          <h2>Want implementation support?</h2>
          <p>Submit your request on the main website and our team will help you deploy fixes after the score.</p>
          <a className="cta-nav" href="https://moads.agency/#form" target="_blank" rel="noreferrer">
            Open Agency Lead Form
          </a>
        </section>
      </div>
    </main>
  );
}
