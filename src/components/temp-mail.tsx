"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Info, Mail, RefreshCw, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { date } from "@/lib/config";
import { finishPurchase, purchaseKey } from "@/lib/purchase";
import { useAccount } from "./dashboard-shell";
import { Title, Empty } from "./dashboard";
import { Alert, CopyButton, Spinner } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";

type Inbox = {
  id: string;
  address: string;
  status: string;
  price_paid_usd: string;
  created_at: string;
  expires_at: string;
};
type Message = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  text?: string;
};
type Status = {
  items: Inbox[];
  price_usd: string | null;
  configured: boolean;
  duration_hours: number;
};
type Outcome = {
  status: string;
  message?: string;
  inbox_id?: string;
  error_code?: string;
};
async function request<T>(
  action: string,
  options: RequestInit = {},
  params: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(
    "/api/temp-mail?" + new URLSearchParams({ action, ...params }),
    {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      cache: "no-store",
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error?.message || "Temporary email could not complete this request.",
      response.status,
      body.error?.code || "REQUEST_FAILED",
    );
  return body;
}

export function TemporaryEmails() {
  const { refresh } = useAccount();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<Inbox | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [mailError, setMailError] = useState("");
  const [mailLoading, setMailLoading] = useState(false);
  const mailRequest = useRef<AbortController | null>(null);
  const [clock, setClock] = useState(Date.now());
  const active = (row: Inbox) =>
    row.status === "active" && new Date(row.expires_at).getTime() > clock;
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await request<Status>("status", { signal });
    if (!signal?.aborted) {
      setStatus(result);
      setError("");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      controller.abort();
      mailRequest.current?.abort();
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (inbox && new Date(inbox.expires_at).getTime() <= clock) {
      mailRequest.current?.abort();
      setMessages([]);
      setMessage(null);
      setMailLoading(false);
      setMailError("This inbox has expired. Message access has ended.");
    }
  }, [inbox, clock]);

  async function mutate(action: "create" | "renew" | "delete", row?: Inbox) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    const input =
      action === "delete"
        ? { confirmed: true }
        : {
            max_price_usd: status?.price_usd,
            ...(row ? { expires_at: row.expires_at } : {}),
          };
    const scope = "temp-mail:" + action + (row ? ":" + row.id : "");
    try {
      const outcome = await request<Outcome>(
        action,
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: { "Idempotency-Key": purchaseKey(scope, input) },
        },
        row ? { id: row.id } : {},
      );
      if (["completed", "rejected", "deleted"].includes(outcome.status))
        finishPurchase(scope, input, "completed");
      setToast({
        text:
          outcome.status === "rejected"
            ? outcome.message || "Generation failed. Funds were returned."
            : action === "create"
              ? "Your temporary email is ready."
              : action === "renew"
                ? "Inbox renewed for another 24 hours."
                : "Inbox deleted. Access revoked.",
        error: outcome.status === "rejected",
      });
      if (action === "delete" && inbox?.id === row?.id) closeInbox();
      await Promise.all([refresh(), load()]);
      return outcome.status !== "rejected";
    } catch (error) {
      setToast({ text: (error as Error).message, error: true });
      // Keep the operation key on transport failures so Retry retrieves the same result.
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function closeInbox() {
    mailRequest.current?.abort();
    setInbox(null);
    setMessage(null);
    setMessages([]);
    setMailError("");
  }
  async function openInbox(row: Inbox) {
    mailRequest.current?.abort();
    const controller = new AbortController();
    mailRequest.current = controller;
    setInbox(row);
    setMessage(null);
    setMessages([]);
    setMailError("");
    setMailLoading(true);
    try {
      const result = await request<{ items: Message[] }>(
        "messages",
        { signal: controller.signal },
        { inbox_id: row.id },
      );
      if (!controller.signal.aborted) setMessages(result.items);
    } catch (error) {
      if (!controller.signal.aborted) setMailError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setMailLoading(false);
    }
  }
  async function openMessage(item: Message) {
    if (!inbox) return;
    mailRequest.current?.abort();
    const controller = new AbortController();
    mailRequest.current = controller;
    setMailError("");
    setMessage(null);
    setMailLoading(true);
    try {
      const result = await request<Message>(
        "message",
        { signal: controller.signal },
        { inbox_id: inbox.id, message_id: item.id },
      );
      if (!controller.signal.aborted) setMessage(result);
    } catch (error) {
      if (!controller.signal.aborted) setMailError((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setMailLoading(false);
    }
  }

  return (
    <>
      <Title
        title="Temporary Emails"
        description="A fresh address, whenever you need one. Manage your inboxes in one place."
      />
      {toast && (
        <div className="boost-toast" role={toast.error ? "alert" : "status"}>
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <Alert kind="error">
          {error}
          <button
            className="button secondary small"
            onClick={() => load().catch((error) => setError(error.message))}
          >
            Retry
          </button>
        </Alert>
      )}
      <div className="temp-mail-overview">
        <section className="panel">
          <div className="panel-head">
            <h3>Generate temporary email</h3>
            <Mail size={20} />
          </div>
          <p>
            Click button below to generate an email address. Each email is
            active for 24 hours and costs ${status?.price_usd || "1.00"}
          </p>
          <div className="form-actions">
            <button
              className="button"
              disabled={!status?.configured || busy}
              onClick={() => mutate("create")}
            >
              {busy ? <Spinner /> : "Generate email"}
            </button>
          </div>
          <p className="fine-print temp-mail-renewal-note">
            <Info size={12} aria-hidden="true" />
            <span>
              Renew before expiry to keep it on your dashboard for another 24
              hours.
            </span>
          </p>
          {status && !status.configured && (
            <p className="fine-print">
              Temporary email purchases are not available until the connection
              and price are configured.
            </p>
          )}
        </section>
        <section className="panel temp-mail-addresses">
          <div className="panel-head">
            <h3>Active email addresses</h3>
          </div>
          {!status && !error ? (
            <Spinner />
          ) : status?.items.some(active) ? (
            <div
              className="table-scroll"
              tabIndex={0}
              aria-label="Scrollable active email addresses"
            >
              <table
                className="temp-mail-table"
                aria-label="Active email addresses"
              >
                <thead>
                  <tr>
                    <th>Email address</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {status.items.filter(active).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong className="temp-mail-address">
                          {row.address}
                        </strong>
                      </td>
                      <td data-label="Expires">{date(row.expires_at)}</td>
                      <td data-label="Status">
                        <span className="badge neutral">
                          {active(row) ? "Active" : "Expired"}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div className="boost-row-actions">
                          <CopyButton value={row.address} label="Copy" />
                          <button
                            className="button secondary small"
                            disabled={!active(row)}
                            onClick={() => openInbox(row)}
                          >
                            Messages
                          </button>
                          <button
                            className="button secondary small"
                            disabled={busy || !active(row) || !status.price_usd}
                            onClick={() => mutate("renew", row)}
                          >
                            Renew
                          </button>
                          <button
                            className="button secondary small"
                            disabled={busy}
                            onClick={() => setDeleting(row)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !error && (
              <div className="temp-mail-empty">
                <Inbox size={30} aria-hidden="true" />
                <p className="muted">
                  Generate an address to receive temporary emails. Your
                  addresses and expiry times will appear here.
                </p>
              </div>
            )
          )}
        </section>
      </div>
      {inbox && (
        <ConfirmDialog
          title={message ? message.subject : "Inbox messages"}
          onClose={closeInbox}
          headerActions={
            <>
              <button
                className="icon-button"
                aria-label="Refresh inbox"
                title="Refresh inbox"
                disabled={mailLoading || !active(inbox)}
                onClick={() => openInbox(inbox)}
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Close inbox"
                onClick={closeInbox}
              >
                <X size={18} />
              </button>
            </>
          }
        >
          {message && (
            <div className="form-actions">
              {message && (
                <button
                  className="button secondary small"
                  onClick={() => setMessage(null)}
                >
                  Back to inbox
                </button>
              )}
            </div>
          )}
          {mailError ? (
            <Alert kind="error">{mailError}</Alert>
          ) : mailLoading ? (
            <Spinner />
          ) : message ? (
            <article className="temp-mail-content">
              <p className="muted">From: {message.sender}</p>
              <pre>
                {message.text || "This message has no plain-text content."}
              </pre>
            </article>
          ) : messages.length ? (
            <div className="temp-mail-messages">
              {messages.map((item) => (
                <button
                  className="temp-mail-message"
                  key={item.id}
                  onClick={() => openMessage(item)}
                >
                  <span className="muted">{item.sender}</span>
                  <strong>{item.subject}</strong>
                  <span>{item.preview}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No messages yet"
              description="Refresh after sending an email to this address."
            />
          )}
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this inbox?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p className="temp-mail-address">{deleting.address}</p>
          <p>
            This removes the inbox from your dashboard and ends your access.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep inbox
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await mutate("delete", deleting)) setDeleting(null);
              }}
            >
              {busy ? <Spinner /> : "Delete inbox"}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
