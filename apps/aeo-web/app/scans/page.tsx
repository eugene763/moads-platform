import {AeoTopNav} from "../../components/aeo-top-nav";
import {ScansView} from "../../components/scans-view";

export default function ScansPage() {
  return (
    <main>
      <AeoTopNav />

      <div className="page-shell report-page">
        <ScansView />
      </div>
    </main>
  );
}
