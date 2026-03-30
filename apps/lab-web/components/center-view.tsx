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
    return <div className="state-card">Loading LAB center...</div>;
  }

  if (!center) {
    return (
      <div className="state-card">
        <h2>LAB Center</h2>
        <p>Sign in to view wallet, offers and starter billing.</p>
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
        <h2>Plan State</h2>
        <p>Account: {center.accountId}</p>
        <p>Wallet credits: <strong>{center.wallet.balance}</strong></p>
        <p>Starter offer: <strong>{center.starterOffer.status}</strong></p>
        <p>
          Offer timer: {remainingOfferMs != null ? `${Math.max(0, Math.floor(remainingOfferMs / 60000))} min` : "--"}
        </p>
      </section>

      <section className="panel">
        <h2>Products</h2>
        <ul className="list">
          {center.products.map((product) => (
            <li key={product.productCode}>
              <div>
                <p className="list-title">{product.productName}</p>
                <p className="tiny">{product.productCode}</p>
              </div>
              <span className="badge">{product.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel full">
        <h2>Starter Credit Packs</h2>
        <div className="cards three">
          {center.creditPacks.map((pack) => (
            <article key={pack.priceId}>
              <h3>{pack.name}</h3>
              <p>{pack.creditsAmount} credits</p>
              <p className="tiny">{(pack.amountMinor / 100).toFixed(2)} {pack.currencyCode}</p>
              <button
                className="cta-primary"
                type="button"
                onClick={() => checkout(pack.priceId)}
                disabled={checkoutBusyPriceId === pack.priceId}
              >
                {checkoutBusyPriceId === pack.priceId ? "Opening..." : "Start Starter"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel full">
        <h2>Orders</h2>
        <ul className="list">
          {center.orders.map((order) => (
            <li key={order.orderId}>
              <div>
                <p className="list-title">{order.billingProductName}</p>
                <p className="tiny">{order.orderId}</p>
              </div>
              <span className="badge">{order.status}</span>
            </li>
          ))}
        </ul>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
