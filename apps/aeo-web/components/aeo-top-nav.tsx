"use client";

import Image from "next/image";
import Link from "next/link";
import {useEffect, useState} from "react";

import {apiRequest} from "../lib/api";
import {signOutFromAeoFirebase} from "../lib/firebase";
import {AuthModal} from "./auth-modal";

type AuthMode = "signin" | "signup";

interface SessionSnapshot {
  user: {email: string | null};
}

export function AeoTopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 8);
    };

    handler();
    window.addEventListener("scroll", handler, {passive: true});
    return () => window.removeEventListener("scroll", handler);
  }, []);

  async function refreshSession() {
    try {
      const session = await apiRequest<SessionSnapshot>("/v1/me");
      setIsAuthed(true);
      setEmail(session.user.email);

      try {
        const wallet = await apiRequest<{wallet: {balance: number}}>("/v1/wallet/summary");
        setCredits(wallet.wallet.balance);
      } catch {
        setCredits(null);
      }
    } catch {
      setIsAuthed(false);
      setEmail(null);
      setCredits(null);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const authHint = window.localStorage.getItem("aeo_authed_hint");
      if (authHint) {
        setIsAuthed(true);
      }
    }

    void refreshSession();

    function onVisibility() {
      if (!document.hidden) {
        void refreshSession();
      }
    }

    function onFocus() {
      void refreshSession();
    }

    function onAuthChanged() {
      void refreshSession();
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener("aeo-auth-changed", onAuthChanged);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("aeo-auth-changed", onAuthChanged);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function handleAuthSuccess() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("aeo_authed_hint", String(Date.now()));
    }
    await refreshSession();
    setAuthOpen(false);
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthOpen(true);
    setMenuOpen(false);
  }

  async function handleLogout(): Promise<void> {
    try {
      await apiRequest("/v1/auth/session-logout", {method: "POST"});
    } catch {
      // Ignore stale session errors and continue local sign-out.
    }

    try {
      await signOutFromAeoFirebase();
    } catch {
      // Ignore local firebase sign-out errors.
    }

    setIsAuthed(false);
    setEmail(null);
    setCredits(null);
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("aeo_authed_hint");
    }
    window.location.href = "/";
  }

  return (
    <header className={`top-nav${scrolled ? " scrolled" : ""}`}>
      <Link href="/" className="brand brand-logo" aria-label="MO AEO CHECKER home">
        <Image src="/logo-mo-aeo-checker.png" alt="MO AEO CHECKER" width={577} height={433} className="brand-logo-image" priority />
        <span className="demo-label">BETA</span>
      </Link>

      <nav>
        <Link href="/#how-it-works">How It Works</Link>
        <Link href="/#dimensions">Dimensions</Link>
        <Link href="/#pricing">Pricing</Link>
        <a href="https://moads.agency/#form" target="_blank" rel="noreferrer">Agency</a>
      </nav>

      <div className="nav-actions">
        {isAuthed ? (
          <>
            <Link href="/scans" className="nav-login">Scans</Link>
            <Link href="/dashboard" className="cta-nav">Account</Link>
          </>
        ) : (
          <>
            <button type="button" className="nav-text-button" onClick={() => openAuth("signin")}>Log In</button>
            <button type="button" className="cta-nav" onClick={() => openAuth("signup")}>Sign Up</button>
          </>
        )}
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
            <Link href="/#scan" onClick={() => setMenuOpen(false)}>Checker</Link>
            <Link href="/scans" onClick={() => setMenuOpen(false)}>Scans</Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Account</Link>
            <a href="https://moads.agency/#form" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Agency Form</a>
          </div>
          <div className="burger-group">
            <strong>Account</strong>
            {isAuthed ? (
              <>
                <p className="tiny">{email ?? "signed user"}</p>
                <p className="tiny">{credits ?? "--"} credits</p>
                <Link href="/dashboard#billing" onClick={() => setMenuOpen(false)}>Buy more credits</Link>
                <button type="button" className="auth-link" onClick={() => void handleLogout()}>
                  Log out
                </button>
              </>
            ) : (
              <div className="burger-auth-actions">
                <button type="button" className="cta-ghost" onClick={() => openAuth("signin")}>Log In</button>
                <button type="button" className="cta-primary" onClick={() => openAuth("signup")}>Sign Up</button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        source="top_nav"
        initialMode={authMode}
      />
    </header>
  );
}
