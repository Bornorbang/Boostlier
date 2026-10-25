"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/config";
import { purchaseKey, finishPurchase } from "@/lib/purchase";
import { Title } from "./dashboard";
import { Alert, Spinner } from "./ui";

type Row = Record<string, unknown>;
type Listing = {
  items: Row[];
  total: number;
  per_page: number;
  filter_options?: Record<string, string[]>;
};
type Detail = {
  has_receipt?: boolean;
  display_ids?: Record<string, number>;
  record: Row;
  customer?: Row;
  wallet?: Row;
  ledger?: Row[];
  counts?: Row;
  messages?: Row[];
  refills?: Row[];
  operations?: Row[];
  refund?: Row | null;
};
const titles: Record<string, string> = {
  overview: "Overview",
  users: "Users",
  numbers: "Numbers",
  rentals: "Rentals",
  "boost-orders": "Boost socials",
  "temp-mail": "Temporary emails",
  ads: "Ads",
  "wallet-history": "Wallet activity",
  payments: "Payments",
  operations: "Pending operations",
  support: "Support",
  "audit-log": "Audit log",
  settings: "Pricing & settings",
};
const columns: Record<string, string[]> = {
  rentals: [
    "customer_email",
    "phone",
    "service",
    "rental_duration",
    "status",
    "price_cents",
    "expires_at",
  ],
  users: ["name", "email"],
  numbers: [
    "customer_email",
    "phone",
    "service",
    "status",
    "price_cents",
    "expires_at",
  ],
  "boost-orders": [
    "customer_email",
    "service_name",
    "quantity",
    "status",
    "price_cents",
    "remaining",
  ],
  "temp-mail": [
    "customer_email",
    "address",
    "status",
    "price_cents",
    "expires_at",
  ],
  ads: ["customer_email", "title", "status", "price_cents", "expires_at"],
  payments: [
    "customer_email",
    "provider_reference",
    "amount_cents",
    "status",
    "created_at",
  ],
  "wallet-history": [
    "customer_email",
    "kind",
    "amount_cents",
    "description",
    "created_at",
  ],
  support: [
    "customer_email",
    "issue_type",
    "payment_reference",
    "status",
    "created_at",
  ],
  operations: [
    "customer_email",
    "product",
    "operation",
    "status",
    "price_cents",
    "created_at",
  ],
  "audit-log": ["customer_email", "action", "details", "created_at"],
};
const labels: Record<string, string> = {
  customer_email: "Customer",
  price_cents: "Price",
  amount_cents: "Amount",
  balance_after_cents: "Balance after",
  reserved_after_cents: "Reserved after",
  service_name: "Service",
  created_at: "Created",
  expires_at: "Expires",
  provider_reference: "Payment reference",
  payment_reference: "Payment reference",
  issue_type: "Issue",
  updated_at: "Updated",
  user_id: "Customer ID",
  provider_order_id: "Provider order ID",
  sms_code: "SMS code",
  target_url: "Website",
  price_usd: "Price",
  rental_duration: "Duration",
  rental_refundable: "Cancellation eligible",
};
const label = (key: string) =>
  labels[key] || key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
