"use client";
import { useEffect, useRef, useState } from "react";
import { Search, RefreshCw, CloudOff, ArrowUpRight, Info } from "lucide-react";
import { FlagIcon } from "./flag";
import { api, Snapshot } from "@/lib/api";
import { OrderButton, Alert, Spinner } from "./ui";
const countries = [
  ["united-kingdom", "🇬🇧 United Kingdom"],
  ["usa", "🇺🇸 United States"],
  ["germany", "🇩🇪 Germany"],
  ["france", "🇫🇷 France"],
  ["netherlands", "🇳🇱 Netherlands"],
  ["canada", "🇨🇦 Canada"],
  ["australia", "🇦🇺 Australia"],
  ["india", "🇮🇳 India"],
];
export function PricingTable({
  initial,
  catalogue = "usa",
  wholesale = false,
  interactiveOrder = false,
}: {
  initial: Snapshot;
  catalogue?: string;
  wholesale?: boolean;
  interactiveOrder?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("united-kingdom");
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<Snapshot>(
      `/public/prices?catalogue=${catalogue}&country=${country}&wholesale=${wholesale ? 1 : 0}`,
      { signal: controller.signal },
    )
      .then((v) => {
        if (!controller.signal.aborted) setSnapshot(v);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSnapshot({
            items: [],
            state: "unavailable",
            message: "We could not load this catalogue. Please retry.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [country, catalogue, revision, wholesale]);
  useEffect(() => {
    if (interactiveOrder) {
      const selected = new URLSearchParams(location.search).get("service");
      if (selected) setSearch(selected);
    }
  }, [interactiveOrder]);
  const rows = snapshot.items.filter((r) =>
    r.service.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          {catalogue === "usa"
            ? "🇺🇸 USA Service Prices"
            : "🌍 All Countries Prices"}
        </h2>
        <span className="badge neutral">
          {wholesale ? "Wholesale · USD" : "Retail · USD"}
        </span>
      </div>
      <div className="toolbar">
        {catalogue !== "usa" && (
          <>
            <label className="search-input">
              <Search size={15} />
              <input
                aria-label="Search countries"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search countries"
              />
            </label>
            <label className="field">
              <span className="sr-only">Country</span>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <FlagIcon country={country} />
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {countries
                    .filter(
                      ([id, label]) =>
                        id === country ||
                        label
                          .toLowerCase()
                          .includes(countrySearch.toLowerCase()),
                    )
                    .map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                </select>
              </div>
            </label>
          </>
        )}
        <label className="search-input">
          <Search size={15} />
          <input
            aria-label="Search services"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for a service…"
          />
        </label>
        <button
          className="icon-button"
          aria-label="Refresh pricing"
          onClick={() => setRevision((v) => v + 1)}
          disabled={loading}
        >
          {loading ? <Spinner /> : <RefreshCw size={16} />}
        </button>
      </div>
      {snapshot.state === "stale" && (
        <Alert>
          Showing a previous successful snapshot from{" "}
          {snapshot.updated_at
            ? new Date(snapshot.updated_at).toLocaleString("en-GB", {
                timeZone: "Europe/London",
              })
            : "an earlier update"}
          . Final stock and price require confirmation.
        </Alert>
      )}
      <div className="table-scroll" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              {catalogue === "usa" && <th>Duration</th>}
              <th>Stock</th>
              <th>Price (USD)</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.service}</strong>
                  </td>
                  {catalogue === "usa" && (
                    <td>{row.duration_minutes} minutes</td>
                  )}
                  <td>{row.stock}</td>
                  <td>${row.price_usd}</td>
                  <td>
                    {interactiveOrder ? (
                      <button
                        className="button small"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("select-service", {
                              detail: { ...row, catalogue, country },
                            }),
                          )
                        }
                      >
                        Select <ArrowUpRight size={12} />
                      </button>
                    ) : (
                      <OrderButton
                        label="Rent"
                        href={`/dashboard/${catalogue === "usa" ? "usa" : "global"}?service=${encodeURIComponent(row.id)}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {loading ? (
        <div className="empty-state">
          <Spinner />
          <p>Checking current availability…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <CloudOff size={29} />
          <h3>
            {snapshot.state === "unavailable"
              ? "Live catalogue unavailable"
              : "No matching services"}
          </h3>
          <p>
            {snapshot.state === "unavailable"
              ? snapshot.message
              : "Try another search or country. Availability changes throughout the day."}
          </p>
        </div>
      ) : null}
      <div className="notice-inline">
        <Info size={13} /> Final price and stock are confirmed when placing an
        order.
      </div>
    </section>
  );
}
