"use client";

import {useEffect, useState} from "react";

import {apiRequest} from "../lib/api";
import {trackGa4} from "../lib/analytics";

interface PackItem {
  priceId: string;
  name: string;
  creditsAmount: number;
  amountMinor: number;
  currencyCode: string;
}

interface CreditPacksModalProps {
  open: boolean;
  onClose: () => void;
  source: string;
}

export function CreditPacksModal({open, onClose, source}: CreditPacksModalProps) {
  const [packs, setPacks] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<{packs: PackItem[]}>("/v1/aeo/pricing/credit-packs");
        setPacks(response.packs);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load packs.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

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

  async function startCheckout(priceId: string): Promise<void> {
    setCheckoutBusy(priceId);
    setError(null);

    try {
      const response = await apiRequest<{redirectUrl: string}>("/v1/aeo/orders/checkout", {
        method: "POST",
        body: JSON.stringify({
          priceId,
          attribution: {
            capturedAtMs: Date.now(),
            landingUrl: window.location.href,
          },
        }),
      });

      trackGa4("aeo_pack_checkout_started", {source, price_id: priceId});
      window.location.href = response.redirectUrl;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout failed.");
      setCheckoutBusy(null);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card packs-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AEO credit packs"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>Choose your AEO credit pack</h3>
        <p className="tiny auth-subtitle">Get tips to boost your AEO and keep scans moving.</p>

        {loading ? (
          <div className="skeleton-pulse" />
        ) : (
          <div className="packs-grid">
            {packs.map((pack, index) => (
              <article key={pack.priceId} className={`pack-item${index === 1 ? " popular" : ""}`}>
                {index === 1 ? <span className="popular-badge">Most Popular</span> : null}
                <h4>{pack.name}</h4>
                <p className="pack-price">
                  ${(pack.amountMinor / 100).toFixed(2)}
                  {" "}
                  <span>{pack.currencyCode}</span>
                </p>
                <p className="tiny">{pack.creditsAmount} credits</p>
                <button
                  type="button"
                  className="cta-primary"
                  onClick={() => void startCheckout(pack.priceId)}
                  disabled={checkoutBusy === pack.priceId}
                >
                  {checkoutBusy === pack.priceId ? "Opening..." : "Buy pack"}
                </button>
              </article>
            ))}
          </div>
        )}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}
