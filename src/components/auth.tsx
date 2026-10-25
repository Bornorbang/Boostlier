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
              <div className="auth-divider">or</div>
              <button
                type="button"
                className="auth-google-button"
                disabled={busy}
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
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
                  <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.77-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
                <span>Continue with Google</span>
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
