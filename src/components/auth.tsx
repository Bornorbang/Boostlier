"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, Spinner, ThemeToggle } from "./ui";
import { BrandIcon } from "./brand-icon";
export function AuthForm({ action }: { action: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [google, setGoogle] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const tokenLoaded = useRef(false);
  const router = useRouter();
  const signup = action === "signup",
    signin = action === "signin",
    forgot = action === "forgot-password";
  const title = signup
    ? "Sign Up"
    : signin
      ? "Welcome back."
      : forgot
        ? "Forgot your password?"
        : "Choose a new password.";
  useEffect(() => {
    if (action === "reset-password" && !tokenLoaded.current) {
      tokenLoaded.current = true;
      const token = new URLSearchParams(location.search).get("token") || "";
      setResetToken(token);
      if (!/^[a-f0-9]{64}$/.test(token))
        setError(
          "This reset link is invalid. Request a new password reset email.",
        );
      // Keep reset credentials out of copied URLs and subsequent referrers.
      history.replaceState(null, "", location.pathname);
    }
    api<{ google_enabled: boolean }>("/public/config")
      .then((c) => setGoogle(c.google_enabled))
      .catch(() => {});
    if (signin || signup)
      api("/auth/me")
        .then(() => {
          const next = new URLSearchParams(location.search).get("next");
          router.replace(
            next?.startsWith("/") && !next.startsWith("//")
              ? next
              : "/dashboard",
          );
        })
        .catch(() => {});
  }, [signin, signup, router, action]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    if (action === "reset-password") {
      form.token = resetToken;
      if (form.password !== form.confirm_password) {
        setError("Your passwords do not match.");
        setBusy(false);
        return;
      }
      delete form.confirm_password;
    }
    try {
      const result = await api<{ message?: string }>(`/auth/${action}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (signin || signup) {
        const next = new URLSearchParams(location.search).get("next");
        router.push(
          next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard",
        );
        router.refresh();
      } else
        setMessage(
          result.message ||
            "Your password has been updated. You can now sign in.",
        );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main-content" className="auth-page">
      {signin || signup ? (
        <nav className="auth-header" aria-label="Account navigation">
          <Link className="brand" href="/" aria-label="Boostlier home">
            <BrandIcon />
            Boostlier.
          </Link>
          <ThemeToggle />
        </nav>
      ) : (
        <div className="auth-theme">
          <ThemeToggle />
        </div>
      )}
      <section className="auth-form-wrap">
        <div className={`auth-form${signin || signup ? " auth-card" : ""}`}>
          <h1>{title}</h1>
          <p>
            {signup
              ? "Create your Boostlier account."
              : signin
                ? "Sign in to your Boostlier account"
                : "We’ll help you get back into your account."}
          </p>
          {error && <Alert kind="error">{error}</Alert>}
          {message && <Alert kind="success">{message}</Alert>}
          {!(action === "reset-password" && message) && (
            <form onSubmit={submit}>
              {signup && (
                <label className="field">
                  <span>Your name</span>
                  <input
                    name="name"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                    maxLength={120}
                  />
                </label>
              )}
              {(signin || signup || forgot) && (
                <label className="field">
                  <span>Email address</span>
                  <input
                    name="email"
                    placeholder="Enter your email address"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
              )}
              {!forgot && (
                <label className="field">
                  <span>Password</span>
                  <input
                    name="password"
                    placeholder={
                      signin ? "Enter your password" : "Create a password"
                    }
                    type="password"
                    autoComplete={signin ? "current-password" : "new-password"}
                    minLength={12}
                    maxLength={200}
                    required
                  />
                  {!signin && (
                    <small className="muted">Use at least 12 characters.</small>
                  )}
                </label>
              )}
              {action === "reset-password" && (
                <label className="field">
                  <span>Confirm new password</span>
                  <input
                    name="confirm_password"
                    placeholder="Confirm your new password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={200}
                    required
                  />
                </label>
              )}
              {signup && (
                <label className="field">
                  <span>
                    Referral code <span className="muted">(optional)</span>
                  </span>
                  <input
                    name="referral_code"
                    placeholder="Enter referral code (optional)"
                    maxLength={32}
                    defaultValue={
                      typeof window !== "undefined"
                        ? new URLSearchParams(window.location.search).get(
                            "ref",
                          ) || ""
                        : ""
                    }
                  />
                </label>
              )}
              {signin && (
                <div className="auth-meta">
                  <span>Secure account access</span>
                  <Link href="/auth/forgot-password">Forgot password?</Link>
                </div>
              )}
              {signup && (
                <p style={{ fontSize: 10, marginBottom: 20 }}>
                  By creating an account, you agree to our{" "}
                  <Link className="auth-policy-link" href="/legal/terms">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link className="auth-policy-link" href="/legal/privacy">
                    Privacy policy
                  </Link>
                  .
                </p>
              )}
              <button
                className="button"
                disabled={
                  busy ||
                  (action === "reset-password" &&
                    !/^[a-f0-9]{64}$/.test(resetToken))
                }
              >
                {busy ? (
                  <Spinner />
                ) : signup ? (
                  "Create account"
                ) : signin ? (
                  "Sign in"
                ) : forgot ? (
                  "Send reset link"
                ) : (
                  "Reset password"
                )}
              </button>
            </form>
          )}
          {action === "reset-password" && !message && (
            <p>
              <Link href="/auth/forgot-password">Request a new reset link</Link>
            </p>
          )}
          {(signin || signup) && (
            <>
              <div className="auth-divider">or continue with</div>
              <button
                className="button secondary"
                onClick={() => {
                  if (google)
                    window.location.href =
                      "/api/backend/auth/google/start" +
                      (signup &&
                      (
                        document.querySelector<HTMLInputElement>(
                          'input[name="referral_code"]',
                        )?.value || ""
                      ).trim()
                        ? "?ref=" +
                          encodeURIComponent(
                            document
                              .querySelector<HTMLInputElement>(
                                'input[name="referral_code"]',
                              )!
                              .value.trim(),
                          )
                        : "");
                  else
                    setError(
                      "Google sign-in is not configured yet. Use email and password.",
                    );
                }}
              >
                <span className="google">G</span> Google
              </button>
            </>
          )}
          <div className="auth-bottom">
            {signin ? (
              <>
                New here? <Link href="/auth/signup">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/auth/signin">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
