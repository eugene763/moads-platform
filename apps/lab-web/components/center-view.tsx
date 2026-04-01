"use client";

import {useEffect, useMemo, useState} from "react";

import {apiRequest} from "../lib/api";
import {trackGa4} from "../lib/analytics";
import {signInForLabSession} from "../lib/firebase";

interface CenterResponse {
  accountId: string;
  wallet: {balance: number};
  starterOffer: {
    offerId: string;
    status: string;
    startedAt: string;
    expiresAt: string;
    consumedAt: string | null;
  };
  products: Array<{productCode: string; productName: string; status: string}>;
  orders: Array<{orderId: string; status: string; amountMinor: number; currencyCode: string; billingProductName: string}>;
  creditPacks: Array<{priceId: string; name: string; creditsAmount: number; amountMinor: number; currencyCode: string}>;
}

function badgeClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("active") || normalized.includes("fulfilled")) {
    return "badge badge-low";
  }
  if (normalized.includes("pending") || normalized.includes("launch")) {
    return "badge badge-med";
  }
  return "badge badge-score";
}

export function CenterView() {
  const [center, setCenter] = useState<CenterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInBusy, setSignInBusy] = useState(false);
  const [checkoutBusyPriceId, setCheckoutBusyPriceId] = useState<string | null>(null);

  async function loadCenter(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<CenterResponse>("/v1/lab/center");
      setCenter(response);
      trackGa4("lab_center_view");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCenter();
  }, []);

  async function signIn(): Promise<void> {
    setSignInBusy(true);
    setError(null);

    try {
      const idToken = await signInForLabSession();
      await apiRequest("/v1/auth/session-login", {
        method: "POST",
        body: JSON.stringify({
          idToken,
          productCode: "lab",
        }),
      });
      await loadCenter();
      trackGa4("lab_signin_success");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign in failed.");
    } finally {
      setSignInBusy(false);
    }
  }

  async function checkout(priceId: string): Promise<void> {
    setCheckoutBusyPriceId(priceId);
    setError(null);

    try {
      const response = await apiRequest<{redirectUrl: string}>("/v1/lab/starter/checkout", {
        method: "POST",
        body: JSON.stringify({priceId}),
      });
      trackGa4("lab_checkout_started", {price_id: priceId});
      window.location.href = response.redirectUrl;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Checkout failed.");
    } finally {
      setCheckoutBusyPriceId(null);
    }
  }

  const remainingOfferMs = useMemo(() => {
    if (!center?.starterOffer.expiresAt) {
      return null;
    }
    return new Date(center.starterOffer.expiresAt).getTime() - Date.now();
  }, [center?.starterOffer.expiresAt]);

  if (loading) {
    return (
      <div className="panel">
        <div className="skeleton-pulse" />
      </div>
    );
  }

  if (!center) {
    return (
      <div className="state-card">
        <h2>LAB Center</h2>
        <p>Sign in to view wallet, credit packs, launch offers, and AEO order history.</p>
        <button className="cta-primary" type="button" onClick={signIn} disabled={signInBusy}>
          {signInBusy ? "Signing in..." : "Sign In"}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="center-grid">
      <section className="panel">
        <div className="panel-header">
          <h2>Launch State</h2>
          <span className="badge badge-score">{center.wallet.balance} credits</span>
        </div>
        <div className="summary-stack">
          <p>Account: {center.accountId}</p>
          <p>Starter launch offer: <strong>{center.starterOffer.status}</strong></p>
          <p>Offer timer: {remainingOfferMs != null ? `${Math.max(0, Math.floor(remainingOfferMs / 60000))} min` : "--"}</p>
          <p className="tiny">Starter, Pro, and Store subscriptions remain coming soon during this launch phase.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Access Queue</h2>
          <span className="badge badge-score">{center.products.length} items</span>
        </div>
        <ul className="list">
          {center.products.map((product) => (
            <li key={product.productCode}>
              <div>
                <p className="list-title">{product.productName}</p>
                <p className="tiny">{product.productCode}</p>
              </div>
              <span className={badgeClass(product.status)}>{product.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>AEO Credit Packs</h2>
          <span className="badge badge-score">Live checkout</span>
        </div>
        <div className="cards cards-three">
          {center.creditPacks.map((pack, index) => (
            <article key={pack.priceId} className={`pack-card${index === 1 ? " pack-card-popular" : ""}`}>
              {index === 1 ? <span className="popular-badge">Most Flexible</span> : null}
              <h3>{pack.name}</h3>
              <p className="pack-price">
                ${(pack.amountMinor / 100).toFixed(2)}
                {" "}
                <span>{pack.currencyCode}</span>
              </p>
              <p className="pack-credits">{pack.creditsAmount} credits</p>
              <p className="tiny">Use credits for explicit AI tips and future usage-based actions.</p>
              <button
                className="cta-primary"
                type="button"
                onClick={() => checkout(pack.priceId)}
                disabled={checkoutBusyPriceId === pack.priceId}
              >
                {checkoutBusyPriceId === pack.priceId ? "Opening..." : `Buy ${pack.name}`}
              </button>
            </article>
          ))}
        </div>
        <p className="tiny">Packs are the only live purchase flow in this phase. Monitoring subscriptions stay lead-based.</p>
      </section>

      <section className="panel full">
        <div className="panel-header">
          <h2>Orders</h2>
          <span className="badge badge-score">{center.orders.length} total</span>
        </div>
        {center.orders.length ? (
          <ul className="list">
            {center.orders.map((order) => (
              <li key={order.orderId}>
                <div>
                  <p className="list-title">{order.billingProductName}</p>
                  <p className="tiny">{order.orderId}</p>
                </div>
                <span className={badgeClass(order.status)}>{order.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="surface-card">
            <p className="list-title">No orders yet</p>
            <p className="tiny">Buy a pack to see paid order history here.</p>
          </div>
        )}
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
