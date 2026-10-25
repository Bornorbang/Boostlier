"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, Spinner } from "./ui";

type Options = {
  provider: string;
  providers: { id: string; name: string; test_mode: boolean }[];
  country: string;
  enabled: boolean;
  minimum_usd: string;
  maximum_usd: string;
  countries: { code: string; name: string }[];
};
type Quote = {
  provider: string;
  id: string;
  wallet_amount_usd: string;
  checkout_amount: string;
  checkout_currency: string;
  payment_options: string;
  expires_at: string;
  fallback: boolean;
};
export function WalletFunding() {
  const [options, setOptions] = useState<Options>();
  const [country, setCountry] = useState("OTHER");
  const [provider, setProvider] = useState("stripe");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("checkout") === "cancelled")
      setCancelled(true);
    api<Options>("/payments/options")
      .then((o) => {
        setOptions(o);
        setCountry(o.country);
        setProvider(o.provider);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const normalized = /^\d{1,7}(\.\d{0,2})?$/.test(amount)
    ? Number(amount).toFixed(2)
    : "";
  useEffect(() => {
    let active = true;
    setQuote(undefined);
    setMessage("");
    if (
      !options?.enabled ||
      !normalized ||
      Number(normalized) < Number(options.minimum_usd) ||
      Number(normalized) > Number(options.maximum_usd)
    ) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const timer = setTimeout(() => {
      api<Quote>("/payments/quote", {
        method: "POST",
        body: JSON.stringify({ amount_usd: normalized, country, provider }),
      })
        .then((q) => {
          if (active) setQuote(q);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        })
        .finally(() => {
          if (active) setQuoting(false);
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalized, country, provider, options, revision]);
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(
      () => {
        setQuote(undefined);
        setMessage("This price quote expired. Refresh it to continue.");
      },
      Math.max(0, Date.parse(quote.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [quote]);
  return (
    <section className="panel wallet-funding-card">
      <h1 className="wallet-funding-title">
        <Wallet size={25} aria-hidden="true" />
        Add funds
      </h1>
      <p className="muted">
        Fund your Boostlier wallet with our secured checkout
      </p>
      {cancelled && (
        <Alert>Checkout was cancelled. You can start again below.</Alert>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!quote) return;
          setBusy(true);
          setMessage("");
          try {
            const r = await api<{ checkout_url: string }>(
              "/payments/checkout",
              { method: "POST", body: JSON.stringify({ quote_id: quote.id }) },
            );
            location.assign(r.checkout_url);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {options && options.providers.length > 1 && (
          <label className="field">
            <span>Payment method</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={busy}
            >
              {options.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {provider === "flutterwave" && (
          <label className="field">
            <span>Payment country</span>
            <select
              aria-label="Payment country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={busy || !options}
            >
              {(
                options?.countries || [
                  { code: "OTHER", name: "Other / pay in USD" },
                ]
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <input
            id="wallet-amount"
            aria-label="Amount (USD)"
            name="amount"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            placeholder="Enter amount in USD"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="form-actions" aria-label="Suggested amounts">
          {[1, 5, 10, 20, 50].map((n) => (
            <button
              type="button"
              className="button secondary small"
              key={n}
              disabled={busy}
              onClick={() => setAmount(n.toFixed(2))}
            >
              ${n}
            </button>
          ))}
        </div>
        <button className="button" disabled={busy || quoting || !quote}>
          {busy || quoting ? <Spinner /> : "Fund Wallet"}
          <ArrowUpRight size={15} />
        </button>
        {message && (
          <button
            type="button"
            className="button secondary small"
            disabled={busy || quoting}
            onClick={() => setRevision((r) => r + 1)}
            style={{ marginTop: 12 }}
          >
            Refresh quote
          </button>
        )}
      </form>
      <Link className="wallet-activity-link" href="/dashboard/wallet/activity">
        Wallet activity
      </Link>
      {message && <Alert kind="error">{message}</Alert>}
    </section>
  );
}
