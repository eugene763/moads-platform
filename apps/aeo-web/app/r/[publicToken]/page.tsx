import Image from "next/image";
import {ReportView} from "../../../components/report-view";

export default async function PublicReportPage({params}: {params: Promise<{publicToken: string}>}) {
  const resolved = await params;

  return (
    <main className="page-shell report-page">
      <header className="top-nav compact">
        <a href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </a>
      </header>
      <ReportView publicToken={resolved.publicToken} />
      <section className="section-block lead-footer">
        <h2>Want implementation support?</h2>
        <p>Submit your request on the main website and our team will help you deploy fixes.</p>
        <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
          Open Agency Lead Form
        </a>
      </section>
    </main>
  );
}
