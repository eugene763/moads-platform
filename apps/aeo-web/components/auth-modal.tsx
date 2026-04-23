"use client";

import {FormEvent, useEffect, useRef, useState} from "react";

import {apiRequest} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {
  sendAeoPasswordReset,
  signInForAeoSession,
  signInWithEmailForAeoSession,
  signUpWithEmailForAeoSession,
} from "../lib/firebase";

type AuthMode = "signin" | "signup" | "reset";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  source: string;
  initialMode?: AuthMode;
}

async function createAeoSession(idToken: string): Promise<void> {
  await apiRequest("/v1/auth/session-login", {
    method: "POST",
    body: JSON.stringify({
      idToken,
      productCode: "aeo",
    }),
  });
}

export function AuthModal({open, onClose, onSuccess, source, initialMode = "signin"}: AuthModalProps) {
  const modalRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMode(initialMode);
      setPassword("");
      setMessage(null);
      setError(null);
    }
  }, [initialMode, open]);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      if (modalRef.current) {
        modalRef.current.scrollTop = 0;
      }
    }
  }, [initialMode, open]);

  useEffect(() => {
    function onEsc(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    if (open) {
      document.addEventListener("keydown", onEsc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  async function handleGoogle(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const idToken = await signInForAeoSession();
      await createAeoSession(idToken);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("aeo_authed_hint", String(Date.now()));
        window.dispatchEvent(new Event("aeo-auth-changed"));
      }
      trackGa4("aeo_auth_success", {source, method: "google"});
      await onSuccess();
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (!email.trim()) {
        throw new Error("Email is required.");
      }

      if (mode === "reset") {
        await sendAeoPasswordReset(email);
        setMessage("Password reset email sent. Check your inbox.");
        trackGa4("aeo_auth_reset_sent", {source});
        return;
      }

      if (!password.trim()) {
        throw new Error("Password is required.");
      }

      if (password.trim().length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      const idToken = mode === "signup" ?
        await signUpWithEmailForAeoSession(email, password) :
        await signInWithEmailForAeoSession(email, password);

      await createAeoSession(idToken);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("aeo_authed_hint", String(Date.now()));
        window.dispatchEvent(new Event("aeo-auth-changed"));
      }
      trackGa4("aeo_auth_success", {source, method: mode});
      await onSuccess();
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card auth-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="AEO sign in"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <h3>{mode === "signup" ? "Create your AEO account" : mode === "reset" ? "Reset password" : "Sign in to AEO"}</h3>
        <p className="tiny auth-subtitle">
          Unlock hidden blocks, run more scans, and use credit-powered actions.
        </p>

        <div className="auth-mode-switch">
          <button
            type="button"
            className={`auth-mode-button${mode === "signup" ? " active" : ""}`}
            onClick={() => setMode("signup")}
            disabled={busy}
          >
            Create account
          </button>
          <button
            type="button"
            className={`auth-mode-button${mode === "signin" ? " active" : ""}`}
            onClick={() => setMode("signin")}
            disabled={busy}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-mode-button${mode === "reset" ? " active" : ""}`}
            onClick={() => setMode("reset")}
            disabled={busy}
          >
            Forgot password?
          </button>
        </div>

        <button type="button" className="cta-primary modal-google" onClick={() => void handleGoogle()} disabled={busy}>
          {busy ? "Please wait..." : "Continue with Google"}
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleEmailSubmit(event)}>
          <label htmlFor="aeo-auth-email">Email</label>
          <input
            id="aeo-auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
          />

          {mode !== "reset" ? (
            <>
              <label htmlFor="aeo-auth-password">Password</label>
              <input
                id="aeo-auth-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
            </>
          ) : null}

          <button type="submit" className="cta-primary" disabled={busy}>
            {busy ? "Please wait..." : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </button>
        </form>

        <div className="auth-links">
          {mode !== "signin" ? <button type="button" className="auth-link" onClick={() => setMode("signin")} disabled={busy}>Back to sign in</button> : null}
        </div>

        <p className="tiny auth-legal">
          By continuing, you agree to the{" "}
          <a href="https://moads.agency/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
          {" "}and email updates.
        </p>
        {message ? <p className="tiny auth-success">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}
