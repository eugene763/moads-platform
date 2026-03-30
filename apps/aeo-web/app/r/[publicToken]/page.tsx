import {ReportView} from "../../../components/report-view";

export default async function PublicReportPage({params}: {params: Promise<{publicToken: string}>}) {
  const resolved = await params;

  return (
    <main className="page-shell report-page">
      <header className="top-nav compact">
        <a href="/" className="brand">MO ADS AEO</a>
      </header>
      <ReportView publicToken={resolved.publicToken} />
    </main>
  );
}
