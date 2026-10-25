"use client";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Flag,
  Globe2,
  Wallet,
  MessageSquare,
  Megaphone,
  ArrowUpRight,
  Clock3,
  Inbox,
  RefreshCw,
  Gift,
  Flame,
  Users,
  Percent,
  TrendingUp,
  Code2,
  LifeBuoy,
  Search,
  Info,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { money, date } from "@/lib/config";
import { Alert, CopyButton, Spinner } from "./ui";
import { useAccount } from "./dashboard-shell";
import { FlagIcon } from "./flag";
import { ApiDocs } from "./docs";
import { NumberTabs } from "./number-tabs";
import { DashboardMarquee } from "./dashboard-notice";
import { WalletFunding } from "./wallet-funding";
import { ContactSupport } from "./contact-support";
type Row = Record<string, string | number | null>;
export function Title({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, load };
}
export function DashboardHome() {
  const { user, balance } = useAccount();
  const { data: usaNumbers } = useData<{ active_completed_total: number }>(
    "/rentals?product=usa&per_page=1",
  );
  const { data: globalNumbers } = useData<{ active_completed_total: number }>(
    "/rentals?product=global&per_page=1",
  );
  const { data: longTermRentals } = useData<{ active_completed_total: number }>(
    "/rentals?product=long-term&per_page=1",
  );
  const { data: boosts } = useData<{ total: number }>("/smm/orders?per_page=1");
  return (
    <>
      <div className="page-title dashboard-greeting">
        <h1>
          <span className="dashboard-hello">Hello,</span>{" "}
          <span className="dashboard-name">
            {user?.name.split(" ")[0] || "there"} {"\u{1F44B}"}
          </span>
        </h1>
        <DashboardMarquee />
      </div>
      <section
        className="panel dashboard-wallet-card"
        aria-label="Wallet balance"
      >
        <div>
          <h2>Wallet Balance</h2>
          <strong className="dashboard-wallet-amount">${balance}</strong>
        </div>
        <div className="dashboard-wallet-actions">
          <Link className="button small" href="/dashboard/wallet">
            Top up
          </Link>
          <Link
            className="button secondary small"
            href="/dashboard/wallet/activity"
          >
            History
          </Link>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            label: "Boost orders",
            value: boosts ? String(boosts.total) : "\u2014",
            note: "Your social promotion orders",
            Icon: Zap,
            href: "/boost-account/orders",
          },
          {
            label: "USA Numbers",
            value: usaNumbers
              ? String(usaNumbers.active_completed_total)
              : "\u2014",
            note: "Active or completed orders",
            Icon: Flag,
            href: "/dashboard/numbers",
          },
          {
            label: "Global Numbers",
            value: globalNumbers
              ? String(globalNumbers.active_completed_total)
              : "\u2014",
            note: "Active or completed orders",
            Icon: Globe2,
            href: "/dashboard/global",
          },
          {
            label: "Long-term Rentals",
            value: longTermRentals
              ? String(longTermRentals.active_completed_total)
              : "\u2014",
            note: "Active or completed rentals",
            Icon: Clock3,
            href: "/dashboard/rentals",
          },
        ].map(({ label, value, note, Icon, href }) => (
          <Link
            className="stat-card dashboard-stat-link"
            key={label}
            href={href}
          >
            <span>
              {label}
              <Icon size={15} />
            </span>
            <strong>{value}</strong>
            <small>{note}</small>
          </Link>
        ))}
      </div>
      <div className="section-heading" style={{ marginBottom: 17 }}>
        <h3>Your workspace tools</h3>
        <span className="badge neutral">Your workspace</span>
      </div>
      <div className="quick-grid dashboard-workspace-tools">
        {[
          [
            Inbox,
            "Temporary Emails",
            "Manage your short-term inboxes and message access.",
            "/dashboard/temp-mail",
          ],
          [
            Megaphone,
            "Ads",
            "Publish and manage banners for the Boostlier community.",
            "/dashboard/ads",
          ],
          [
            Gift,
            "Rewards",
            "See qualifying progress, referral details and available claims.",
            "/dashboard/rewards",
          ],
        ].map(([Icon, label, desc, href]) => {
          const I = Icon as typeof Wallet;
          return (
            <Link
              className="quick-card"
              key={String(label)}
              href={String(href)}
            >
              <I size={23} />
              <h3>{String(label)}</h3>
              <p>{String(desc)}</p>
              <span className="text-link">
                Get started <ArrowUpRight size={12} />
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
type RentalRow = {
  product?: string;
  id: string;
  country?: string;
  country_code?: string | null;
  hidden_from_numbers?: boolean;
  phone: string | null;
  service: string;
  provider: string;
  status: string;
  sms_code: string | null;
  expires_at: string | null;
  price_usd: string;
  provider_state?: string | null;
  can_cancel?: boolean;
  messages?: { body: string; created_at: string }[];
};
export function Rentals({
  product,
  active = false,
}: {
  product?: string;
  active?: boolean;
}) {
  const [page, setPage] = useState(1);
  const { data, error, load } = useData<{
    items: RentalRow[];
    total: number;
    per_page: number;
  }>(
    `/rentals?page=${page}&per_page=10${product ? "&product=" + product : ""}${active ? "&active=1" : ""}`,
  );
  const { refresh } = useAccount();
  const [actionError, setActionError] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [cancelling, setCancelling] = useState<string | null>(null);
  const expiryRefresh = useRef("");
  const rows = (data?.items || []).filter(
    (row) =>
      !active ||
      (["active", "completed"].includes(row.status) &&
        !row.hidden_from_numbers &&
        (!row.expires_at || new Date(row.expires_at).getTime() > tick)),
  );
  useEffect(() => {
    const listener = () => {
      if (page === 1) load();
      else setPage(1);
    };
    window.addEventListener("rentals-refresh", listener);
    return () => window.removeEventListener("rentals-refresh", listener);
  }, [load, page]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!active) return;
    const expired = (data?.items || [])
      .filter(
        (row) => row.expires_at && new Date(row.expires_at).getTime() <= tick,
      )
      .map((row) => row.id)
      .join(",");
    if (expired && expiryRefresh.current !== expired) {
      expiryRefresh.current = expired;
      load().then(refresh);
    }
  }, [tick, active, data, load, refresh]);
  useEffect(() => {
    if (data) {
      const last = Math.max(1, Math.ceil(data.total / 10));
      if (page > last) setPage(last);
    }
  }, [data, page]);
  const polling = rows.some((r) =>
    ["active", "pending", "reconciliation"].includes(r.status),
  );
  useEffect(() => {
    if (!polling) return;
    let running = false;
    const timer = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        await Promise.all(
          rows
            .filter((r) =>
              ["active", "pending", "reconciliation"].includes(r.status),
            )
            .map((r) =>
              api(
                r.product === "long-term"
                  ? "/number-rentals/status"
                  : "/status",
                {
                  method: "POST",
                  body: JSON.stringify(
                    r.product === "long-term"
                      ? { id: r.id }
                      : { rental_id: r.id },
                  ),
                },
              ),
            ),
        );
        await load();
        await refresh();
        setActionError("");
      } catch (error) {
        setActionError(
          "Status updates are unavailable. Your rental has not been assumed to have failed. " +
            (error as Error).message,
        );
      } finally {
        running = false;
      }
    }, 10000);
    return () => {
      clearInterval(timer);
    };
  }, [polling, JSON.stringify(rows), load, refresh]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{active ? "Active & recent numbers" : "Rental history"}</h3>
        <button
          className="icon-button"
          aria-label="Refresh rentals"
          onClick={load}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {(error || actionError) && (
        <Alert kind="error">{error || actionError}</Alert>
      )}
      <div
        className={`table-scroll${active ? " active-numbers-scroll" : ""}`}
        tabIndex={active ? 0 : undefined}
        role={active ? "region" : undefined}
        aria-label={active ? "Active and recent numbers" : undefined}
      >
        <table className={active ? "rental-table" : "rental-history-table"}>
          <thead>
            <tr>
              <th aria-label="Country" />
              <th>Number</th>
              {!active && <th>Type</th>}
              <th>Service</th>
              <th>Code</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Country">
                  <FlagIcon
                    country={row.country || "usa"}
                    code={row.country_code}
                  />
                </td>
                <td data-label="Number">
                  {row.phone ? (
                    <CopyButton
                      value={row.phone}
                      label="Copy number"
                      textOnly
                    />
                  ) : (
                    <span>Pending</span>
                  )}
                </td>
                {!active && (
                  <td>
                    {row.product === "long-term"
                      ? "Long-term"
                      : row.product === "global"
                        ? "Global"
                        : "USA"}
                  </td>
                )}
                <td data-label="Service">{row.service}</td>
                <td data-label="Code">
                  {row.sms_code ? (
                    <>
                      <strong className="number-code">{row.sms_code}</strong>
                      <CopyButton value={row.sms_code} label="Copy SMS code" />
                    </>
                  ) : row.product === "long-term" ? (
                    <span className="muted">—</span>
                  ) : ["active", "pending", "reconciliation"].includes(
                      row.status,
                    ) ? (
                    <span
                      className="number-waiting"
                      role="status"
                      aria-label="Waiting for SMS code"
                    >
                      <Spinner />
                    </span>
                  ) : (
                    <span className="muted">?</span>
                  )}
                  {!!row.messages?.length && (
                    <details className="number-sms">
                      <summary>View SMS</summary>
                      {row.messages.map((message, index) => (
                        <p key={index}>{message.body}</p>
                      ))}
                    </details>
                  )}
                </td>
                <td data-label="Status">
                  <span
                    className={
                      row.status === "active"
                        ? "badge number-status-active"
                        : "badge neutral"
                    }
                  >
                    {{
                      active: "Active",
                      completed: "Completed",
                      pending: "Awaiting number",
                      reconciliation: "Confirming outcome",
                      cancelled: "Cancelled",
                      expired: "Expired",
                    }[row.status] || row.status}
                  </span>
                </td>
                <td data-label="Actions">
                  {row.status === "active" && (
                    <button
                      className="button danger small"
                      disabled={
                        !!cancelling ||
                        (row.provider === "textverified" && !row.can_cancel)
                      }
                      title={
                        row.provider === "textverified" && !row.can_cancel
                          ? "Cancellation is not available for this number yet"
                          : undefined
                      }
                      onClick={async () => {
                        setCancelling(row.id);
                        setActionError("");
                        try {
                          await api(
                            row.product === "long-term"
                              ? "/number-rentals/cancel"
                              : "/cancel",
                            {
                              method: "POST",
                              body: JSON.stringify(
                                row.product === "long-term"
                                  ? { id: row.id }
                                  : { rental_id: row.id },
                              ),
                            },
                          );
                          await load();
                          await refresh();
                        } catch (error) {
                          setActionError((error as Error).message);
                        } finally {
                          setCancelling(null);
                        }
                      }}
                    >
                      {cancelling === row.id ? <Spinner /> : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <Empty
          title={
            active ? "Your next number will appear here" : "No rentals yet"
          }
          description={
            active
              ? "Rent a number above to see its status, expiry and SMS code in one place."
              : "Your number orders and SMS records will be kept here."
          }
        />
      )}
      {!!data?.total && (
        <div className="form-actions">
          <button
            className="button secondary small"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {page} · {data.total} rentals
          </span>
          <button
            className="button secondary small"
            disabled={page * 10 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
export function NumberHistoryPage() {
  return (
    <>
      <Title
        title="Number history"
        description="Your number purchases and long-term rentals in one place."
      />
      <NumberTabs active="history" />
      <Rentals />
    </>
  );
}
export function WalletPage() {
  const { data, error } = useData<{ ledger: Row[]; payments: Row[] }>(
    "/wallet",
  );
  return (
    <>
      <WalletFunding />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="panel">
        <h3>Top-up history</h3>
        {data?.payments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Wallet credit</th>
                  <th>Checkout amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={String(p.id)}>
                    <td>{money(Number(p.amount_cents))} USD</td>
                    <td>
                      {p.checkout_currency
                        ? `${["UGX", "RWF"].includes(String(p.checkout_currency)) ? p.checkout_minor : (Number(p.checkout_minor) / 100).toFixed(2)} ${p.checkout_currency}`
                        : "?"}
                    </td>
                    <td>{p.status}</td>
                    <td>
                      {date(String(p.created_at).replace(" ", "T") + "Z")}
                    </td>
                    <td>
                      {p.status === "pending" && (
                        <Link
                          className="button secondary small"
                          href={`/payment/return?reference=${encodeURIComponent(String(p.id))}`}
                        >
                          Check payment
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No top-ups yet"
            description="Your wallet funding history will appear here."
          />
        )}
      </section>
    </>
  );
}
export function WalletHistoryPage({ topUps = false }: { topUps?: boolean }) {
  const { data, error } = useData<{ ledger: Row[]; payments: Row[] }>(
    "/wallet",
  );
  return (
    <>
      <Title
        title={topUps ? "Top-up history" : "Wallet activity"}
        action={
          <Link className="button secondary small" href="/dashboard/wallet">
            Add funds
          </Link>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      <section className="panel">
        <DataTable
          rows={(topUps ? data?.payments : data?.ledger) || []}
          columns={
            topUps
              ? ["id", "amount_cents", "currency", "status", "created_at"]
              : [
                  "kind",
                  "amount_cents",
                  "description",
                  "reference",
                  "created_at",
                ]
          }
        />
      </section>
    </>
  );
}
export function DataTable({
  rows,
  columns,
}: {
  rows: Row[];
  columns: string[];
}) {
  return (
    <>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c.replaceAll("_", " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={String(r.id || i)}>
                  {columns.map((c) => (
                    <td key={c}>
                      {c.endsWith("_cents")
                        ? money(Number(r[c]))
                        : c.endsWith("_at") && r[c]
                          ? date(String(r[c]).replace(" ", "T") + "Z")
                          : String(r[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Nothing here yet"
          description="Your records will appear here as you use the service."
        />
      )}
    </>
  );
}
export function Profile({ password = false }: { password?: boolean }) {
  const { user, refresh } = useAccount();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Title
        title={password ? "Change password" : "Account settings"}
        description="Your details. Your account. Your control."
      />
      <div className="tabs">
        <Link href="/dashboard/profile" className={!password ? "active" : ""}>
          Profile details
        </Link>
        <Link
          href="/dashboard/profile/change-password"
          className={password ? "active" : ""}
        >
          Change password
        </Link>
      </div>
      <section className="panel" style={{ maxWidth: 640 }}>
        <h3>{password ? "Update your password" : "Your profile"}</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const r = await api<{ message?: string }>(
                password ? "/profile/change-password" : "/profile",
                {
                  method: password ? "POST" : "PATCH",
                  body: JSON.stringify(data),
                },
              );
              setMessage(r.message || "Your profile has been updated.");
              await refresh();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {password ? (
            <>
              <label className="field">
                <span>Current password</span>
                <input
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span>Your name</span>
                <input
                  name="name"
                  defaultValue={user?.name}
                  required
                  maxLength={120}
                />
              </label>
              <label className="field">
                <span>Email address</span>
                <input value={user?.email || ""} type="email" readOnly />
                <small className="muted">
                  Contact support if you need to change your account email.
                </small>
              </label>
            </>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          {message && <Alert kind="success">{message}</Alert>}
          <button className="button" disabled={busy}>
            {busy ? <Spinner /> : "Save changes"}
          </button>
        </form>
      </section>
    </>
  );
}
export function ApiDashboard() {
  const { data, error, load } = useData<{ items: Row[] }>("/api-keys");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  return (
    <>
      <Title
        title="Developer API"
        description="Build your own website with Boostlier services and your shared USD wallet."
      />
      <section className="panel">
        <h3>Your API keys</h3>
        <p>
          New keys are shown once. Generating a replacement immediately revokes
          your previous key. Rental history stays with your account.
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        {message && <Alert kind="error">{message}</Alert>}
        {key && (
          <Alert kind="success">
            <strong>Save this key now:</strong>
            <br />
            <code style={{ overflowWrap: "anywhere" }}>{key}</code>
            <CopyButton value={key} />
          </Alert>
        )}
        <form
          className="toolbar"
          style={{ marginTop: 18 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              const r = await api<{ key: string }>("/api-keys", {
                method: "POST",
                body: JSON.stringify(
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              });
              setMessage("");
              setKey(r.key);
              await load();
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <button className="button small" disabled={busy}>
            {busy
              ? "Generating..."
              : data?.items.some((row) => !row.revoked_at)
                ? "Rotate API key"
                : "Generate API key"}
          </button>
        </form>
        {data?.items.map((row) => (
          <div key={row.id} className="toolbar">
            <code>{row.prefix}********</code>
            <span className="badge neutral">
              {row.revoked_at ? "Revoked" : "Active"}
            </span>
            <span className="muted" style={{ fontSize: 10 }}>
              Last used:{" "}
              {row.last_used_at
                ? date(String(row.last_used_at).replace(" ", "T") + "Z")
                : "Never"}
            </span>
            {!row.revoked_at && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/api-keys", {
                      method: "DELETE",
                      body: JSON.stringify({ id: row.id }),
                    });
                    setKey("");
                    await load();
                  } catch (err) {
                    setMessage((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </section>
      <ApiDocs />
    </>
  );
}
export function Support() {
  return <ContactSupport />;
}
export function Announcements() {
  const { data, error } = useData<{ items: Row[] }>("/announcements");
  return (
    <>
      <Title
        title="The latest from Boostlier"
        description="Service announcements and compact product updates."
      />
      {error && <Alert kind="error">{error}</Alert>}
      {data?.items.length ? (
        data.items.map((row) => (
          <article className="panel" key={row.id}>
            <span className="badge neutral">{row.kind}</span>
            <h3 style={{ marginTop: 13 }}>{row.title}</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{row.body}</p>
          </article>
        ))
      ) : (
        <section className="panel">
          <Empty
            title="You’re all caught up"
            description="Service announcements and updates will appear here."
          />
        </section>
      )}
    </>
  );
}
