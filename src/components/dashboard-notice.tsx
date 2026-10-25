"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alert } from "./ui";

type Notice = { text: string; updated_at: string | null };

export function DashboardMarquee() {
  const [text, setText] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      api<Notice>("/dashboard-notice", { signal: controller.signal })
        .then((notice) => setText(notice.text))
        .catch(() => {});
    void load();
    const interval = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, []);
  if (!text) return null;
  return (
    <div className="dashboard-marquee">
      <div className="dashboard-marquee-viewport">
        <span
          className="dashboard-marquee-track"
          style={{
            animationDuration: `${Math.max(10, text.length / 6)}s`,
          }}
        >
          <span className="dashboard-marquee-message">{text}</span>
        </span>
      </div>
    </div>
  );
}

export function AdminDashboardNotice() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Notice>("/admin/dashboard-notice", { signal: controller.signal })
      .then((notice) => {
        setText(notice.text);
        setLoaded(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel">
      <h2>Dashboard scrolling notice</h2>
      <p>
        Shown alongside the greeting on customer dashboards. Leave blank to hide
        it.
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!loaded || busy) return;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const result = await api<Notice & { message: string }>(
              "/admin/dashboard-notice",
              { method: "PATCH", body: JSON.stringify({ text }) },
            );
            setText(result.text);
            setMessage(result.message);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Dashboard notice text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={!loaded || busy}
          />
        </label>
        <button className="button small" disabled={!loaded || busy}>
          {busy ? "Saving..." : "Save dashboard notice"}
        </button>
      </form>
    </section>
  );
}
