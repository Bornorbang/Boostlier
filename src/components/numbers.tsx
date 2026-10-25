"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Heart, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { finishPurchase, purchaseKey } from "@/lib/purchase";
import { useAccount } from "./dashboard-shell";
import { Title, Rentals } from "./dashboard";
import { NumberTabs } from "./number-tabs";
import { Alert, Spinner } from "./ui";

type Service = {
  id: string;
  service: string;
  price_usd?: string | null;
  error?: string;
  price_pending?: boolean;
};
type Price = { service: string; price_usd: string | null; error?: string };

export function NumbersDashboard() {
  const { refresh, user } = useAccount();
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const favouriteKey = user ? `boostlier:number-favourites:${user.id}` : null;
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(favouriteKey || "") || "[]",
      );
      setFavourites(
        Array.isArray(saved)
          ? saved.filter((id): id is string => typeof id === "string")
          : [],
      );
    } catch {
      setFavourites([]);
    }
  }, [favouriteKey]);
  function toggleFavourite(id: string) {
    const next = favourites.includes(id)
      ? favourites.filter((item) => item !== id)
      : [...favourites, id];
    setFavourites(next);
    try {
      if (favouriteKey)
        localStorage.setItem(favouriteKey, JSON.stringify(next));
    } catch {}
    scrollRef.current?.scrollTo({ top: 0 });
  }
  const [prices, setPrices] = useState<Record<string, Price>>({});

  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await api<{ items: Service[]; prices_syncing?: boolean }>(
        "/numbers/services",
        {
          signal,
        },
      );
      if (!signal?.aborted) {
        setPrices(
          Object.fromEntries(
            result.items.map((item) => [
              item.id,
              {
                service: item.id,
                price_usd: item.price_usd ?? null,
                error: item.error,
              },
            ]),
          ),
        );
        setSyncing(!!result.prices_syncing);
        setServices(
          [...result.items].sort((a, b) =>
            a.service.localeCompare(b.service, "en-GB", {
              sensitivity: "base",
            }),
          ),
        );
      }
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const visible = useMemo(
    () =>
      services
        .filter((service) =>
          service.service
            .toLocaleLowerCase("en-GB")
            .includes(search.trim().toLocaleLowerCase("en-GB")),
        )
        .sort(
          (a, b) =>
            Number(favourites.includes(b.id)) -
              Number(favourites.includes(a.id)) ||
            a.service.localeCompare(b.service, "en-GB", {
              sensitivity: "base",
            }),
        ),
    [services, favourites, search],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(
      () => load(controller.signal, true),
      syncing ? 30000 : 300000,
    );
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [load, syncing]);
  async function purchase(service: Service) {
    const price = prices[service.id]?.price_usd;
    if (!price || inFlight.current) return;
    inFlight.current = true;
    setBusy(service.id);
    setPurchaseError("");
    setMessage("");
    const input = {
      service: service.id,
      catalogue: "usa",
      country: "usa",
      max_price_usd: price,
    };
    try {
      const result = await api<{ status: string; phone?: string }>("/rent", {
        method: "POST",
        headers: { "Idempotency-Key": purchaseKey("number", input) },
        body: JSON.stringify(input),
      });
      finishPurchase("number", input, result.status);
      setMessage(
        result.status === "active"
          ? `Your number is ready${result.phone ? ": " + result.phone : "."} Request your SMS using this number.`
          : result.status === "cancelled"
            ? "The provider could not supply a number. Reserved funds have been returned to your wallet."
            : "Your order is awaiting provider confirmation. Funds remain reserved; check its status before starting another order.",
      );
      await refresh();
      window.dispatchEvent(new Event("rentals-refresh"));
    } catch (error) {
      setPurchaseError((error as Error).message);
      if (error instanceof ApiError && error.code === "PRICE_EXCEEDS_MAX") {
        setPrices((previous) => {
          const next = { ...previous };
          delete next[service.id];
          return next;
        });
        await load(undefined, true);
      }
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }
  return (
    <>
      <Title
        title="USA Numbers"
        description="Choose a service, get a US mobile number and receive your verification SMS here."
      />
      <NumberTabs active="numbers" />
      {message && <Alert>{message}</Alert>}
      {purchaseError && <Alert kind="error">{purchaseError}</Alert>}
      <div className="number-order-layout number-service-layout">
        <section className="panel number-services">
          <div className="panel-head">
            <h3>Get USA Number</h3>
            <Flag size={20} />
          </div>
          <p>Click a service to purchase a USA number instantly</p>
          <div className="search-input number-service-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search USA services"
              placeholder="Search services"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
            />
          </div>
          {error && (
            <Alert kind="error">
              {error}
              <button className="button secondary small" onClick={() => load()}>
                Retry connection
              </button>
            </Alert>
          )}
          {loading ? (
            <Spinner />
          ) : (
            <>
              <div
                className="number-services-scroll"
                ref={scrollRef}
                tabIndex={0}
                aria-label="Scrollable number services"
              >
                <table
                  className="number-services-table"
                  aria-label="Number services"
                >
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Price</th>
                      <th aria-label="Favourites" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((service) => {
                      const price = prices[service.id];
                      const enabled = !!price?.price_usd && !busy;
                      return (
                        <tr
                          key={service.id}
                          data-service-id={service.id}
                          className={enabled ? "purchasable" : ""}
                          onClick={() => purchase(service)}
                          aria-busy={busy === service.id}
                        >
                          <td>
                            <button
                              type="button"
                              disabled={!enabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                purchase(service);
                              }}
                              aria-label={
                                price?.price_usd
                                  ? `Buy ${service.service} for \u0024${price.price_usd}`
                                  : service.service
                              }
                            >
                              {service.service}
                            </button>
                          </td>
                          <td>
                            {busy === service.id ? (
                              <Spinner />
                            ) : price?.price_usd ? (
                              `\u0024${price.price_usd}`
                            ) : price ? (
                              <span className="muted" title={price.error}>
                                {service.price_pending
                                  ? "Price pending"
                                  : "Unavailable"}
                              </span>
                            ) : (
                              <span className="muted">Price pending</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="number-favourite"
                              aria-label={`Favourite ${service.service}`}
                              aria-pressed={favourites.includes(service.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleFavourite(service.id);
                              }}
                            >
                              <Heart
                                size={18}
                                fill={
                                  favourites.includes(service.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!visible.length && (
                      <tr>
                        <td colSpan={3} className="muted">
                          {search.trim()
                            ? "No services match your search."
                            : "No services are available."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <Rentals product="usa" active />
      </div>
    </>
  );
}
