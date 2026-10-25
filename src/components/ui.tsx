"use client";
import { BrandIcon } from "./brand-icon";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Moon,
  Sun,
  Menu,
  X,
  ArrowUpRight,
  Check,
  Copy,
  LoaderCircle,
} from "lucide-react";
import { publicLinks } from "@/lib/config";
import { api } from "@/lib/api";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  return (
    <button
      className="icon-button"
      aria-label="Toggle colour theme"
      onClick={() => {
        const value = !dark;
        setDark(value);
        document.documentElement.dataset.theme = value ? "dark" : "light";
        localStorage.setItem("theme", value ? "dark" : "light");
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
export function PublicNav() {
  const [open, setOpen] = useState(false);
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(() => setSigned(true))
      .catch(() => {});
  }, []);
  return (
    <header className="public-header">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <BrandIcon />
          Boostlier
          <span className="brand-dot">.</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className={open ? "public-links open" : "public-links"}
        >
          {publicLinks.map(([label, url]) => (
            <Link key={url} href={url} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          {signed ? (
            <Link className="button small" href="/dashboard">
              Dashboard <ArrowUpRight size={14} />
            </Link>
          ) : (
            <>
              <Link className="signin-link" href="/auth/signin">
                Sign in
              </Link>
              <Link className="button small" href="/auth/signup">
                Get started <ArrowUpRight size={14} />
              </Link>
            </>
          )}
          <button
            className="icon-button mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function OrderButton({
  label = "Order now",
  href = "/dashboard/numbers",
  className = "button",
}: {
  label?: string;
  href?: string;
  className?: string;
}) {
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(() => setSigned(true))
      .catch(() => {});
  }, []);
  return (
    <Link
      className={className}
      href={signed ? href : `/auth/signup?next=${encodeURIComponent(href)}`}
    >
      {label}
      <ArrowUpRight size={17} />
    </Link>
  );
}
export function CopyButton({
  value,
  label = "Copy",
  textOnly = false,
}: {
  value: string;
  label?: string;
  textOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={textOnly ? "number-copy" : "icon-button"}
      aria-label={copied ? "Copied" : label}
      title={textOnly ? (copied ? "Copied!" : "Click to copy") : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {textOnly ? value : copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={18} aria-label="Loading" />;
}
export function Alert({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`alert ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
