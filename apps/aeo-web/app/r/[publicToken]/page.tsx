import {AeoTopNav} from "../../../components/aeo-top-nav";
import {ReportView} from "../../../components/report-view";

export default async function PublicReportPage({params}: {params: Promise<{publicToken: string}>}) {
  const resolved = await params;

  return (
    <main>
      <AeoTopNav />

      <div className="page-shell report-page">
        <ReportView publicToken={resolved.publicToken} />
      </div>
    </main>
  );
}
