"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { date } from "@/lib/config";
import { finishPurchase, purchaseKey } from "@/lib/purchase";
import { useAccount } from "./dashboard-shell";
import { Title, Empty } from "./dashboard";
import { Alert, Spinner } from "./ui";

type Service = {
  id: string;
  name: string;
  category: string;
  description: string;
  minimum: number;
  maximum: number;
  type: string;
  supported: boolean;
  refill: boolean;
  cancel: false;
  unavailable_reason: string | null;
};
type Refill = { id: string; status: string };
type Order = {
  id: string;
  service: string;
  service_name: string;
  target: string;
  quantity: number;
  price_usd: string;
  status: string;
  start_count: number | null;
  remaining: number | null;
  refill_supported: boolean;
  refill: Refill | null;
  awaiting_provisioning: boolean;
  refund_review_required: boolean;
  created_at: string;
};
type Listing = {
  items: Order[];
  pending: Order[];
  page: number;
  per_page: number;
  total: number;
};
const terminal = ["completed", "cancelled", "partial", "rejected"];

function CategoryDropdown({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const options = ["", ...categories].filter((c) =>
    (c || "All categories").toLowerCase().includes(search.trim().toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    root.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (category: string) => {
    onChange(category);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="field category-dropdown"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label id="category-label" htmlFor="boost-category">
        Category
      </label>
      <button
        type="button"
        id="boost-category"
        className="category-trigger"
        ref={trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="category-options"
        onClick={() => {
          setSearch("");
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSearch("");
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <span>{value || "All categories"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="category-popup">
          <div className="search-input">
            <Search size={15} />
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-label="Search categories"
              aria-expanded={open}
              aria-controls="category-options"
              aria-autocomplete="list"
              aria-activedescendant={
                options.length ? `category-option-${active}` : undefined
              }
              value={search}
              placeholder="Search categories..."
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  setActive((current) =>
                    options.length
                      ? (current +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          options.length) %
                        options.length
                      : 0,
                  );
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (options[active] !== undefined) choose(options[active]);
                }
              }}
            />
          </div>
          <div
            id="category-options"
            role="listbox"
            aria-labelledby="category-label"
            className="category-options"
          >
            {options.map((category, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`category-option-${index}`}
                key={category}
                aria-selected={value === category}
                data-active={active === index}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(category)}
              >
                {category || "All categories"}
              </button>
            ))}
            {!options.length && <p role="status">No categories found.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Boost({ orders = false }: { orders?: boolean }) {
  const { balance, refresh } = useAccount();
  const [catalogue, setCatalogue] = useState<Service[]>([]),
    [catalogueMessage, setCatalogueMessage] = useState(""),
    [catalogueError, setCatalogueError] = useState(""),
    [loading, setLoading] = useState(!orders);
  const [category, setCategory] = useState(""),
    [selected, setSelected] = useState(""),
    [quantity, setQuantity] = useState(""),
    [target, setTarget] = useState("");
  const [quote, setQuote] = useState<{
      service: string;
      quantity: number;
      price_usd: string;
    } | null>(null),
    [quoteError, setQuoteError] = useState(""),
    [quoting, setQuoting] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState<{
      status: string;
      resource_id?: string;
    } | null>(null);
  const [page, setPage] = useState(1),
    [listing, setListing] = useState<Listing>({
      items: [],
      pending: [],
      page: 1,
      per_page: 20,
      total: 0,
    }),
    [statusFilter, setStatusFilter] = useState("");
  const [fundsToast, setFundsToast] = useState(0);
  useEffect(() => {
    if (!fundsToast) return;
    const timer = setTimeout(() => setFundsToast(0), 6000);
    return () => clearTimeout(timer);
  }, [fundsToast]);
  const mounted = useRef(true),
    inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const value = await api<Listing>(`/smm/orders?page=${page}`, { signal });
      if (mounted.current && !signal?.aborted) setListing(value);
    },
    [page],
  );
  const loadCatalogue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setCatalogueError("");
    try {
      const value = await api<{ items: Service[]; message?: string }>(
        "/smm/catalogue",
        { signal },
      );
      if (!signal?.aborted) {
        setCatalogue(value.items);
        setCatalogueMessage(value.message || "");
      }
    } catch (e) {
      if (!signal?.aborted) setCatalogueError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (orders)
      load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    else loadCatalogue(controller.signal);
    return () => controller.abort();
  }, [orders, load, loadCatalogue]);
  const service = catalogue.find((s) => s.id === selected),
    qty = Number(quantity);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(catalogue.filter((s) => s.supported).map((s) => s.category)),
      ).sort((a, b) => a.localeCompare(b, "en-GB")),
    [catalogue],
  );
  const matches = useMemo(
    () =>
      catalogue.filter(
        (s) => (!category || s.category === category) && s.supported,
      ),
    [catalogue, category],
  );
  const choices = matches.slice(0, 250);
  if (service && !choices.some((s) => s.id === service.id))
    choices.unshift(service);
  const validQuantity =
    !!service &&
    service.supported &&
    Number.isInteger(qty) &&
    qty >= service.minimum &&
    qty <= service.maximum;
  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    setQuoting(false);
    if (!validQuantity || !selected) return;
    const controller = new AbortController();
    setQuoting(true);
    const timer = setTimeout(() => {
      api<{ price_usd: string }>("/smm/quote", {
        method: "POST",
        body: JSON.stringify({ service: selected, quantity: qty }),
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted)
            setQuote({
              service: selected,
              quantity: qty,
              price_usd: value.price_usd,
            });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setQuoteError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoting(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [selected, qty, validQuantity]);
  const currentQuote =
    quote?.service === selected && quote.quantity === qty ? quote : null;
  const fundsEnough =
    !!currentQuote && Number(balance) >= Number(currentQuote.price_usd);
  const pollable = listing.items.filter(
    (o) =>
      !terminal.includes(o.status) ||
      (!!o.refill && ["pending", "active"].includes(o.refill.status)),
  );
  const sync = useCallback(
    async (signal?: AbortSignal) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const batch = listing.items
          .filter((o) => !terminal.includes(o.status))
          .slice(0, 4);
        for (const order of batch) {
          await api("/smm/status", {
            method: "POST",
            body: JSON.stringify({ id: order.id }),
            signal,
          });
        }
        for (const order of listing.items
          .filter(
            (o) => o.refill && ["pending", "active"].includes(o.refill.status),
          )
          .slice(0, 2)) {
          await api("/smm/refill-status", {
            method: "POST",
            body: JSON.stringify({ id: order.refill!.id }),
            signal,
          });
        }
        await load(signal);
        await refresh();
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        inFlight.current = false;
      }
    },
    [listing.items, load, refresh],
  );
  useEffect(() => {
    if (!orders || pollable.length === 0) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (!document.hidden) sync(controller.signal);
    }, 15000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [orders, pollable.length, sync]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentQuote || !service?.supported || busy || submitted) return;
    if (!fundsEnough) {
      setFundsToast(Date.now());
      return;
    }
    const payload = {
      service: selected,
      target: target.trim(),
      quantity: qty,
      max_price_usd: currentQuote.price_usd,
    };
    setBusy(true);
    setError("");
    try {
      const value = await api<{ status: string; resource_id?: string }>(
        "/smm/purchase",
        {
          method: "POST",
          headers: { "Idempotency-Key": purchaseKey("smm", payload) },
          body: JSON.stringify(payload),
        },
      );
      setSubmitted(value);
      if (value.status === "rejected") {
        setMessage(
          "The provider rejected this submission. Your reserved wallet funds have been released.",
        );
      } else if (value.status === "completed") {
        setMessage(
          "Your order has been accepted. Follow its progress in order history.",
        );
      } else {
        setMessage(
          "Submission is awaiting confirmation. Funds remain reserved; check this order before placing a replacement.",
        );
      }
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_FUNDS") {
        setFundsToast(Date.now());
        await refresh();
        return;
      }
      setError(
        (e as Error).message +
          " If the request timed out, retry with the same details to retrieve its recorded outcome.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function orderAction(
    order: Order,
    action: "status" | "refill" | "refill-status",
  ) {
    setError("");
    setBusy(true);
    try {
      await api("/smm/" + action, {
        method: "POST",
        body: JSON.stringify({
          id: action === "refill-status" ? order.refill?.id : order.id,
        }),
      });
      await load();
      await refresh();
      if (action === "refill")
        setMessage("Refill request recorded. Check its status below.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = listing.items.filter(
    (o) => !statusFilter || o.status === statusFilter,
  );
  return (
    <>
      <Title
        title="Boost Account"
        description="Choose your service. Set your quantity. Keep every order in one place."
      />
      <div className="tabs">
        <Link
          href="/boost-account/new-order"
          className={!orders ? "active" : ""}
        >
          New order
        </Link>
        <Link href="/boost-account/orders" className={orders ? "active" : ""}>
          Order history
        </Link>
      </div>
      {fundsToast > 0 && (
        <div className="boost-toast" role="alert" key={fundsToast}>
          <span>
            Insufficient wallet balance. Please add funds before placing your
            order.
          </span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setFundsToast(0)}
          >
            {"\u00d7"}
          </button>
        </div>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {message && (
        <Alert kind={submitted?.status === "rejected" ? "error" : "info"}>
          {message}
        </Alert>
      )}
      {orders ? (
        <>
          <div className="toolbar boost-orders-toolbar">
            <label className="field">
              <span>Order status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses on this page</option>
                {[
                  "pending",
                  "active",
                  "completed",
                  "partial",
                  "cancelled",
                  "reconciliation",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => sync()}
            >
              <RefreshCw size={14} />
              Refresh orders
            </button>
          </div>
          {listing.pending.length > 0 && (
            <section className="panel">
              <h3>Submission updates</h3>
              {listing.pending.map((o) => (
                <article className="boost-pending" key={o.id}>
                  <span className="badge neutral">
                    {o.status === "rejected"
                      ? "Rejected — funds released"
                      : "Awaiting confirmation"}
                  </span>
                  <p>
                    Service {o.service} · {o.quantity.toLocaleString("en-GB")}{" "}
                    units · ${o.price_usd} USD
                  </p>
                  <code>{o.id}</code>
                  {o.status !== "rejected" && (
                    <p>
                      Keep this reference. Do not place a replacement while the
                      provider outcome is unknown.
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h3>Your orders</h3>
              <span className="badge neutral">{listing.total} orders</span>
            </div>
            {visible.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Order / service</th>
                      <th>Quantity</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Start count</th>
                      <th>Remaining</th>
                      <th>Refill</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.service_name}</strong>
                          <small className="muted boost-order-date">
                            {date(o.created_at)}
                          </small>
                        </td>
                        <td>{o.quantity.toLocaleString("en-GB")}</td>
                        <td>${o.price_usd}</td>
                        <td>
                          <span className="badge neutral">{o.status}</span>
                          {o.refund_review_required && (
                            <small className="boost-order-id">
                              Wallet refund requires support review
                            </small>
                          )}
                        </td>
                        <td>{o.start_count?.toLocaleString("en-GB") ?? "—"}</td>
                        <td>{o.remaining?.toLocaleString("en-GB") ?? "—"}</td>
                        <td>
                          {o.refill?.status ||
                            (o.refill_supported ? "Available" : "Not offered")}
                        </td>
                        <td>
                          <div className="boost-row-actions">
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => orderAction(o, "status")}
                            >
                              Refresh
                            </button>
                            {o.refill_supported &&
                              o.status !== "cancelled" &&
                              (!o.refill ||
                                ["completed", "failed"].includes(
                                  o.refill.status,
                                )) && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() => orderAction(o, "refill")}
                                >
                                  Request refill
                                </button>
                              )}
                            {o.refill &&
                              ["pending", "active"].includes(
                                o.refill.status,
                              ) && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() =>
                                    orderAction(o, "refill-status")
                                  }
                                >
                                  Check refill
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Your next boost starts here"
                description="Confirmed promotion orders, progress and refill information will appear here."
              />
            )}
            <div className="form-actions">
              <button
                className="button secondary small"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="muted">Page {page}</span>
              <button
                className="button secondary small"
                disabled={page * listing.per_page >= listing.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
          <p className="fine-print">
            Order cancellation is unavailable. Partial or cancelled provider
            outcomes require review before any customer wallet refund.
          </p>
        </>
      ) : submitted ? (
        <section className="panel boost-confirmed">
          <CheckCircle2 size={36} />
          <h2>
            {submitted.status === "completed"
              ? "Your order is on its way"
              : submitted.status === "rejected"
                ? "Submission rejected"
                : "We’re confirming your order"}
          </h2>
          <p>{message}</p>
          <div className="form-actions">
            <Link className="button" href="/boost-account/orders">
              View order history <ArrowUpRight size={14} />
            </Link>
            {["completed", "rejected"].includes(submitted.status) && (
              <button
                className="button secondary"
                onClick={() => {
                  if (currentQuote)
                    finishPurchase(
                      "smm",
                      {
                        service: selected,
                        target: target.trim(),
                        quantity: qty,
                        max_price_usd: currentQuote.price_usd,
                      },
                      "completed",
                    );
                  setSubmitted(null);
                  setMessage("");
                  setTarget("");
                }}
              >
                Start a new order
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="boost-layout">
          <div className="boost-builder">
            <section className="panel">
              <div className="panel-head">
                <h3>Build your next boost</h3>
              </div>
              {catalogueMessage && <Alert>{catalogueMessage}</Alert>}
              {catalogueError && (
                <Alert kind="error">
                  {catalogueError}
                  <button
                    className="button secondary small"
                    onClick={() => loadCatalogue()}
                  >
                    Retry
                  </button>
                </Alert>
              )}
              {loading ? (
                <Empty
                  title="Finding your services…"
                  description="Loading the latest provider catalogue."
                />
              ) : (
                <form id="boost-order-form" onSubmit={submit}>
                  <CategoryDropdown
                    categories={categories}
                    value={category}
                    onChange={(value) => {
                      setCategory(value);
                      setSelected("");
                    }}
                  />
                  <label className="field">
                    <span>Service</span>
                    <select
                      required
                      aria-label="Service"
                      value={selected}
                      onChange={(e) => {
                        const s = catalogue.find(
                          (s) => s.id === e.target.value,
                        );
                        setSelected(e.target.value);
                        setQuantity(s ? String(s.minimum) : "");
                      }}
                    >
                      <option value="">Select a service</option>
                      {choices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} · {s.name}
                          {s.supported ? "" : " · Extra fields required"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {service && !service.supported && (
                    <Alert>{service.unavailable_reason}</Alert>
                  )}
                  <label className="field">
                    <span>Public target link</span>
                    <input
                      name="target"
                      type="url"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="https://…"
                      maxLength={2048}
                      required
                      disabled={!service?.supported}
                    />
                    <small className="muted">
                      Use the profile, post, video or page URL requested by your
                      service.
                    </small>
                  </label>
                  <label className="field">
                    <span>Quantity</span>
                    <input
                      name="quantity"
                      type="number"
                      step={1}
                      min={service?.minimum || 1}
                      max={service?.maximum}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      disabled={!service?.supported}
                      required
                    />
                    {service && (
                      <small className="muted">
                        Min {service.minimum.toLocaleString("en-GB")} · Max{" "}
                        {service.maximum.toLocaleString("en-GB")}
                      </small>
                    )}
                  </label>
                  {quoteError && <Alert kind="error">{quoteError}</Alert>}
                  <div className="notice-inline">
                    <Info size={14} />
                    Check your link and quantity carefully. Orders cannot be
                    cancelled.
                  </div>
                </form>
              )}
            </section>
            <button
              className="button"
              form="boost-order-form"
              type="submit"
              disabled={!currentQuote || busy || !service?.supported}
            >
              {busy ? (
                <Spinner />
              ) : (
                <>
                  Place order <ArrowUpRight size={15} />
                </>
              )}
            </button>
          </div>
          <aside>
            <section className="panel boost-summary">
              <span className="eyebrow">YOUR ORDER AT A GLANCE</span>
              <h3>{service?.name || "Make it your next move."}</h3>
              <dl>
                <div>
                  <dt>Quantity</dt>
                  <dd>{validQuantity ? qty.toLocaleString("en-GB") : "—"}</dd>
                </div>
                <div>
                  <dt>Wallet balance</dt>
                  <dd>${balance} USD</dd>
                </div>
                <div className="boost-total">
                  <dt>Total</dt>
                  <dd>
                    {quoting ? (
                      <Spinner />
                    ) : currentQuote ? (
                      `$${currentQuote.price_usd}`
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              <div className="notice-inline">
                <ShieldCheck size={14} />
                Paid from your prepaid USD wallet.
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
