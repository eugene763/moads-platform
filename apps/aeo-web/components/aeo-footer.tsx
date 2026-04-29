import Image from "next/image";

export function AeoFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Image src="/logo-mo-aeo-checker.png" alt="MO AEO CHECKER" width={577} height={433} className="site-footer-logo" />
        <a href="https://moads.agency/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
        <p>
          ©2026 MO AEO Checker. All rights reserved | AEO checker is owned and operated by mo ads agency, 0182 Georgia, Tbilisi, Samgori district, police lane I, N5
        </p>
      </div>
    </footer>
  );
}
