import {DashboardView} from "../../components/dashboard-view";

export default function DashboardPage() {
  return (
    <main className="page-shell report-page">
      <header className="top-nav compact">
        <a href="/" className="brand">MO ADS AEO</a>
      </header>
      <DashboardView />
    </main>
  );
}
