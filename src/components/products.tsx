"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { purchaseKey, finishPurchase } from "@/lib/purchase";
import { ConfirmDialog } from "./confirm-dialog";
import { date, money } from "@/lib/config";
import { Title, DataTable, Empty } from "./dashboard";
import { Alert, CopyButton, Spinner } from "./ui";
import { useAccount } from "./dashboard-shell";
type Row = Record<string, string | number | null>;
type Service = {
  id: string;
  name: string;
  description: string;
  category?: string;
  minimum?: number;
  maximum?: number;
  periods?: { id: string; label: string; price_usd: string }[];
  price_usd?: string;
  rate_per_thousand_usd?: string;
};
export function ProductDashboard({ product }: { product: string }) {
  const [services, setServices] = useState<Service[]>([]);
  const [service, setService] = useState("");
  const [period, setPeriod] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Row[]>([]);
  const [inbox, setInbox] = useState<Row | null>(null);
  const [message, setMessage] = useState<{
    subject: string;
    text: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const { refresh } = useAccount();
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Row[] }>("/" + product);
      setItems(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [product]);
  useEffect(() => {
    load();
    const controller = new AbortController();
    api<{ items: Service[] }>("/" + product + "/catalogue", {
      signal: controller.signal,
    })
      .then((r) => {
        setServices(r.items);
        setService(r.items[0]?.id || "");
        setPeriod(r.items[0]?.periods?.[0]?.id || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [product, load]);
  const current = services.find((s) => s.id === service);
  const price =
    current?.periods?.find((p) => p.id === period)?.price_usd ||
    current?.price_usd;
  const title =
    product === "temp-mail"
      ? "Temporary Emails"
      : product === "dedicated"
        ? "Dedicated Numbers"
        : "Long-term Numbers";
  async function action(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Record<string, unknown>>(
        "/" + product + "/" + path,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": purchaseKey(product + ":" + path, body),
          },
          body: JSON.stringify(body),
        },
      );
      finishPurchase(product + ":" + path, body, String(result.status));
      await refresh();
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function openMessages(row: Row) {
    setInbox(row);
    setMessage(null);
    try {
      const r = await api<{ items: Row[] }>(
        `/${product}/messages?id=${row.id}`,
      );
      setMessages(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Title
        title={title}
        description={
          product === "temp-mail"
            ? "Your short-term inboxes. Default duration: 24 hours."
            : "More time for your SMS. Manage access, messages and renewals."
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="panel">
        <h3>
          {product === "temp-mail" ? "Create an inbox" : "Choose your access"}
        </h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await action("purchase", { service, period, max_price_usd: price });
          }}
        >
          <div className="two-col">
            <label className="field">
              <span>
                {product === "temp-mail" ? "Inbox option" : "Service"}
              </span>
              <select
                value={service}
                disabled={!services.length}
                onChange={(e) => {
                  setService(e.target.value);
                  setPeriod(
                    services.find((s) => s.id === e.target.value)?.periods?.[0]
                      ?.id || "",
                  );
                }}
              >
                {services.length ? (
                  services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option>No confirmed options available</option>
                )}
              </select>
            </label>
            {product !== "temp-mail" && (
              <label className="field">
                <span>Duration</span>
                <select
                  value={period}
                  disabled={!current?.periods?.length}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  {current?.periods?.length ? (
                    current.periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · ${p.price_usd} USD
                      </option>
                    ))
                  ) : (
                    <option>Provider-supported periods unavailable</option>
                  )}
                </select>
              </label>
            )}
          </div>
          {current?.description && <p>{current.description}</p>}
          <div className="form-actions">
            <button className="button" disabled={!price || busy}>
              {busy ? (
                <Spinner />
              ) : price ? (
                `Purchase · $${price}`
              ) : (
                "Unavailable — no confirmed quote"
              )}
            </button>
            <span className="muted" style={{ fontSize: 10 }}>
              Final availability and USD price confirmed by the server.
            </span>
          </div>
        </form>
      </section>
      <section className="panel">
        <h3>{product === "temp-mail" ? "Your inboxes" : "Your numbers"}</h3>
        {items.length ? (
          items.map((row) => (
            <article
              key={row.id}
              style={{ borderTop: "1px solid var(--line)", padding: "20px 0" }}
            >
              <div className="panel-head">
                <strong>
                  {row.address || row.phone || "Provisioning pending"}
                </strong>
                {(row.address || row.phone) && (
                  <CopyButton value={String(row.address || row.phone)} />
                )}
                <span className="badge neutral">{row.status}</span>
              </div>
              <p>
                {row.service} ·{" "}
                {row.expires_at
                  ? `Expires ${date(String(row.expires_at).replace(" ", "T") + "Z")}`
                  : "Awaiting provider confirmation"}
              </p>
              <div className="form-actions" style={{ flexWrap: "wrap" }}>
                <button
                  className="button secondary small"
                  onClick={() => openMessages(row)}
                >
                  Messages
                </button>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => action("renew", { id: row.id })}
                >
                  Renew
                </button>
                {product === "temp-mail" ? (
                  <button
                    className="button secondary small"
                    onClick={() => setConfirmDelete(row)}
                  >
                    Delete inbox
                  </button>
                ) : (
                  <>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={!!row.auto_renew}
                        onChange={(e) =>
                          action("auto-renew", {
                            id: row.id,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      Auto-renew
                    </label>
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => action("cancel", { id: row.id })}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty
            title={
              product === "temp-mail"
                ? "A fresh inbox starts here"
                : "Your next number will appear here"
            }
            description="Confirmed purchases, expiry information and message access will be listed here."
          />
        )}
      </section>
      {inbox && (
        <section className="panel">
          <div className="panel-head">
            <h3>Messages · {inbox.address || inbox.phone}</h3>
            <button
              className="button secondary small"
              onClick={() => openMessages(inbox)}
            >
              Refresh
            </button>
            <button
              className="icon-button"
              aria-label="Close messages"
              onClick={() => setInbox(null)}
            >
              ×
            </button>
          </div>
          {messages.length ? (
            messages.map((m) => (
              <button
                className="button secondary"
                style={{ display: "flex", marginBottom: 10 }}
                key={m.id}
                onClick={async () => {
                  try {
                    setMessage(
                      await api(
                        `/${product}/message?id=${inbox.id}&message_id=${encodeURIComponent(String(m.id))}`,
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {m.subject || m.body || "Message"} →
              </button>
            ))
          ) : (
            <Empty
              title="No messages yet"
              description="Refresh after a message is sent to your active number or inbox."
            />
          )}
          {message && (
            <article>
              <h3>{message.subject}</h3>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontFamily: "inherit",
                }}
              >
                {message.text}
              </pre>
            </article>
          )}
        </section>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this inbox?"
          onClose={() => setConfirmDelete(null)}
        >
          <p>
            {confirmDelete.address} will no longer be accessible here. This
            action requires provider confirmation.
          </p>
          <div className="form-actions">
            <button
              autoFocus
              className="button secondary"
              onClick={() => setConfirmDelete(null)}
            >
              Keep inbox
            </button>
            <button
              className="button danger"
              onClick={async () => {
                const r = await action("delete", {
                  id: confirmDelete.id,
                  confirmed: true,
                });
                if (r) setConfirmDelete(null);
              }}
            >
              Delete inbox
            </button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
