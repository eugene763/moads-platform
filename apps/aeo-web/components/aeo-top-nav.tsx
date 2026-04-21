"use client";

import Image from "next/image";
import Link from "next/link";
import {useEffect, useMemo, useState} from "react";

import {apiRequest} from "../lib/api";

interface AeoTopNavProps {
  secondaryLabel?: string;
  secondaryHref?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

interface SessionSnapshot {
  user: {email: string | null};
}

export function AeoTopNav({
  secondaryLabel = "Log In",
  secondaryHref = "/dashboard",
  ctaLabel = "Open Checker",
  ctaHref = "/#scan-target",
}: AeoTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 8);
    };

    handler();
    window.addEventListener("scroll", handler, {passive: true});
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [session, wallet] = await Promise.all([
          apiRequest<SessionSnapshot>("/v1/me"),
          apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary"),
        ]);
        setIsAuthed(true);
        setEmail(session.user.email);
        setCredits(wallet.wallet.balance);
      } catch {
        setIsAuthed(false);
        setEmail(null);
        setCredits(null);
      }
    })();
  }, []);

  const resolvedSecondaryLabel = useMemo(() => {
    if (secondaryLabel !== "Log In") {
      return secondaryLabel;
    }
    return isAuthed ? "Dashboard" : "Log In";
  }, [isAuthed, secondaryLabel]);

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
          {resolvedSecondaryLabel}
        </Link>
        <Link href={ctaHref} className="cta-nav">
          {ctaLabel}
        </Link>
        <button
          type="button"
          className="burger-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          ☰
        </button>
      </div>

      {menuOpen ? (
        <div className="burger-panel">
          <div className="burger-group">
            <strong>Navigation</strong>
            <Link href="/#scan-target" onClick={() => setMenuOpen(false)}>Open Checker</Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
            <a href="https://moads.agency/#form" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Agency Form</a>
          </div>
          <div className="burger-group">
            <strong>Account</strong>
            {isAuthed ? (
              <>
                <p className="tiny">{email ?? "signed user"}</p>
                <p className="tiny">{credits ?? "--"} credits</p>
                <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Cabinet</Link>
                <Link href="/dashboard#billing" onClick={() => setMenuOpen(false)}>Billing</Link>
                <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Security</a>
                <a href="https://moads.agency/privacy" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Personal data</a>
              </>
            ) : (
              <p className="tiny">Sign in to view account data and credits.</p>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
