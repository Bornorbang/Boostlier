"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Gift,
  Users,
  Info,
  RefreshCw,
  Flame,
  Percent,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { Title } from "./dashboard";
import { Alert, CopyButton, Spinner } from "./ui";
import { useAccount } from "./dashboard-shell";
type Reward = {
  id: string;
  progress: number;
  threshold: number;
  amount_usd: string;
  eligible: boolean;
  claimed: boolean;
  claimed_usd: string;
  period: string | null;
};
type Data = {
  commercial_state: string;
  referral_code: string;
  referral_link: string;
  period: string;
  rewards: Reward[];
  referrals: { total: number; qualified: number };
  milestones: {
    count: number;
    amount_usd: string;
    unlocked: boolean;
    claimed: boolean;
  }[];
  topup_launch_date: string | null;
  claims: {
    reward: string;
    period: string;
    amount_usd: string;
    created_at: string;
  }[];
};
const labels: Record<string, string> = {
  monthly_spend: "Monthly spending",
  streak: "Seven-day order streak",
  cashback: "Rental cashback",
  topup_bonus: "Top-up bonus",
  referral: "Referral milestones",
};
const icons = {
  monthly_spend: TrendingUp,
  streak: Flame,
  cashback: Percent,
  topup_bonus: Wallet,
  referral: Users,
};
const date = (v: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(v));
export function Rewards() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const locked = useRef(false);
  const { refresh } = useAccount();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Data>("/rewards"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function claim(id: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      const r = await api<{ message: string }>("/rewards/claim", {
        method: "POST",
        body: JSON.stringify({ reward: id }),
      });
      setMessage(r.message);
      await Promise.all([load(), refresh()]);
      setPage(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  return (
    <>
      <Title
        title="Rewards"
        description="Earn wallet credit through purchases, daily orders and referrals."
        action={
          <button
            className="icon-button"
            aria-label="Refresh rewards"
            disabled={loading || !!busy}
            onClick={load}
          >
            <RefreshCw size={17} />
          </button>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <>
            {data.commercial_state !== "configured" && (
              <Alert>Reward claims are currently paused.</Alert>
            )}
            <div className="rewards-grid rewards-five-grid">
              {[
                "monthly_spend",
                "streak",
                "cashback",
                "topup_bonus",
                "referral",
              ].map((id) => {
                const r = data.rewards.find((r) => r.id === id);
                const Icon = icons[id as keyof typeof icons];
                const description =
                  id === "monthly_spend"
                    ? "Spend \u002425 on qualifying orders this calendar month to unlock \u00241."
                    : id === "streak"
                      ? "Place a qualifying order on seven consecutive days to earn \u00240.50."
                      : id === "cashback"
                        ? "Get 1% cashback on every completed USA and Global number purchased. Claim from \u00240.50"
                        : id === "topup_bonus"
                          ? "Earn 5% on each successful wallet top-up of \u002450 or more. Smaller deposits cannot be combined."
                          : "Invite friends. They qualify after their first qualifying order. Claim all unlocked milestones together.";
                const progress =
                  id === "monthly_spend"
                    ? `\u0024${((r?.progress ?? 0) / 100).toFixed(2)} / \u002425.00`
                    : id === "streak"
                      ? `${r?.progress ?? 0} / 7 days`
                      : id === "cashback"
                        ? `\u0024${r?.amount_usd ?? "0.00"} / \u00240.50`
                        : `${r?.progress ?? 0} qualified referrals`;
                return (
                  <section
                    className="panel reward-card"
                    key={id}
                    aria-label={labels[id]}
                  >
                    <div className="panel-head">
                      <h3>{labels[id]}</h3>
                      <Icon size={21} />
                    </div>
                    <p>{description}</p>
                    <div className="reward-available">
                      <strong>&#36;{r?.amount_usd ?? "0.00"}</strong>
                      <span>
                        {id === "monthly_spend" || id === "streak"
                          ? "Wallet reward"
                          : "Available to claim"}
                      </span>
                    </div>
                    {id !== "topup_bonus" && (
                      <>
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label={`${labels[id]} progress`}
                          aria-valuenow={Math.min(
                            r?.progress ?? 0,
                            r?.threshold ?? 1,
                          )}
                          aria-valuemin={0}
                          aria-valuemax={r?.threshold ?? 1}
                        >
                          <span
                            style={{
                              width: `${Math.min(100, (100 * (r?.progress ?? 0)) / (r?.threshold ?? 1))}%`,
                            }}
                          />
                        </div>
                        <span className="reward-progress-label">
                          {progress}
                        </span>
                      </>
                    )}
                    <button
                      className="button"
                      disabled={!r?.eligible || !!busy || loading}
                      onClick={() => claim(id)}
                    >
                      {busy === id
                        ? "Claiming..."
                        : r?.claimed
                          ? "Claimed"
                          : "Claim reward"}
                    </button>
                    <p className="reward-info">
                      <Info size={13} />
                      <span>
                        {id === "monthly_spend"
                          ? "One claim per calendar month. Progress resets on 1st of every month."
                          : id === "streak"
                            ? "Rewarded days cannot be used again. Missing a day breaks the streak."
                            : id === "cashback"
                              ? "Developer API orders and other product categories do not earn rental cashback."
                              : id === "topup_bonus"
                                ? `No minimum claim. Eligible deposits count from ${data.topup_launch_date ?? "the configured programme launch date"}.`
                                : "Milestones: 5, 10, 25 and 50 qualified referrals."}
                      </span>
                    </p>
                  </section>
                );
              })}
            </div>
            <section className="panel reward-sharing">
              <div className="panel-head">
                <h3>Invite your friends</h3>
                <Gift size={21} />
              </div>
              <p>
                Share your link before they register. Registration and
                wallet deposits alone do not qualify a referral.
              </p>
              <label className="field">
                <span>Your referral link</span>
                <div className="reward-copy">
                  <input
                    aria-label="Your referral link"
                    value={data.referral_link}
                    readOnly
                  />
                  <CopyButton value={data.referral_link} />
                </div>
              </label>
              <p className="muted">
                {data.referrals.total} friends joined &middot;{" "}
                {data.referrals.qualified} qualified
              </p>
              <div className="table-scroll">
                <table
                  className="reward-history"
                  aria-label="Referral milestones"
                >
                  <thead>
                    <tr>
                      <th>Qualified referrals</th>
                      <th>Reward</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.milestones.map((m) => (
                      <tr key={m.count}>
                        <td>{m.count}</td>
                        <td>&#36;{m.amount_usd}</td>
                        <td>
                          {m.claimed
                            ? "Claimed"
                            : m.unlocked
                              ? "Ready to claim"
                              : "Locked"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h3>Claim history</h3>
              <div className="table-scroll">
                <table className="reward-history" aria-label="Reward claims">
                  <thead>
                    <tr>
                      <th>Reward</th>
                      <th>Amount</th>
                      <th>Period / milestone</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.claims
                      .slice((page - 1) * 10, page * 10)
                      .map((c, i) => (
                        <tr key={`${c.created_at}-${i}`}>
                          <td>{labels[c.reward] ?? c.reward}</td>
                          <td>&#36;{c.amount_usd}</td>
                          <td>
                            {c.period.startsWith("incremental:") ||
                            c.period.startsWith("v2:")
                              ? "Accumulated balance"
                              : c.period.startsWith("milestone:")
                                ? "Milestone: " + c.period.slice(10)
                                : c.period
                                    .replace("streak:", "")
                                    .replaceAll(":", " to ")}
                          </td>
                          <td>{date(c.created_at)}</td>
                        </tr>
                      ))}
                    {!data.claims.length && (
                      <tr>
                        <td colSpan={4} className="muted">
                          Your claimed rewards will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {data.claims.length > 10 && (
                <div className="form-actions">
                  <button
                    className="button secondary small"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {page}</span>
                  <button
                    className="button secondary small"
                    disabled={page * 10 >= data.claims.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
export function AdminRewardSettings() {
  const [settings, setSettings] = useState<{
    enabled: boolean;
    topup_launch_date: string;
  } | null>(null);
  const [launch, setLaunch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean; topup_launch_date: string }>(
      "/admin/reward-settings",
    )
      .then((r) => {
        setSettings(r);
        setLaunch(r.topup_launch_date);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ enabled: boolean; topup_launch_date: string }>(
        "/admin/reward-settings",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled, topup_launch_date: launch }),
        },
      );
      setSettings(r);
      setMessage("Rewards settings saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Rewards programme</h3>
      <p>
        Monthly: USD 1 after USD 25 spent. Streak: USD 0.50 after seven days.
        Dashboard rental cashback: 1%, claim from USD 0.50. Top-up bonus: 5% on
        individual verified deposits of USD 50 or more. Referral milestones: 5 /
        10 / 25 / 50, paying USD 0.25 / 0.75 / 2.50 / 6.
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <label className="field">
        <span>Top-up bonus launch date (London)</span>
        <input
          type="date"
          aria-label="Top-up bonus launch date"
          value={launch}
          onChange={(e) => setLaunch(e.target.value)}
          required
        />
      </label>
      <div className="form-actions">
        <button
          className="button small"
          disabled={!settings || busy}
          onClick={() => save(settings!.enabled)}
        >
          Save launch date
        </button>
        <button
          className="button secondary small"
          disabled={!settings || busy}
          onClick={() => save(!settings!.enabled)}
        >
          {!settings
            ? "Loading..."
            : settings.enabled
              ? "Pause rewards"
              : "Enable rewards"}
        </button>
      </div>
    </section>
  );
}
