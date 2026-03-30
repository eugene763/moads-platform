import {CenterView} from "../../components/center-view";

export default function CenterPage() {
  return (
    <main className="page-shell">
      <header className="top-nav">
        <a href="/" className="brand">MO ADS LAB</a>
        <a href="https://aeo.moads.agency">AEO App</a>
      </header>
      <CenterView />
    </main>
  );
}
