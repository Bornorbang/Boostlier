"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  Inbox,
  Info,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { date } from "@/lib/config";
import { purchaseKey, finishPurchase } from "@/lib/purchase";
import { Title } from "./dashboard";
import { useAccount } from "./dashboard-shell";
import { Alert, CopyButton, Spinner } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";
import { NumberTabs } from "./number-tabs";

type Rental = {
  id: string;
  service: string;
  phone: string;
  duration: string;
  status: string;
  price_usd: string;
  expires_at: string;
  refundable: boolean;
  can_extend: boolean;
};
type Pending = {
  id: string;
  operation: string;
  status: string;
  price_usd: string;
};
type Message = {
  id: string;
  sender: string;
  text: string;
  code: string | null;
  created_at: string | null;
};
type Quote = { price_usd: string; duration: string };
const defaults: Record<string, string> = {
  oneDay: "1 day",
  threeDay: "3 days",
  sevenDay: "7 days",
  fourteenDay: "14 days",
  thirtyDay: "30 days",
  ninetyDay: "90 days",
  oneYear: "1 year",
};

export function RentalServiceDropdown({
  items,
  value,
  disabled,
  onChange,
  label = "Service",
  placeholder = "Choose a service",
  accessibleName = "Rental service",
  searchLabel = "Search rental services",
}: {
  items: { id: string; name: string }[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  accessibleName?: string;
  searchLabel?: string;
}) {
  const dropdownId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const options = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(pointer: coarse)").matches)
      input.current?.focus({ preventScroll: true });
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
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return (
    <div
      className="field category-dropdown"
      ref={root}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label htmlFor={`${dropdownId}-trigger`}>{label}</label>
      <button
        id={`${dropdownId}-trigger`}
        ref={trigger}
        className="category-trigger"
        type="button"
        aria-label={accessibleName}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={`${dropdownId}-options`}
        disabled={disabled}
        onClick={() => {
          setSearch("");
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setSearch("");
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <span>
          {items.find((item) => item.id === value)?.name || placeholder}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && !disabled && (
        <div className="category-popup">
          <div className="search-input">
            <Search size={15} aria-hidden="true" />
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-label={searchLabel}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={`${dropdownId}-options`}
              aria-activedescendant={
                options.length ? `${dropdownId}-option-${active}` : undefined
              }
              value={search}
              placeholder="Search services"
              onChange={(e) => {
                setSearch(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((current) =>
                    options.length
                      ? (current +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          options.length) %
                        options.length
                      : 0,
                  );
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[active]) choose(options[active].id);
                }
              }}
            />
          </div>
          <div
            id={`${dropdownId}-options`}
            className="category-options"
            role="listbox"
            aria-label={`${accessibleName} options`}
          >
            {options.map((item, index) => (
              <button
                type="button"
                role="option"
                id={`${dropdownId}-option-${index}`}
                key={item.id}
                aria-selected={item.id === value}
                data-active={index === active}
                onClick={() => choose(item.id)}
              >
                {item.name}
              </button>
            ))}
            {!options.length && <p>No matching services.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function NumberRentalsDashboard() {
  const { refresh } = useAccount();
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [durations, setDurations] = useState(defaults);
  const [service, setService] = useState("");
  const [duration, setDuration] = useState("sevenDay");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [items, setItems] = useState<Rental[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<{
    kind: "messages" | "extend" | "cancel";
    rental: Rental;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inboxError, setInboxError] = useState("");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [extensionDuration, setExtensionDuration] = useState("sevenDay");
  const [extensionQuote, setExtensionQuote] = useState<Quote | null>(null);
  const [extensionError, setExtensionError] = useState("");
  const load = useCallback(async () => {
    const data = await api<{
      items: Rental[];
      pending: Pending[];
      total: number;
    }>(`/number-rentals?page=${page}&per_page=10`);
    setItems(data.items);
    setPending(data.pending);
    setTotal(data.total);
  }, [page]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      api<{
        items: { id: string; name: string }[];
        durations: Record<string, string>;
      }>("/number-rentals/catalogue", { signal: controller.signal }).then(
        (data) => {
          setServices(data.items);
          setDurations(data.durations);
        },
      ),
      load(),
    ])
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!service) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    setQuote(null);
    setQuoting(true);
    setError("");
    const timer = setTimeout(() => {
      api<Quote>("/number-rentals/quote", {
        method: "POST",
        body: JSON.stringify({ service, duration }),
        signal: controller.signal,
      })
        .then(setQuote)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoting(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [service, duration]);
  useEffect(() => {
    if (modal?.kind !== "extend") return;
    const controller = new AbortController();
    setExtensionQuote(null);
    setExtensionError("");
    const timer = setTimeout(() => {
      api<Quote>("/number-rentals/quote", {
        method: "POST",
        body: JSON.stringify({
          id: modal.rental.id,
          duration: extensionDuration,
        }),
        signal: controller.signal,
      })
        .then(setExtensionQuote)
        .catch((e) => {
          if (!controller.signal.aborted) setExtensionError(e.message);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [modal, extensionDuration]);
  const inbox = useCallback(async (rental: Rental) => {
    setInboxLoading(true);
    setInboxError("");
    try {
      const result = await api<{ items: Message[] }>(
        `/number-rentals/messages?id=${encodeURIComponent(rental.id)}`,
      );
      setMessages(result.items);
    } catch (e) {
      setInboxError((e as Error).message);
    } finally {
      setInboxLoading(false);
    }
  }, []);
  useEffect(() => {
    if (modal?.kind !== "messages") return;
    inbox(modal.rental);
    const timer = setInterval(() => {
      if (!document.hidden) inbox(modal.rental);
    }, 30000);
    return () => clearInterval(timer);
  }, [modal, inbox]);
  useEffect(() => {
    let running = false;
    let stopped = false;
    const update = async () => {
      if (stopped || running || document.hidden || busyRef.current) return;
      running = true;
      try {
        await api("/number-rentals/sync", { method: "POST" });
        await load();
        await refresh();
      } catch {
      } finally {
        running = false;
      }
    };
    update();
    const timer = setInterval(update, 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [load, refresh]);
  async function submit(action: string, input: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        status?: string;
        message?: string;
        resource_id?: string;
      }>(`/number-rentals/${action}`, {
        method: "POST",
        headers: { "Idempotency-Key": purchaseKey(`rental:${action}`, input) },
        body: JSON.stringify(input),
      });
      finishPurchase(`rental:${action}`, input, String(result.status));
      setMessage(
        result.status === "reconciliation" || result.status === "pending"
          ? "We’re waiting for the provider to confirm your purchase or extension. The amount is temporarily held in your wallet. Use Check outcome below before trying again to avoid a duplicate order."
          : result.status === "rejected" || result.status === "cancelled"
            ? "The operation is cancelled. Any eligible wallet refund or released reservation is shown in your wallet."
            : action === "purchase"
              ? "Your rental is ready. Open Messages to receive SMS."
              : action === "extend"
                ? "Your rental has been extended."
                : "Rental status updated.",
      );
      await load();
      await refresh();
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Long-term Rentals"
        description="Keep a USA mobile number for a selected service as long as you want."
      />
      <NumberTabs active="rentals" />
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <div className="number-order-layout rental-dashboard-layout">
        <section className="panel">
          <div className="panel-head">
            <h3>Rent a number</h3>
            <Clock3 size={20} />
          </div>
          <p>Choose a service and how long you need the number.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quote)
                submit("purchase", {
                  service,
                  duration,
                  max_price_usd: quote.price_usd,
                });
            }}
          >
            <RentalServiceDropdown
              items={services}
              value={service}
              disabled={loading || busy}
              onChange={(value) => {
                setQuote(null);
                setService(value);
              }}
            />
            <label className="field">
              <span>Duration</span>
              <select
                aria-label="Rental duration"
                value={duration}
                disabled={busy}
                onChange={(e) => {
                  setQuote(null);
                  setDuration(e.target.value);
                }}
              >
                {Object.entries(durations).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="rental-quote">
              <span>Total</span>
              <strong>
                {quoting ? <Spinner /> : quote ? `$${quote.price_usd}` : "—"}
              </strong>
            </div>
            <button
              className="button"
              disabled={!quote || quoting || busy || loading}
            >
              {busy ? "Processing…" : "Rent number"}
            </button>
            <p className="muted rental-note rental-extension-note">
              <Info size={12} aria-hidden="true" />
              <span>
                Extend manually before expiry to keep the same number.
              </span>
            </p>
          </form>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>Your rentals</h3>
            <button
              className="icon-button"
              aria-label="Refresh rentals"
              disabled={busy}
              onClick={() =>
                api("/number-rentals/sync", { method: "POST" })
                  .then(() => load())
                  .then(() => refresh())
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : !items.length ? (
            <div className="empty-state">
              <Inbox size={32} />
              <p>
                Your rented numbers and their expiry dates will appear here.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="long-term-rental-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Service</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <CopyButton
                          value={row.phone}
                          label={`Copy ${row.phone}`}
                          textOnly
                        />
                      </td>
                      <td>{row.service}</td>
                      <td>{date(row.expires_at)}</td>
                      <td>
                        <span
                          className={
                            row.status === "active"
                              ? "badge number-status-active"
                              : "badge neutral"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <div className="rental-row-actions">
                          {row.status === "active" && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => {
                                setMessages([]);
                                setModal({ kind: "messages", rental: row });
                              }}
                            >
                              Messages
                            </button>
                          )}
                          {row.can_extend && (
                            <button
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => {
                                setExtensionQuote(null);
                                setExtensionError("");
                                setModal({ kind: "extend", rental: row });
                              }}
                            >
                              Extend
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Refresh ${row.phone}`}
                            disabled={busy}
                            onClick={() => submit("status", { id: row.id })}
                          >
                            <RefreshCw size={14} />
                          </button>
                          {row.refundable && (
                            <button
                              className="button danger small"
                              disabled={busy}
                              onClick={() =>
                                setModal({ kind: "cancel", rental: row })
                              }
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 10 && (
            <div className="admin-pagination">
              <button
                className="button secondary small"
                disabled={page === 1 || busy}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="muted">Page {page}</span>
              <button
                className="button secondary small"
                disabled={page * 10 >= total || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
      {!!pending.length && (
        <section className="panel">
          <h3>Pending operations</h3>
          {pending.map((operation) => (
            <div className="rental-pending" key={operation.id}>
              <span>
                {operation.operation === "renewal" ? "Extension" : "Purchase"} ·
                ${operation.price_usd} · {operation.status}
              </span>
              {operation.status !== "rejected" && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => submit("recover", { id: operation.id })}
                >
                  Check outcome
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {modal && (
        <ConfirmDialog
          title={
            modal.kind === "messages"
              ? `Messages · ${modal.rental.phone}`
              : modal.kind === "extend"
                ? `Extend ${modal.rental.phone}`
                : "Cancel rental"
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
          headerActions={
            modal.kind === "messages" ? (
              <>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Refresh messages"
                  title="Refresh messages"
                  disabled={inboxLoading}
                  onClick={() => inbox(modal.rental)}
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close"
                  title="Close"
                  onClick={() => setModal(null)}
                >
                  <X size={19} />
                </button>
              </>
            ) : undefined
          }
        >
          {error && <Alert kind="error">{error}</Alert>}
          {modal.kind === "messages" ? (
            <>
              {inboxError && <Alert kind="error">{inboxError}</Alert>}
              {inboxLoading ? (
                <Spinner />
              ) : !messages.length && !inboxError ? (
                <p className="muted">No messages yet.</p>
              ) : (
                messages.map((item) => (
                  <article className="rental-sms" key={item.id}>
                    <div className="panel-head">
                      <strong>{item.sender || "SMS"}</strong>
                      <small className="muted">
                        {item.created_at ? date(item.created_at) : ""}
                      </small>
                    </div>
                    {item.code && (
                      <div className="rental-message-code">
                        <strong>{item.code}</strong>
                        <CopyButton value={item.code} label="Copy SMS code" />
                      </div>
                    )}
                    <p>{item.text}</p>
                  </article>
                ))
              )}
            </>
          ) : modal.kind === "extend" ? (
            <>
              <label className="field">
                <span>Extend by</span>
                <select
                  aria-label="Extension duration"
                  disabled={busy}
                  value={extensionDuration}
                  onChange={(e) => {
                    setExtensionQuote(null);
                    setExtensionDuration(e.target.value);
                  }}
                >
                  {Object.entries(durations).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {extensionError && <Alert kind="error">{extensionError}</Alert>}
              <div className="rental-quote">
                <span>Extension total</span>
                <strong>
                  {extensionQuote ? (
                    `$${extensionQuote.price_usd}`
                  ) : extensionError ? (
                    "Unavailable"
                  ) : (
                    <Spinner />
                  )}
                </strong>
              </div>
              <p className="muted rental-note">
                The selected period is added to your existing rental. Extensions
                are non-refundable.
              </p>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Back
                </button>
                <button
                  className="button"
                  disabled={busy || !extensionQuote}
                  onClick={() =>
                    extensionQuote &&
                    submit("extend", {
                      id: modal.rental.id,
                      duration: extensionDuration,
                      max_price_usd: extensionQuote.price_usd,
                    })
                  }
                >
                  {busy ? "Processing…" : "Pay and extend"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                Request cancellation of this rental. The wallet refund is
                applied after the provider confirms it. Extensions are not
                refunded.
              </p>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Keep rental
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => submit("cancel", { id: modal.rental.id })}
                >
                  {busy ? "Processing…" : "Cancel rental"}
                </button>
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
