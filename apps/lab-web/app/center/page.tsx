import Image from "next/image";
import {CenterView} from "../../components/center-view";

export default function CenterPage() {
  return (
    <main className="page-shell">
      <header className="top-nav">
        <a href="/" className="brand brand-logo">
          <Image src="/logo-moads.svg" alt="MO ADS" width={122} height={44} className="brand-logo-image" priority />
        </a>
        <a href="https://aeo.moads.agency">AEO App</a>
      </header>
      <CenterView />
      <section className="lead-footer">
        <h2>Need implementation support?</h2>
        <p>Submit a request and our team will connect this stack for your project.</p>
        <a className="cta-primary" href="https://moads.agency/footer#form" target="_blank" rel="noreferrer">
          Open Agency Lead Form
        </a>
      </section>
    </main>
  );
}
