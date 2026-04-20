"use client";

import Image from "next/image";
import Link from "next/link";
import {useEffect, useState} from "react";

interface AeoTopNavProps {
  secondaryLabel?: string;
  secondaryHref?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function AeoTopNav({
  secondaryLabel = "Log In",
  secondaryHref = "/dashboard",
  ctaLabel = "Open Checker",
  ctaHref = "/#scan",
}: AeoTopNavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 8);
    };

    handler();
    window.addEventListener("scroll", handler, {passive: true});
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className={`top-nav${scrolled ? " scrolled" : ""}`}>
      <Link href="/" className="brand brand-logo" aria-label="MO AEO CHECKER home">
        <Image src="/logo-mo-aeo-checker.png" alt="MO AEO CHECKER" width={1260} height={680} className="brand-logo-image" priority />
      </Link>

      <nav>
        <Link href="/#how-it-works">How It Works</Link>
        <Link href="/#dimensions">Dimensions</Link>
        <Link href="/#pricing">Pricing</Link>
        <a href="https://moads.agency/#form" target="_blank" rel="noreferrer">Agency</a>
      </nav>

      <div className="nav-actions">
        <Link href={secondaryHref} className="nav-login">
          {secondaryLabel}
        </Link>
        <Link href={ctaHref} className="cta-nav">
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}
