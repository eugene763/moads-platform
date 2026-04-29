"use client";

import Link from "next/link";
import {useEffect, useState} from "react";

type PaymentState = "success" | "cancel";

interface PaymentReturnState {
  payment: PaymentState;
  pack: string | null;
  credits: string | null;
  status: string | null;
  error: string | null;
  message: string | null;
  paymentId: string | null;
  email: string | null;
}

const PAYMENT_QUERY_KEYS = [
  "payment",
  "pack",
  "credits",
  "status",
  "error",
  "message",
  "payment_id",
  "email",
];

function cleanValue(value: string | null, maxLength = 120): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[<>]/g, "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function readPaymentState(): PaymentReturnState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const payment = cleanValue(params.get("payment"), 24);
  if (payment !== "success" && payment !== "cancel") {
    return null;
  }

  return {
    payment,
    pack: cleanValue(params.get("pack"), 24),
    credits: cleanValue(params.get("credits"), 16),
    status: cleanValue(params.get("status"), 60),
    error: cleanValue(params.get("error"), 120),
    message: cleanValue(params.get("message"), 120),
    paymentId: cleanValue(params.get("payment_id"), 80),
    email: cleanValue(params.get("email"), 120),
  };
}

function cleanPaymentParams(): void {
  const url = new URL(window.location.href);
  for (const key of PAYMENT_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

export function PaymentReturnModal() {
  const [state, setState] = useState<PaymentReturnState | null>(null);

  useEffect(() => {
    setState(readPaymentState());
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [state]);

  if (!state) {
    return null;
  }

  const isSuccess = state.payment === "success";
  const detail = state.message ?? state.error ?? state.status;

  function closeModal(): void {
    cleanPaymentParams();
    setState(null);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={closeModal}>
      <section
        className={`modal-card payment-return-modal ${isSuccess ? "payment-success" : "payment-cancel"}`}
        role="dialog"
        aria-modal="true"
        aria-label={isSuccess ? "Credits added" : "Payment cancelled"}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
          x
        </button>
        <p className="payment-return-kicker">{isSuccess ? "Payment complete" : "Payment not completed"}</p>
        <h3>{isSuccess ? "Credits added" : "Payment cancelled"}</h3>
        <p className="payment-return-body">
          {isSuccess ? "Your credit pack was purchased successfully." : "Your payment was not completed. You can try again anytime."}
        </p>
        {isSuccess && state.credits ? (
          <p className="payment-return-detail">{state.credits} credits added to your account.</p>
        ) : null}
        {!isSuccess && detail ? (
          <p className="payment-return-detail">Detail: {detail}</p>
        ) : null}
        {state.paymentId ? <p className="tiny">Payment ID: {state.paymentId}</p> : null}
        {state.email ? <p className="tiny">Email: {state.email}</p> : null}

        <div className="payment-return-actions">
          {isSuccess ? (
            <>
              <Link className="cta-primary" href="/dashboard#billing" onClick={closeModal}>Open account</Link>
              <Link className="cta-ghost" href="/scans" onClick={closeModal}>Run Deep Site Scan</Link>
            </>
          ) : (
            <Link className="cta-primary" href="/scans?intent=buy-credits" onClick={closeModal}>Choose another pack</Link>
          )}
        </div>
      </section>
    </div>
  );
}