function value(key: string, input: unknown): string {
  if (input === null || input === undefined || input === "") return "—";
  if (key === "rental_duration")
    return (
      (
        {
          oneDay: "1 day",
          threeDay: "3 days",
          sevenDay: "7 days",
          fourteenDay: "14 days",
          thirtyDay: "30 days",
          ninetyDay: "90 days",
          oneYear: "1 year",
        } as Record<string, string>
      )[String(input)] || String(input)
    );
  if (key === "rental_refundable") return Number(input) ? "Yes" : "No";
  if (key.endsWith("_cents")) return money(Number(input));
  if (key.endsWith("_at") && typeof input === "string") {
    const date = new Date(
      input.includes("T") ? input : input.replace(" ", "T") + "Z",
    );
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
  }
  return typeof input === "object" ? JSON.stringify(input) : String(input);
}
function Fields({
  row,
  displayIds = {},
}: {
  row: Row;
  displayIds?: Record<string, number>;
}) {
  return (
    <dl className="admin-record-fields">
      {Object.entries(row).map(([key, val]) => (
        <div key={key}>
          <dt>{label(key)}</dt>
          <dd>
            {typeof val === "string" && displayIds[val] !== undefined
              ? displayIds[val]
              : value(key, val)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminConsole({ section }: { section: string }) {
  const [data, setData] = useState<Listing | null>(null);
  const [overview, setOverview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [initialAction, setInitialAction] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const sort = "created_at";
  const order = "desc";
  useEffect(() => {
    if (section === "settings") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api<Listing & Row>(
          `/admin/${section}?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&user_id=${encodeURIComponent(customer)}&from=${from}&until=${until}&sort=${sort}&order=${order}&${new URLSearchParams(filters)}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          if (section === "overview") setOverview(result);
          else setData(result);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    section,
    page,
    search,
    status,
    customer,
    revision,
    filters,
    from,
    until,
    sort,
    order,
  ]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSearch(query.get("search") || "");
    setStatus(query.get("status") || "");
  }, []);
  const changed = () => {
    setRevision((v) => v + 1);
  };
  return (
    <>
      <Title
        title={titles[section]}
        description={
          section === "overview"
            ? "Your customers, services and business activity in one place."
            : `Manage ${titles[section].toLowerCase()} across all customer accounts.`
        }
        action={
          <button className="button secondary small" onClick={changed}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {section === "settings" ? (
        <Settings key={revision} onSaved={setMessage} />
      ) : section === "overview" ? (
        <Overview data={overview} />
      ) : (
        <section className="panel">
          <div className="admin-filters">
            <label className="field">
              <span>Search {titles[section].toLowerCase()}</span>
              <div className="search-input">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search records…"
                />
              </div>
            </label>
            {!["audit-log", "wallet-history"].includes(section) && (
              <label className="field">
                <span>Status</span>
                <select
                  value={status}
                  aria-label="Status"
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {[
                    "active",
                    "pending",
                    "reconciliation",
                    "completed",
                    "successful",
                    "partial",
                    "cancelled",
                    "expired",
                    "removed",
                    "deleted",
                    "failed",
                    "disabled",
                    "pending_email",
                    "open",
                    "in_progress",
                    "resolved",
                    "closed",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            {section !== "users" && (
              <label className="field">
                <span>
                  {section === "audit-log" ? "Actor ID" : "Customer ID"}
                </span>
                <input
                  value={customer}
                  onChange={(e) => {
                    setCustomer(e.target.value);
                    setPage(1);
                  }}
                  placeholder="All accounts"
                />
              </label>
            )}
            {Object.entries(data?.filter_options || {})
              .filter(
                ([field]) =>
                  section !== "boost-orders" || field !== "service_name",
              )
              .map(([field, options]) => (
                <label className="field" key={field}>
                  <span>{label(field)}</span>
                  <select
                    aria-label={label(field)}
                    value={filters[field] || ""}
                    onChange={(e) => {
                      setFilters((prev) => ({
                        ...prev,
                        [field]: e.target.value,
                      }));
                      setPage(1);
                    }}
                  >
                    <option value="">All {label(field).toLowerCase()}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            {section === "wallet-history" && (
              <label className="field">
                <span>Direction</span>
                <select
                  aria-label="Direction"
                  value={filters.direction || ""}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      direction: e.target.value,
                    }));
                    setPage(1);
                  }}
                >
                  <option value="">Credits and debits</option>
                  <option value="credit">Credits</option>
                  <option value="debit">Debits</option>
                </select>
              </label>
            )}
            {section !== "users" && (
              <>
                <label className="field">
                  <span>From date</span>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label className="field">
                  <span>Until date</span>
                  <input
                    type="date"
                    value={until}
                    onChange={(e) => {
                      setUntil(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </>
            )}
            <button
              className="button small admin-reset-filters"
              onClick={() => {
                setSearch("");
                setStatus("");
                setCustomer("");
                setFilters({});
                setFrom("");
                setUntil("");
                setPage(1);
              }}
            >
              Reset filters
            </button>
          </div>
          {loading && !data ? (
            <Spinner />
          ) : (
            <div className="admin-table-scroll" aria-busy={loading}>
              <table className="admin-table">
                <thead>
                  <tr>
                    {columns[section].map((key) => (
                      <th key={key}>
                        {section === "users" && key === "name"
                          ? "User"
                          : label(key)}
                      </th>
                    ))}
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data?.items.map((row) => (
                    <tr key={String(row.id)}>
                      {columns[section].map((key) => (
                        <td key={key} title={value(key, row[key])}>
                          {section === "users" && key === "name" ? (
                            <div className="admin-user-name">
                              <strong>{String(row.name)}</strong>
                              <small className="muted">
                                {new Intl.DateTimeFormat("en-GB", {
                                  timeZone: "Europe/London",
                                  dateStyle: "medium",
                                }).format(
                                  new Date(
                                    String(row.created_at).replace(" ", "T") +
                                      (String(row.created_at).includes("T")
                                        ? ""
                                        : "Z"),
                                  ),
                                )}
                              </small>
                            </div>
                          ) : key === "status" ? (
                            <span className="badge">
                              {value(key, row[key])}
                            </span>
                          ) : (
                            value(key, row[key])
                          )}
                        </td>
                      ))}
                      <td>
                        {section === "users" ? (
                          <UserActions
                            row={row}
                            onOpen={(action) => {
                              setInitialAction(action);
                              setSelected(String(row.id));
                            }}
                            onChanged={changed}
                            onError={setError}
                            onMessage={setMessage}
                          />
                        ) : (
                          <button
                            className="button secondary small"
                            onClick={() => {
                              setInitialAction("");
                              setSelected(String(row.id));
                            }}
                          >
                            {["audit-log", "wallet-history"].includes(section)
                              ? "View"
                              : "Manage"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data?.items.length && (
                    <tr>
                      <td
                        colSpan={columns[section].length + 1}
                        className="muted"
                      >
                        No matching records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-pagination">
            <button
              className="button secondary small"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="muted">
              Page {page} · {data?.total ?? 0} records
            </span>
            <button
              className="button secondary small"
              disabled={loading || page * 20 >= (data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {selected && (
        <RecordModal
          section={section}
          initialAction={initialAction}
          id={selected}
          onClose={() => setSelected("")}
          onChanged={changed}
        />
      )}
    </>
  );
}

function UserActions({
  row,
  onOpen,
  onChanged,
  onError,
  onMessage,
}: {
  row: Row;
  onOpen: (action: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: string) => {
    if (busy) return;
    if (
      action === "promote" &&
      !window.confirm(`Make ${row.email} an administrator?`)
    )
      return;
    setBusy(true);
    onError("");
    try {
      if (action === "login") {
        const result = await api<{ redirect: string }>("/admin/impersonate", {
          method: "POST",
          body: JSON.stringify({ id: row.id }),
        });
        window.location.assign(result.redirect);
        return;
      }
      const input =
        action === "promote"
          ? { role: "admin" }
          : { status: row.status === "disabled" ? "active" : "disabled" };
      const result = await api<{ message: string }>("/admin/action", {
        method: "POST",
        body: JSON.stringify({
          section: "users",
          action: "update",
          id: row.id,
          reason:
            action === "promote"
              ? "Administrator role granted from user actions"
              : row.status === "disabled"
                ? "Account unlocked from user actions"
                : "Account locked from user actions",
          ...input,
        }),
      });
      onMessage(result.message);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-user-actions">
      <button
        className="button secondary small"
        disabled={busy || row.role === "admin" || row.status !== "active"}
        onClick={() => run("login")}
      >
        Login
      </button>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => onOpen("adjust-wallet")}
      >
        Wallet
      </button>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => onOpen("update")}
      >
        Edit
      </button>
      <button
        className="button secondary small"
        disabled={busy || row.role === "admin"}
        onClick={() => run("promote")}
      >
        Make Admin
      </button>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => onOpen("view")}
      >
        View
      </button>
    </div>
  );
}

function Overview({ data }: { data: Row | null }) {
  const stats = [
    ["Users", "users", "/admin/users"],
    ["Active numbers", "active_numbers", "/admin/numbers"],
    ["Active rentals", "active_rentals", "/admin/rentals"],
    ["Social boost orders", "boost_orders", "/admin/boost-orders"],
    ["Active temporary emails", "active_inboxes", "/admin/temp-mail"],
    ["Active ads", "active_ads", "/admin/ads"],
    ["Pending operations", "pending_operations", "/admin/operations"],
    ["Open support requests", "open_support", "/admin/support"],
    ["Credited top-ups", "credited_topups_cents", "/admin/payments"],
    ["Net service charges", "verified_revenue_cents", "/admin/wallet-history"],
    [
      "Customer wallet balances",
      "wallet_liability_cents",
      "/admin/wallet-history",
    ],
    ["Reserved wallet funds", "reserved_cents", "/admin/wallet-history"],
  ];
  return (
    <>
      <div className="stat-grid admin-stats">
        {stats.map(([name, key, href]) => (
          <Link className="stat-card" href={href} key={key}>
            <span>
              {name}
              <ArrowUpRight size={14} />
            </span>
            <strong>{data ? value(key, data[key]) : "—"}</strong>
          </Link>
        ))}
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h3>Recent activity</h3>
            <Link href="/admin/audit-log">View all</Link>
          </div>
          {(data?.recent_activity as Row[] | undefined)?.map((row) => (
            <div className="admin-activity" key={String(row.id)}>
              <strong>{label(String(row.action))}</strong>
              <span className="muted">
                {String(row.actor_email || "System")} ·{" "}
                {value("created_at", row.created_at)}
              </span>
            </div>
          ))}
          {!(data?.recent_activity as Row[] | undefined)?.length && (
            <p className="muted">Admin actions will appear here.</p>
          )}
        </section>
        <section className="panel">
          <h3>Operations</h3>
          <p>
            Amounts are in USD. Net service charges are settled purchase and
            renewal debits less refunds. Customer balances and reserved funds
            are shown separately.
          </p>
          {data?.last_job ? (
            <Fields row={data.last_job as Row} />
          ) : (
            <p className="muted">No scheduled job run has been recorded.</p>
          )}
          <Link className="button secondary small" href="/admin/settings">
            Manage pricing
          </Link>
        </section>
      </div>
    </>
  );
}

const actionLabels: Record<string, string> = {
  update: "Update account",
  "adjust-wallet": "Adjust wallet",
  sync: "Refresh provider status",
  cancel: "Attempt cancellation",
  refill: "Request refill",
  "refill-status": "Refresh refill status",
  messages: "Inspect inbox messages",
  extend: "Extend 24 hours (no charge)",
  delete: "Delete inbox",
  remove: "Remove ad",
  edit: "Edit ad",
  verify: "Verify payment with provider",
  reconcile: "Reconcile operation",
};
function RecordModal({
  section,
  id,
  initialAction = "",
  onClose,
  onChanged,
}: {
  section: string;
  id: string;
  initialAction?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<unknown>(null);
  const [action, setAction] = useState(initialAction);
  const load = useCallback(async () => {
    setDetail(
      await api<Detail>(
        `/admin/record?section=${section}&id=${encodeURIComponent(id)}`,
      ),
    );
  }, [section, id]);
  useEffect(() => {
    dialog.current?.showModal();
    load().catch((e) => setError(e.message));
  }, [load]);
  const row = detail?.record;
  const userView = section === "users" && initialAction === "view";
  const active =
    row?.status === "active" &&
    (!row.expires_at ||
      new Date(String(row.expires_at).replace(" ", "T") + "Z") > new Date());
  const actions =
    section === "users"
      ? ["update", "adjust-wallet"]
      : section === "rentals"
        ? [
            "sync",
            ...(active ? ["messages"] : []),
            ...(Number(row?.rental_refundable) && active ? ["cancel"] : []),
          ]
        : section === "numbers"
          ? [
              "sync",
              ...(row?.status === "active" && Number(row.can_cancel)
                ? ["cancel"]
                : []),
            ]
          : section === "boost-orders"
            ? [
                "sync",
                ...(Number(row?.refill_supported) && row?.status !== "cancelled"
                  ? ["refill"]
                  : []),
                ...(detail?.refills?.length ? ["refill-status"] : []),
              ]
            : section === "temp-mail"
              ? [
                  ...(active ? ["messages", "extend"] : []),
                  ...(row?.status !== "deleted" ? ["delete"] : []),
                ]
              : section === "ads"
                ? ["edit", ...(row?.status !== "removed" ? ["remove"] : [])]
                : section === "payments"
                  ? ["verify"]
                  : section === "support"
                    ? ["update"]
                    : section === "operations" &&
                        ["pending", "reconciliation"].includes(
                          String(row?.status),
                        )
                      ? ["reconcile"]
                      : [];
  return (
    <dialog
      ref={dialog}
      className="admin-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="admin-record-title"
    >
      <div className="panel-head">
        <h3 id="admin-record-title">
          {section === "users"
            ? `${initialAction === "adjust-wallet" ? "Wallet" : initialAction === "update" ? "Edit user" : "View user"}${row ? ` · ${row.name}` : ""}`
            : `${titles[section]} · Record details`}
        </h3>
        <button
          className="icon-button"
          aria-label="Close record"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {!detail ? (
        <Spinner />
      ) : (
        <>
          {detail.customer && (
            <div className="admin-customer">
              <strong>{String(detail.customer.name)}</strong>
              <span>{String(detail.customer.email)}</span>
              <Link
                href={`/admin/users?search=${encodeURIComponent(String(detail.customer.email))}`}
              >
                Manage customer
              </Link>
            </div>
          )}
          {(section !== "users" || userView) && (
            <Fields row={detail.record} displayIds={detail.display_ids} />
          )}
          {section === "ads" && (
            <img
              className="admin-banner"
              src={`/api/backend/admin/ad-banner?id=${encodeURIComponent(id)}`}
              alt={String(row?.title)}
            />
          )}
          {detail.wallet && (section !== "users" || userView) && (
            <>
              <h4>Wallet</h4>
              <Fields row={detail.wallet} />
            </>
          )}
          {detail.counts && (section !== "users" || userView) && (
            <>
              <h4>Customer services</h4>
              <Fields row={detail.counts} />
            </>
          )}
          {detail.messages && (
            <>
              <h4>SMS messages</h4>
              {detail.messages.length ? (
                detail.messages.map((m, i) => <Fields key={i} row={m} />)
              ) : (
                <p className="muted">No received SMS.</p>
              )}
            </>
          )}
          {detail.refills && detail.refills.length > 0 && (
            <>
              <h4>Refills</h4>
              {detail.refills.map((r, i) => (
                <Fields key={i} row={r} displayIds={detail.display_ids} />
              ))}
            </>
          )}
          {section === "rentals" && (
            <>
              <h4>Purchase & extension history</h4>
              {detail.operations?.length ? (
                detail.operations.map((operation) => (
                  <section
                    key={String(operation.id)}
                    className="admin-activity"
                  >
                    <Fields row={operation} displayIds={detail.display_ids} />
                    {["pending", "reconciliation"].includes(
                      String(operation.status),
                    ) && (
                      <Link
                        className="button secondary small"
                        href={`/admin/operations?search=${encodeURIComponent(String(operation.id))}`}
                      >
                        Review pending operation
                      </Link>
                    )}
                  </section>
                ))
              ) : (
                <p className="muted">No recorded operations.</p>
              )}
              {detail.refund && (
                <>
                  <h4>Wallet refund</h4>
                  <Fields row={detail.refund} />
                </>
              )}
              <p className="muted">
                Extensions retain the number and charge the customer wallet. Use
                Login on the customer page to extend on their behalf. Expiry
                does not refund a fixed-term rental.
              </p>
            </>
          )}
          {detail.ledger && (section !== "users" || userView) && (
            <details>
              <summary>Recent wallet activity</summary>
              {detail.ledger.map((r, i) => (
                <Fields key={i} row={r} displayIds={detail.display_ids} />
              ))}
            </details>
          )}
          {section === "support" && detail.has_receipt === true && (
            <a
              className="button secondary small"
              href={`/api/backend/admin/support-receipt?id=${encodeURIComponent(id)}`}
            >
              Download receipt
            </a>
          )}
          {actions.length > 0 && !userView && (
            <form
              className="admin-action-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || !action) return;
                if (
                  ["cancel", "delete", "remove"].includes(action) &&
                  !window.confirm(
                    `${actionLabels[action]}? This action is recorded in the audit log.`,
                  )
                )
                  return;
                const fields = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                if (action === "adjust-wallet") {
                  const amount = String(fields.amount_usd || "").trim();
                  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)) {
                    setError(
                      "Enter a valid USD amount, such as 5, 5.5 or 5.50.",
                    );
                    return;
                  }
                  const [whole, fraction = ""] = amount.split(".");
                  fields.amount_usd = `${whole}.${fraction.padEnd(2, "0")}`;
                }
                const input = {
                  ...fields,
                  section,
                  id,
                  action,
                  reason: `${actionLabels[action] || action} via administration`,
                };
                const key = purchaseKey("admin-action", input);
                setBusy(true);
                setError("");
                setMessage("");
                setOutput(null);
                try {
                  const result = await api<{
                    message: string;
                    result?: unknown;
                  }>("/admin/action", {
                    method: "POST",
                    body: JSON.stringify({ ...input, idempotency_key: key }),
                  });
                  finishPurchase("admin-action", input, "completed");
                  setMessage(result.message);
                  setOutput(result.result);
                  await load();
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {section !== "users" && (
                <>
                  <h4>Manage this record</h4>
                  <label className="field">
                    <span>Action</span>
                    <select
                      value={action}
                      aria-label="Action"
                      required
                      disabled={busy}
                      onChange={(e) => setAction(e.target.value)}
                    >
                      <option value="">Choose an action</option>
                      {actions.map((a) => (
                        <option value={a} key={a}>
                          {section === "support" && a === "update"
                            ? "Update support status"
                            : actionLabels[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {action === "update" && section === "users" && (
                <>
                  <div className="two-col">
                    <label className="field">
                      <span>Name</span>
                      <input
                        name="name"
                        defaultValue={String(row?.name)}
                        required
                        maxLength={120}
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        name="email"
                        type="email"
                        defaultValue={String(row?.email)}
                        required
                        maxLength={254}
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>New password (optional)</span>
                    <input
                      type="password"
                      name="password"
                      minLength={12}
                      maxLength={200}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current password"
                    />
                  </label>
                  <div className="two-col">
                    <label className="field">
                      <span>Account status</span>
                      <select
                        aria-label="Account status"
                        name="status"
                        defaultValue={String(row?.status)}
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <select
                        aria-label="Role"
                        name="role"
                        defaultValue={String(row?.role)}
                      >
                        <option value="customer">Customer</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {action === "update" && section === "support" && (
                <label className="field">
                  <span>Support status</span>
                  <select aria-label="Support status" name="status">
                    {["open", "in_progress", "resolved", "closed"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              {action === "adjust-wallet" && (
                <div className="two-col">
                  <label className="field">
                    <span>Amount (USD)</span>
                    <input
                      name="amount_usd"
                      required
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="field">
                    <span>Direction</span>
                    <select aria-label="Direction" name="direction">
                      <option value="credit">Credit</option>
                      <option value="debit">Debit</option>
                    </select>
                  </label>
                </div>
              )}
              {action === "edit" && (
                <>
                  <label className="field">
                    <span>Ad title</span>
                    <input
                      name="title"
                      defaultValue={String(row?.title)}
                      required
                      maxLength={40}
                    />
                  </label>
                  <label className="field">
                    <span>Website</span>
                    <input
                      name="target_url"
                      type="url"
                      defaultValue={String(row?.target_url)}
                      required
                      maxLength={2048}
                    />
                  </label>
                </>
              )}

              {action === "extend" && (
                <p className="muted">
                  Adds 24 hours to the current expiry as a complimentary support
                  adjustment.
                </p>
              )}
              <button
                disabled={busy || !action}
                className={`button ${["cancel", "delete", "remove"].includes(action) ? "danger" : ""}`}
              >
                {busy ? "Working…" : "Apply action"}
              </button>
            </form>
          )}
          {output !== null && output !== undefined && (
            <div className="admin-action-result">
              <h4>Action result</h4>
              {section === "temp-mail" &&
                Array.isArray((output as { items?: Row[] }).items) &&
                (output as { items: Row[] }).items.map((item) => (
                  <section key={String(item.id)} className="admin-activity">
                    <strong>{String(item.subject || "No subject")}</strong>
                    <span>{String(item.sender || "Unknown sender")}</span>
                    <p>{String(item.preview || "")}</p>
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const result = await api<{ result: unknown }>(
                            "/admin/action",
                            {
                              method: "POST",
                              body: JSON.stringify({
                                section,
                                id,
                                action: "message",
                                message_id: item.id,
                                reason: "Administrative inbox message review",
                              }),
                            },
                          );
                          setOutput(result.result);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Read message
                    </button>
                  </section>
                ))}
              {section === "rentals" &&
              Array.isArray((output as { items?: Row[] }).items) ? (
                (output as { items: Row[] }).items.length ? (
                  (output as { items: Row[] }).items.map((item) => (
                    <article className="admin-activity" key={String(item.id)}>
                      <strong>{String(item.sender || "SMS")}</strong>
                      {item.created_at ? (
                        <small>{value("created_at", item.created_at)}</small>
                      ) : null}
                      {item.code ? <strong>{String(item.code)}</strong> : null}
                      <p style={{ whiteSpace: "pre-wrap" }}>
                        {String(item.text || "")}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="muted">No messages yet.</p>
                )
              ) : (
                <pre>{JSON.stringify(output, null, 2)}</pre>
              )}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}

function Settings({ onSaved }: { onSaved: (message: string) => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<Row>("/admin/settings", { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const fields = [
    [
      "Global Numbers",
      "global_fx",
      "USD per 1 USD",
      "global_margin_usd",
      "Flat margin (USD)",
    ],
    [
      "Numbers",
      "number_fx",
      "USD per 1 USD",
      "number_margin_usd",
      "Flat margin (USD)",
    ],
    [
      "Rentals",
      "rental_fx",
      "USD per 1 USD",
      "rental_margin_usd",
      "Flat margin (USD)",
    ],
    ["Boost socials", "smm_fx", "USD per 1 NGN", "smm_markup", "Markup (%)"],
    ["Temporary emails", "temp_mail_price_usd", "Price per 24 hours (USD)"],
    ["Ads", "ads_price_usd", "Price per calendar month (USD)"],
  ];
  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? (
        <Spinner />
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const result = await api<{ message: string }>("/admin/settings", {
                method: "PATCH",
                body: JSON.stringify(
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              });
              onSaved(result.message);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="two-col">
            {fields.map(([title, ...rest]) => (
              <section className="panel" key={title}>
                <h3>{title}</h3>
                {Array.from({ length: rest.length / 2 }, (_, i) => (
                  <label className="field" key={rest[i * 2]}>
                    <span>{rest[i * 2 + 1]}</span>
                    <input
                      required
                      inputMode="decimal"
                      name={rest[i * 2]}
                      defaultValue={String(data[rest[i * 2]])}
                    />
                  </label>
                ))}
              </section>
            ))}
          </div>
          <section className="panel">
            <h3>Save pricing</h3>
            <p>
              Prices apply to new purchases and renewals. Existing charges stay
              unchanged. Provider credentials are managed on the server.
            </p>
            <label className="field">
              <span>Reason for change</span>
              <textarea name="reason" required maxLength={500} />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save pricing"}
            </button>
            <h4>Provider configuration</h4>
            <Fields
              row={Object.fromEntries(
                Object.entries(data.connections as Row).map(([k, v]) => [
                  k,
                  v ? "Configured" : "Not configured",
                ]),
              )}
            />
          </section>
        </form>
      )}
    </>
  );
}
