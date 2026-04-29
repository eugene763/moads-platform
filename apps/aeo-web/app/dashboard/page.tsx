import {AeoTopNav} from "../../components/aeo-top-nav";
import {DashboardView} from "../../components/dashboard-view";

export default function DashboardPage() {
  return (
    <main>
      <AeoTopNav />

      <div className="page-shell report-page">
        <DashboardView />
      </div>
    </main>
  );
}
