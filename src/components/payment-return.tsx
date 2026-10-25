"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
type State = "verifying" | "pending" | "successful" | "failed" | "error";
export function PaymentReturn() {
  const router = useRouter();
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("We are confirming your payment.");
  useEffect(() => {
    const reference = new URLSearchParams(location.search).get("reference");
    if (!reference) {
      setState("error");
      setMessage(
        "No payment reference was supplied. Check your wallet history.",
      );
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function verify() {
      try {
        const result = await api<{ status: string }>("/payments/verify", {
          method: "POST",
          body: JSON.stringify({ reference }),
        });
        if (cancelled) return;
        if (result.status === "successful") {
          try {
            localStorage.setItem(
              "boostlier-wallet-updated",
              String(Date.now()),
            );
          } catch {}
          window.dispatchEvent(new Event("boostlier-wallet-updated"));
          setState("successful");
          return;
        }
        if (result.status === "failed") {
          setState("failed");
          setMessage(
            "This payment was not completed. You can try again from your wallet.",
          );
          return;
        }
        setState("pending");
        setMessage(
          "Your payment is still processing. Your wallet will update once it is confirmed.",
        );
        if (++attempts < 12) timer = setTimeout(verify, 5000);
      } catch (e) {
        if (!cancelled) {
          setState("error");
          setMessage((e as Error).message);
        }
      }
    }
    void verify();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (state !== "successful") return;
    const timer = setTimeout(() => router.replace("/dashboard"), 4000);
    return () => clearTimeout(timer);
  }, [state, router]);
  const success = state === "successful";
  const loading = state === "verifying" || state === "pending";
  return (
    <main id="main-content" className="payment-return-page">
      <section
        className={`payment-return-card${success ? " is-success" : ""}`}
        aria-live="polite"
      >
        <div
          className={`payment-return-symbol ${success ? "success" : loading ? "loading" : "warning"}`}
          aria-hidden="true"
        >
          {success ? (
            <>
              <Check size={42} strokeWidth={2.5} />
              <i />
              <i />
              <i />
              <i />
            </>
          ) : loading ? (
            <LoaderCircle size={37} className="payment-return-spinner" />
          ) : (
            <CircleAlert size={37} />
          )}
        </div>
        <h1>
          {success
            ? "Wallet funded!"
            : loading
              ? "Confirming your payment"
              : "Payment not completed"}
        </h1>
        <p>
          {success
            ? "Your funds are ready. Taking you to your dashboard."
            : message}
        </p>
        {success ? (
          <div className="payment-return-redirect">
            <LoaderCircle
              size={17}
              className="payment-return-spinner"
              aria-hidden="true"
            />
            <span>Opening your dashboard...</span>
          </div>
        ) : state !== "verifying" ? (
          <Link className="button" href="/dashboard/wallet">
            Go to wallet
          </Link>
        ) : null}
        {success && (
          <div className="payment-return-progress" aria-hidden="true">
            <span />
          </div>
        )}
      </section>
    </main>
  );
}
