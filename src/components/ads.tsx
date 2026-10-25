"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Info, Megaphone, X } from "lucide-react";
import { api } from "@/lib/api";
import { finishPurchase, purchaseKey } from "@/lib/purchase";
import { useAccount } from "./dashboard-shell";
import { Title, Empty } from "./dashboard";
import { Alert, Spinner } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";

type Ad = {
  id: string;
  title: string;
  target_url: string;
  banner_url: string;
  mine: boolean;
  status: string;
  price_usd: string;
  created_at: string;
  expires_at: string;
};
type Board = {
  items: Ad[];
  mine: Ad[];
  price_usd: string;
  page: number;
  total: number;
  per_page: number;
};

export function AdsPage() {
  const { refresh } = useAccount();
  const [board, setBoard] = useState<Board | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"all" | "mine">("all");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState<Ad | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [clock, setClock] = useState(Date.now());
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<Board>(`/ads?page=${page}&per_page=12`, {
        signal,
      });
      if (!signal?.aborted) {
        setBoard(result);
        setError("");
      }
    },
    [page],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function publish() {
    if (!file || !board || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError("");
    try {
      const bytes = await file.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const input = {
        title: title.trim(),
        target_url: target.trim(),
        banner_hash: digest,
        max_price_usd: board.price_usd,
        terms_version: "2026-10-24",
      };
      const data = new FormData();
      data.set("title", input.title);
      data.set("target_url", input.target_url);
      data.set("max_price_usd", board.price_usd);
      data.set("terms_version", input.terms_version);
      data.set("banner", file);
      const result = await api<{ status: string }>("/ads/create", {
        method: "POST",
        headers: { "Idempotency-Key": purchaseKey("ads", input) },
        body: data,
      });
      finishPurchase("ads", input, result.status);
      setConfirm(false);
      setTitle("");
      setTarget("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setToast("Your ad is live for one month.");
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError("");
    try {
      await api("/ads/remove", {
        method: "POST",
        body: JSON.stringify({ id: removing.id, confirmed: true }),
      });
      setRemoving(null);
      setToast("Ad removed from the board.");
      await load();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const items =
    (view === "mine" ? board?.mine : board?.items)?.filter(
      (ad) =>
        view === "mine" ||
        (ad.status === "active" && new Date(ad.expires_at).getTime() > clock),
    ) || [];
  return (
    <>
      <Title
        title="Ads"
        description="Post your ads here, get seen daily by thousands of people"
      />
      {toast && (
        <div className="boost-toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <Alert kind="error">
          {error}
          <button
            className="button secondary small"
            onClick={() => load().catch((error) => setError(error.message))}
          >
            Retry
          </button>
        </Alert>
      )}
      <div className="tabs ads-tabs">
        <button
          type="button"
          className={view === "all" ? "active" : ""}
          onClick={() => setView("all")}
        >
          Community ads
        </button>
        <button
          type="button"
          className={view === "mine" ? "active" : ""}
          onClick={() => setView("mine")}
        >
          My ads
        </button>
      </div>
      <div
        className={view === "all" ? "ads-layout community-view" : "ads-layout"}
      >
        <section className="panel ads-compose" hidden={view !== "mine"}>
          <div className="panel-head">
            <h3>Put your business in the spotlight</h3>
            <Megaphone size={20} />
          </div>
          <p>
            Publish your banner on this page for one calendar month. No
            automatic renewal.
          </p>
          <div className="ads-price">
            <strong>{board ? `$${board.price_usd}` : "—"}</strong>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFormError("");
              setConfirm(true);
            }}
          >
            <label className="field">
              <span>Ad title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={40}
                placeholder="Your business or offer"
                required
                disabled={busy}
              />
              <small className="muted">{title.length}/40 characters</small>
            </label>
            <label className="field">
              <span>Website link</span>
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                type="url"
                maxLength={2048}
                placeholder="https://your-website.com"
                required
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Banner image</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                disabled={busy}
                onChange={(event) => {
                  const image = event.target.files?.[0];
                  setFormError("");
                  if (
                    image &&
                    (!["image/png", "image/jpeg", "image/webp"].includes(
                      image.type,
                    ) ||
                      image.size > 2 * 1024 * 1024)
                  ) {
                    setFormError(
                      "Choose a PNG, JPEG or WebP image of at most 2 MB.",
                    );
                    setFile(null);
                    event.target.value = "";
                  } else setFile(image || null);
                }}
              />
              <small className="muted">
                PNG, JPEG or WebP, up to 2 MB. Recommended: 1200 × 400 pixels.
                Minimum: 300 × 100.
              </small>
            </label>
            {preview ? (
              <img
                className="ads-banner ads-draft"
                src={preview}
                alt="Your banner preview"
              />
            ) : (
              <div className="ads-upload-preview">
                <ImagePlus size={24} />
                <span>Your banner preview will appear here</span>
              </div>
            )}
            {formError && !confirm && !removing && (
              <Alert kind="error">{formError}</Alert>
            )}
            <button className="button" disabled={!board || !file || busy}>
              Publish
            </button>
          </form>
        </section>
        <section className="ads-board">
          {!board && !error ? (
            <Spinner />
          ) : items.length ? (
            <div className="ads-grid">
              {items.map((ad) => {
                const live =
                  ad.status === "active" &&
                  new Date(ad.expires_at).getTime() > clock;
                return (
                  <article className="panel ad-card" key={ad.id}>
                    <a
                      className="ad-image-link"
                      href={ad.target_url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      aria-label={`Visit ${ad.title}`}
                    >
                      <img
                        className="ads-banner"
                        src={ad.banner_url}
                        alt={ad.title}
                      />
                    </a>
                    <div className="panel-head">
                      <h3>
                        <a
                          className="ad-title-link"
                          href={ad.target_url}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                        >
                          {ad.title}
                        </a>
                      </h3>
                    </div>
                    <div className="form-actions">
                      {!live && (
                        <span className="badge neutral">
                          {ad.status === "removed" ? "Removed" : "Expired"}
                        </span>
                      )}
                      {view === "mine" && ad.mine && live && (
                        <button
                          className="button secondary small"
                          disabled={busy}
                          onClick={() => {
                            setFormError("");
                            setRemoving(ad);
                          }}
                        >
                          Remove ad
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <section className="panel">
              <Empty
                title={
                  view === "mine"
                    ? "Your next audience starts here"
                    : "Be the first in the spotlight"
                }
                description={
                  view === "mine"
                    ? "Your banners, placement dates and status will appear here."
                    : "Publish a banner to introduce your business to the Boostlier community."
                }
              />
            </section>
          )}
          {view === "all" && board && board.total > board.per_page && (
            <div className="form-actions">
              <button
                className="button secondary small"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                className="button secondary small"
                disabled={page * board.per_page >= board.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
      {confirm && (
        <ConfirmDialog
          title="Publish your ad?"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          {preview && (
            <img className="ads-banner" src={preview} alt="Banner to publish" />
          )}
          <h3>{title}</h3>
          <p className="ad-target">{target}</p>
          <p>
            <strong>${board?.price_usd}</strong> will be charged to your wallet.
            Your ad will appear on the Ads page for one calendar month from
            publication.
          </p>
          <p className="fine-print">
            No automatic renewal. No discretionary refunds after publication;
            statutory rights apply.
          </p>
          <p className="ads-agreement">
            <Info size={12} aria-hidden="true" />
            <span>
              You agree to our{" "}
              <a
                href="/ads#ads-terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                ads terms
              </a>
            </span>
          </p>
          <p className="fine-print">
            By paying, you request immediate publication. Ads may be removed
            under the Ads Terms.
          </p>
          {formError && <Alert kind="error">{formError}</Alert>}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep editing
            </button>
            <button className="button" disabled={busy} onClick={publish}>
              {busy ? <Spinner /> : `Pay $${board?.price_usd} & publish`}
            </button>
          </div>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove this ad?"
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <p>
            {removing.title} will stop appearing on the community board. The
            original payment will not be refunded.
          </p>
          {formError && <Alert kind="error">{formError}</Alert>}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Keep ad
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? <Spinner /> : "Remove now"}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
