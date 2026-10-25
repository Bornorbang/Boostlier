"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/config";
import { Title, DataTable } from "./dashboard";
import { Alert, Spinner } from "./ui";
import { AdminInspection } from "./admin-inspection";
import { AdminRewardSettings } from "./rewards";
import { AdminConsole } from "./admin-console";
import { AdminDashboardNotice } from "./dashboard-notice";
type Row = Record<string, string | number | null>;
export function AdminPage({ section }: { section: string }) {
  if (
    [
      "overview",
      "users",
      "numbers",
      "rentals",
      "boost-orders",
      "temp-mail",
      "ads",
      "wallet-history",
      "payments",
      "support",
      "operations",
      "audit-log",
      "settings",
    ].includes(section)
  )
    return <AdminConsole key={section} section={section} />;
  return <LegacyAdminPage section={section} />;
}
function LegacyAdminPage({ section }: { section: string }) {
  const [data, setData] = useState<{
    items?: Row[];
    total?: number;
    [key: string]: unknown;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [claimedOnly, setClaimedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<typeof data>(
      `/admin/${section}?page=${page}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusFilter)}&user_id=${encodeURIComponent(customerFilter)}&claimed_rewards=${claimedOnly ? "1" : "0"}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [
    section,
    page,
    search,
    revision,
    statusFilter,
    customerFilter,
    claimedOnly,
  ]);
  const columns: Record<string, string[]> = {
    users: [
      "id",
      "name",
      "email",
      "role",
      "status",
      "referral_code",
      "created_at",
    ],
    "wallet-history": [
      "user_id",
      "kind",
      "amount_cents",
      "reference",
      "created_at",
    ],
    "rental-history": [
      "id",
      "user_id",
      "provider",
      "provider_order_id",
      "service",
      "status",
      "price_cents",
      "created_at",
    ],
    "long-term": [
      "id",
      "user_id",
      "provider_order_id",
      "service",
      "status",
      "price_cents",
      "expires_at",
    ],
    dedicated: [
      "id",
      "user_id",
      "phone",
      "status",
      "price_cents",
      "expires_at",
    ],
    "temp-mail": ["id", "user_id", "address", "status", "expires_at"],
    "boost-orders": [
      "id",
      "user_id",
      "provider_order_id",
      "quantity",
      "status",
      "price_cents",
    ],
    rewards: ["user_id", "reward", "period", "amount_cents", "created_at"],
    announcements: ["id", "title", "body", "created_at"],
    updates: ["id", "title", "body", "created_at"],
  };
  const notice = section === "announcements" || section === "updates";
  return (
    <>
      <Title
        title={
          section === "overview"
            ? "Operations overview"
            : section.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase())
        }
        description="Authorised operations. Auditable actions. Verified outcomes."
        action={
          <button
            className="button secondary small"
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh
          </button>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {section === "announcements" && <AdminDashboardNotice />}
      {section === "rewards" && <AdminRewardSettings />}
      {section === "overview" ? (
        <>
          <div className="stat-grid">
            {[
              ["Total users", data?.users],
              ["Total rentals", data?.rentals],
              [
                "Credited top-ups",
                data?.credited_topups_cents === undefined
                  ? "—"
                  : money(Number(data.credited_topups_cents)),
              ],
              [
                "Settled service revenue",
                data?.verified_revenue_cents === undefined
                  ? "—"
                  : money(Number(data.verified_revenue_cents)),
              ],
            ].map(([label, value]) => (
              <div className="stat-card" key={String(label)}>
                <span>{String(label)}</span>
                <strong>{String(value ?? "—")}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <h3>What these metrics mean</h3>
            <p>
              Users and rentals count stored records. Credited top-ups include
              verified successful payments only. Settled service revenue is
              purchase and renewal ledger debits less wallet refunds; pending
              reservations, failed payments and wallet funding are excluded.
              This is not an audited profit metric.
            </p>
          </section>
        </>
      ) : (
        <>
          {["users", "rewards", "temp-mail"].includes(section) && (
            <AdminInspection section={section} />
          )}
          <section className="panel">
            {section !== "overview" && (
              <label className="field">
                <span>
                  {section === "users"
                    ? "Search name or email"
                    : "Search records"}
                </span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search customers…"
                />
              </label>
            )}
            <div className="toolbar">
              {[
                "users",
                "rental-history",
                "long-term",
                "dedicated",
                "temp-mail",
                "boost-orders",
              ].includes(section) && (
                <label className="field">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All statuses</option>
                    {[
                      "active",
                      "pending",
                      "reconciliation",
                      "completed",
                      "cancelled",
                      "expired",
                      "disabled",
                      "partial",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              {!["users", "announcements", "updates"].includes(section) && (
                <label className="field">
                  <span>Customer ID</span>
                  <input
                    value={customerFilter}
                    onChange={(e) => {
                      setCustomerFilter(e.target.value);
                      setPage(1);
                    }}
                    placeholder="All customers"
                  />
                </label>
              )}
              {section === "users" && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={claimedOnly}
                    onChange={(e) => {
                      setClaimedOnly(e.target.checked);
                      setPage(1);
                    }}
                  />
                  Has claimed rewards
                </label>
              )}
            </div>
            <DataTable
              rows={data?.items || []}
              columns={columns[section] || ["id", "status", "created_at"]}
            />
            <div className="form-actions">
              <button
                className="button secondary small"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} · {data?.total ?? 0} records
              </span>
              <button
                className="button secondary small"
                disabled={page * 20 >= Number(data?.total || 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
          {section === "users" && (
            <div className="two-col">
              <section className="panel">
                <h3>Auditable wallet adjustment</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const b = Object.fromEntries(new FormData(e.currentTarget));
                    try {
                      await api("/admin/wallet-adjustment", {
                        method: "POST",
                        body: JSON.stringify({
                          ...b,
                          idempotency_key: crypto.randomUUID(),
                        }),
                      });
                      setMessage("Wallet adjustment recorded.");
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  <label className="field">
                    <span>Customer ID</span>
                    <input name="user_id" required />
                  </label>
                  <label className="field">
                    <span>Amount (USD)</span>
                    <input
                      name="amount_usd"
                      pattern="[0-9]+\.[0-9]{2}"
                      required
                      placeholder="0.00"
                    />
                  </label>
                  <label className="field">
                    <span>Direction</span>
                    <select name="direction">
                      <option value="credit">Credit</option>
                      <option value="debit">Debit</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Reason</span>
                    <textarea name="reason" maxLength={500} required />
                  </label>
                  <button className="button">Record adjustment</button>
                </form>
              </section>
              <section className="panel">
                <h3>Account status</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api("/admin/users", {
                        method: "PATCH",
                        body: JSON.stringify(
                          Object.fromEntries(new FormData(e.currentTarget)),
                        ),
                      });
                      setMessage("Account status updated.");
                      setRevision((v) => v + 1);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  <label className="field">
                    <span>Customer ID</span>
                    <input name="id" required />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select name="status">
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </label>
                  <button className="button">Update status</button>
                </form>
              </section>
            </div>
          )}
          {notice && (
            <section className="panel">
              <h3>
                Create or edit{" "}
                {section === "updates" ? "update" : "announcement"}
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const b = Object.fromEntries(new FormData(e.currentTarget));
                  if (!b.id) delete b.id;
                  try {
                    await api("/admin/" + section, {
                      method: "POST",
                      body: JSON.stringify(b),
                    });
                    setMessage("Saved.");
                    setRevision((v) => v + 1);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <label className="field">
                  <span>ID (leave blank to create)</span>
                  <input name="id" maxLength={32} />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input name="title" required maxLength={160} />
                </label>
                <label className="field">
                  <span>Message</span>
                  <textarea name="body" required maxLength={10000} />
                </label>
                <button className="button">Save</button>
              </form>
              <form
                className="toolbar"
                style={{ marginTop: 25 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api("/admin/" + section, {
                      method: "DELETE",
                      body: JSON.stringify(
                        Object.fromEntries(new FormData(e.currentTarget)),
                      ),
                    });
                    setMessage("Deleted.");
                    setRevision((v) => v + 1);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <input
                  name="id"
                  aria-label="Announcement ID to delete"
                  placeholder="ID to delete"
                  required
                />
                <button className="button danger">Delete</button>
              </form>
            </section>
          )}
        </>
      )}
    </>
  );
}
