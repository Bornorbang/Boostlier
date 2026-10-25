"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Info } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { purchaseKey, finishPurchase } from "@/lib/purchase";
import { Title, Rentals } from "./dashboard";
import { NumberTabs } from "./number-tabs";
import { RentalServiceDropdown } from "./number-rentals";
import { useAccount } from "./dashboard-shell";
import { Alert, Spinner } from "./ui";
import { FlagIcon } from "./flag";

type CountryOffer = {
  country: string;
  country_name: string;
  country_code: string | null;
  service: string;
  operator: string;
  success_rate: number;
  stock: number;
  price_usd: string;
  quote_id: string;
};
export function GlobalNumbersDashboard() {
  const { refresh } = useAccount();
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [service, setService] = useState("");
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [country, setCountry] = useState("");
  const [offers, setOffers] = useState<CountryOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: { id: string; name: string }[] }>("/global-numbers/countries", {
      signal: controller.signal,
    }).then((data) => setCountries(data.items)).catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    api<{ items: { id: string; name: string }[] }>("/global-numbers/services", {
      signal: controller.signal,
    })
      .then((data) => setServices(data.items))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!service) return;
      setLoading(true);
      try {
        const data = await api<{
          items: CountryOffer[];
          best_country: string | null;
        }>(`/global-numbers/prices?service=${encodeURIComponent(service)}`, {
          signal,
        });
        if (!signal?.aborted) {
          setOffers(data.items);
          setError("");
        }
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [service],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => {
      if (!document.hidden && !busyRef.current) load(controller.signal);
    }, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    const sync = () => {
      if (!document.hidden && !busyRef.current)
        api("/global-numbers/sync", {
          method: "POST",
          signal: controller.signal,
        })
          .then(() => {
            window.dispatchEvent(new Event("rentals-refresh"));
            return refresh();
          })
          .catch(() => {});
    };
    sync();
    const timer = setInterval(sync, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const visible = useMemo(
    () => offers.filter((row) => row.country === country),
    [offers, country],
  );
  async function purchase(offer: CountryOffer) {
    if (busyRef.current || loading) return;
    busyRef.current = true;
    setBusy(offer.country);
    setError("");
    setMessage("");
    const input = {
      catalogue: "global",
      country: offer.country,
      service: offer.service,
      max_price_usd: offer.price_usd,
      options: { quote_id: offer.quote_id },
    };
    try {
      const result = await api<{ status: string; phone?: string }>("/rent", {
        method: "POST",
        headers: { "Idempotency-Key": purchaseKey("global-number", input) },
        body: JSON.stringify(input),
      });
      finishPurchase("global-number", input, result.status);
      setMessage(
        result.status === "active"
          ? `Your number is ready${result.phone ? `: ${result.phone}` : ""}. Request your SMS using this number.`
          : result.status === "cancelled"
            ? "The number was unavailable. Reserved funds have been returned to your wallet."
            : "We’re confirming your order. Check History before purchasing again; the amount is temporarily reserved.",
      );
      await refresh();
      window.dispatchEvent(new Event("rentals-refresh"));
    } catch (e) {
      if (
        e instanceof ApiError &&
        [
          "QUOTE_EXPIRED",
          "QUOTE_CHANGED",
          "PRICE_EXCEEDS_MAX",
          "OUT_OF_STOCK",
        ].includes(e.code)
      )
        await load();
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  return (
    <>
      <Title
        title="Global Numbers"
        description="Choose a country and service to receive your verification SMS."
      />
      <NumberTabs active="global" />
      {message && <Alert>{message}</Alert>}
      {error && (
        <Alert kind="error">
          {error}
          <button
            className="button secondary small"
            onClick={() => (service ? load() : window.location.reload())}
          >
            Refresh prices
          </button>
        </Alert>
      )}
      <div className="number-order-layout number-service-layout global-number-layout">
        <section className="panel number-services">
          <div className="panel-head">
            <h3>Get a global number</h3>
            <Globe2 size={20} />
          </div>
          <p>
            Choose a country, then a service.
          </p>
          <RentalServiceDropdown
            items={countries}
            value={country}
            disabled={!countries.length || !!busy}
            label="Country"
            placeholder="Choose a country"
            accessibleName="Global country"
            searchLabel="Search global countries"
            onChange={(value) => {
              setCountry(value);
              setService("");
              setOffers([]);
              setLoading(false);
              setError("");
            }}
          />
          <RentalServiceDropdown
            items={services}
            value={service}
            disabled={!country || !services.length || !!busy}
            accessibleName="Global service"
            searchLabel="Search global services"
            onChange={(value) => {
              setService(value);
              setOffers([]);
            }}
          />
          {service && (
            <>
              {loading && !offers.length ? (
                <Spinner />
              ) : (
                <div
                  className="number-services-scroll"
                  tabIndex={0}
                  aria-label="Scrollable global number countries"
                >
                  <table
                    className="global-country-table"
                    aria-label="Global number countries"
                  >
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Price</th>
                        <th><span className="sr-only">Action</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((offer) => (
                        <tr key={offer.country} aria-busy={busy === offer.country}>
                          <td>
                            <span className="global-country-name">
                              <FlagIcon country={offer.country} code={offer.country_code} />
                              <span>{offer.country_name}</span>
                            </span>
                          </td>
                          <td>${offer.price_usd}</td>
                          <td>
                            <button
                              type="button"
                              className="button small"
                              disabled={!!busy || loading}
                              aria-label={`Order ${offer.country_name} for $${offer.price_usd}`}
                              onClick={() => purchase(offer)}
                            >
                              {busy === offer.country ? "Ordering…" : "Order"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!visible.length && (
                        <tr>
                          <td colSpan={3} className="muted">
                            No numbers are currently available for this country and service.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted global-rate-note">
                <Info size={12} aria-hidden="true" />
                <span>
                  Success rate vary. Please cancel and order again if you don't receive SMS
                </span>
              </p>
            </>
          )}
        </section>
        <Rentals product="global" active />
      </div>
    </>
  );
}
