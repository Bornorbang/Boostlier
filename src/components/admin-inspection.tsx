"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { DataTable } from "./dashboard";
import { Alert } from "./ui";
type Row = Record<string, string | number | null>;
export function AdminInspection({ section }: { section: string }) {
  const [result, setResult] = useState<{
    items?: Row[];
    rewards?: Row[];
    balance_usd?: string;
    reserved_usd?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [id, setId] = useState("");
  const resource = section === "temp-mail";
  const rewards = section === "rewards";
  return (
    <section className="panel">
      <h3>
        {resource
          ? "Inspect inbox"
          : rewards
            ? "Customer reward progress"
            : "Inspect customer wallet"}
      </h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            setResult(
              await api(
                `/admin/${resource ? "temp-mail-inspect" : rewards ? "user-rewards" : "user-wallet"}?id=${encodeURIComponent(id)}`,
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label className="field">
          <span>{resource ? "Inbox ID" : "Customer ID"}</span>
          <input
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
            maxLength={32}
          />
        </label>
        <button className="button secondary small">Inspect records</button>
      </form>
      {error && <Alert kind="error">{error}</Alert>}
      {result?.balance_usd && (
        <Alert>
          Available ${result.balance_usd} USD · Reserved ${result.reserved_usd}{" "}
          USD
        </Alert>
      )}
      {result && (
        <DataTable
          rows={result.items || result.rewards || []}
          columns={
            resource
              ? ["id", "subject", "body"]
              : rewards
                ? [
                    "id",
                    "amount_usd",
                    "progress",
                    "threshold",
                    "period",
                    "claimed_usd",
                    "eligible",
                  ]
                : [
                    "kind",
                    "amount_cents",
                    "description",
                    "reference",
                    "created_at",
                  ]
          }
        />
      )}
      {resource && (
        <form
          style={{ marginTop: 20 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await api("/admin/temp-mail-delete", {
                method: "POST",
                body: JSON.stringify({ id, confirmed: true }),
              });
              setResult(null);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label className="check-label">
            <input type="checkbox" required />I confirm permanent deletion of
            the inbox ID above.
          </label>
          <button
            className="button danger small"
            style={{ marginTop: 12 }}
            disabled={!id}
          >
            Delete inbox
          </button>
        </form>
      )}
    </section>
  );
}
