"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useAccount } from "./dashboard-shell";
import { Alert, Spinner } from "./ui";

const issues = [
  {
    id: "payment",
    title: "I paid, but my wallet has not been credited",
    answer: null,
    reference: "Payment reference",
    placeholder: "Payment reference from your checkout or receipt",
  },
  {
    id: "sms",
    title: "I have not received an SMS code",
    answer:
      "SMS success may vary by service. If you do not receive a code, cancel the number. The amount charged will be refunded to your wallet, and you can try again with another number.",
    reference: "Number or order reference",
    placeholder: "Your number or order reference",
  },
  {
    id: "boost",
    title: "My Boost Socials order is delayed",
    answer:
      "Some Boost services can take 24 - 72 hours to complete. Your order will be completed in due time. Please allow the service time to process",
    reference: "Order reference or target link",
    placeholder: "Your order reference or public profile/post link",
  },
];
function QueryForm({ issue }: { issue: (typeof issues)[number] }) {
  const { user } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const retry = useRef<{ key: string; payload: string } | undefined>(undefined);
  return (
    <form
      className="support-query-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fields = new FormData(form);
        const payload = JSON.stringify({
          issue_type: issue.id,
          reference: fields.get("reference") || "",
          description: fields.get("description"),
        });
        const payment = issue.id === "payment";
        const file = fields.get("receipt") as File | null;
        if (payment && (!file || !file.size || file.size > 5 * 1024 * 1024)) {
          setError("Upload a PDF, JPEG, PNG or WebP receipt of at most 5 MB.");
          return;
        }
        const signature = payment
          ? `${file!.name}:${file!.size}:${file!.lastModified}`
          : payload;
        if (retry.current?.payload !== signature)
          retry.current = { key: crypto.randomUUID(), payload: signature };
        if (payment) fields.set("issue_type", "payment");
        setBusy(true);
        setError("");
        setSuccess("");
        try {
          const result = await api<{ message: string }>("/support", {
            method: "POST",
            headers: { "Idempotency-Key": retry.current!.key },
            body: payment ? fields : payload,
          });
          setSuccess(result.message);
          form.reset();
          retry.current = undefined;
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {issue.id !== "payment" && <h3>Still need help? Send a query</h3>}
      {issue.id === "payment" ? (
        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            value={user?.email || ""}
            disabled
            readOnly
          />
        </label>
      ) : (
        <label className="field">
          <span>{issue.reference}</span>
          <input
            name="reference"
            placeholder={issue.placeholder}
            maxLength={255}
            disabled={busy}
          />
        </label>
      )}
      {issue.id === "payment" ? (
        <label className="field">
          <span>Payment receipt</span>
          <input
            name="receipt"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            disabled={busy}
          />
          <small className="muted">PDF, JPEG, PNG or WebP ? Maximum 5 MB</small>
        </label>
      ) : (
        <label className="field">
          <span>How can we help?</span>
          <textarea
            name="description"
            placeholder="Tell us what happened and include any relevant details…"
            minLength={10}
            maxLength={2000}
            rows={4}
            required
            disabled={busy}
          />
          <small className="muted">
            Up to 2,000 characters. Do not include passwords, payment card
            details, SMS codes or API keys.
          </small>
        </label>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}
      <button className="button small" disabled={busy}>
        {busy ? <Spinner /> : <Send size={14} />}Send query
      </button>
    </form>
  );
}
export function ContactSupport() {
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Contact support</h1>
          <p>
            Find answers to common issues, or send a query to our support team.
          </p>
        </div>
      </div>
      <section className="panel support-faq" aria-label="Support questions">
        {issues.map((issue) => (
          <details key={issue.id} name="support-issues">
            <summary>
              {issue.title}
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <div className="support-answer">
              {issue.answer && <p>{issue.answer}</p>}
              {issue.id === "payment" && <QueryForm issue={issue} />}
            </div>
          </details>
        ))}
        <details name="support-issues">
          <summary>
            Can I withdraw wallet funds to my bank account?
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <div className="support-answer">
            <p>
              Boostlier wallets are prepaid service balances. Wallet funding is
              normally final and there is no cash-withdrawal feature. Eligible
              service refunds go back to your wallet. See our{" "}
              <Link href="/legal/terms">Terms</Link> for the full policy and
              applicable statutory rights.
            </p>
          </div>
        </details>

        <details name="support-issues">
          <summary>
            Why is a number rejected by the service I selected?
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <div className="support-answer">
            <p>
              Each platform decides which numbers it accepts. Acceptance is not
              guaranteed. Confirm you selected the right service and country,
              then use the available cancellation action if no SMS has arrived.
            </p>
          </div>
        </details>
      </section>
      <p className="support-email-note">
        Still have a query? Please email{" "}
        <a href="mailto:support@boostlier.com">support@boostlier.com</a>.
      </p>
    </>
  );
}
