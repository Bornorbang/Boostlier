"use client";
import { BrandIcon } from "./brand-icon";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Globe2,
  Flag,
  Clock3,
  ShieldCheck,
  Wallet,
  Mail,
  Zap,
  Gift,
  Code2,
  History,
  LogOut,
  Plus,
  Bell,
  ChevronRight,
  Menu,
  Megaphone,
  LifeBuoy,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { dashboardLinks } from "@/lib/config";
import { ThemeToggle, Alert, Spinner } from "./ui";
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  referral_code: string;
};
type Account = {
  user: User | null;
  balance: string;
  refresh: () => Promise<void>;
};
const AccountContext = createContext<Account>({
  user: null,
  balance: "—",
  refresh: async () => {},
});
export const useAccount = () => useContext(AccountContext);
const icons: Record<string, typeof Wallet> = {
  usa: Flag,
  globe: Globe2,
  clock: Clock3,
  shield: ShieldCheck,
  wallet: Wallet,
  mail: Mail,
  boost: Zap,
  gift: Gift,
  code: Code2,
  ads: Megaphone,
  help: LifeBuoy,
};
export function DashboardShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState("—");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api<{ active: boolean }>("/auth/impersonation", {
      signal: controller.signal,
    })
      .then((result) => setImpersonating(result.active))
      .catch(() => {});
    return () => controller.abort();
  }, [path]);
  const accountMenu = useRef<HTMLDivElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setAccountOpen(false);
    setMobile(false);
  }, [path]);
  useEffect(() => {
    if (!accountOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!accountMenu.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [accountOpen]);
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError("");
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      router.replace("/auth/signin");
      router.refresh();
    } catch (error) {
      setSignOutError((error as Error).message);
      setSigningOut(false);
    }
  };
  const refresh = useCallback(async () => {
    try {
      const [me, b] = await Promise.all([
        api<{ user: User }>("/auth/me"),
        api<{ balance_usd: string }>("/balance"),
      ]);
      setUser(me.user);
      setBalance(b.balance_usd);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const context = await api<{ active: boolean }>(
          "/auth/impersonation",
        ).catch(() => ({ active: false }));
        if (context.active) {
          setImpersonating(true);
          setError(
            "This customer session has ended. Return to your administrator account.",
          );
        } else router.replace("/auth/signin?next=" + encodeURIComponent(path));
      } else setError((e as Error).message);
    }
  }, [path, router]);
  useEffect(() => {
    refresh();
    const update = () => {
      void refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "boostlier-wallet-updated") update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("storage", onStorage);
    window.addEventListener("boostlier-wallet-updated", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("boostlier-wallet-updated", update);
    };
  }, [refresh]);
  const defaultTitle =
    dashboardLinks.find(([, url]) => url === path)?.[0] || "Your account";
  const links = admin
    ? [
        ["Overview", "/admin", "code"],
        ["Users", "/admin/users", "usa"],
        ["Wallet history", "/admin/wallet-history", "wallet"],
        ["Numbers", "/admin/numbers", "clock"],
        ["Long-term Rentals", "/admin/rentals", "clock"],
        ["Temporary emails", "/admin/temp-mail", "mail"],
        ["Boost socials", "/admin/boost-orders", "boost"],
        ["Ads", "/admin/ads", "ads"],
        ["Payments", "/admin/payments", "wallet"],
        ["Pending operations", "/admin/operations", "clock"],
        ["Support", "/admin/support", "mail"],
        ["Rewards", "/admin/rewards", "gift"],
        ["Announcements", "/admin/announcements", "globe"],
        ["Updates", "/admin/updates", "code"],
        ["Pricing & settings", "/admin/settings", "code"],
        ["Audit log", "/admin/audit-log", "shield"],
      ]
    : dashboardLinks;
  const title = links.find(([, url]) => url === path)?.[0] || defaultTitle;
  return (
    <AccountContext.Provider value={{ user, balance, refresh }}>
      <div className="dash-shell">
        <aside
          className="sidebar"
          style={
            mobile
              ? { display: "flex", boxShadow: "0 0 0 100vmax #0005" }
              : undefined
          }
        >
          <Link
            className="brand"
            href="/dashboard"
            onClick={() => setMobile(false)}
          >
            <BrandIcon />
            Boostlier.
          </Link>
          {admin && <div className="sidebar-label">ADMINISTRATION</div>}
          <nav className="side-links" aria-label="Dashboard navigation">
            {links.map(([label, url, icon]) => {
              const I = icons[icon] || Code2;
              return (
                <div key={url}>
                  {!admin && url === "/dashboard/support" && (
                    <hr className="support-nav-divider" />
                  )}
                  {!admin &&
                    [
                      "/boost-account/new-order",
                      "/dashboard/numbers",
                      "/dashboard/temp-mail",
                    ].includes(url) && (
                      <div className="sidebar-label service-nav-label">
                        {url === "/boost-account/new-order"
                          ? "SOCIAL PROMOTION"
                          : url === "/dashboard/numbers"
                            ? "NUMBERS & SMS"
                            : "ACCOUNT & TOOLS"}
                      </div>
                    )}
                  <Link
                    href={url}
                    className={path === url ? "active" : ""}
                    onClick={() => setMobile(false)}
                  >
                    <I size={16} />
                    {label}
                  </Link>
                  {!admin && url === "/boost-account/new-order" && (
                    <Link
                      className={
                        path === "/boost-account/orders" ? "active" : ""
                      }
                      href="/boost-account/orders"
                      onClick={() => setMobile(false)}
                    >
                      <History size={16} />
                      Boost order history
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
          {user?.role === "admin" && (
            <div className="side-bottom">
              <Link href={admin ? "/dashboard" : "/admin"}>
                <ShieldCheck size={15} />
                {admin ? "Customer dashboard" : "Administration"}
              </Link>
            </div>
          )}
        </aside>
        <div className="dash-main">
          <header className="dash-header">
            <div className="dash-header-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Toggle account navigation"
                aria-expanded={mobile}
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={17} />
              </button>
              <Link className="muted" href="/dashboard">
                Workspace
              </Link>
              <ChevronRight size={12} />
              <span>{title}</span>
            </div>
            <div className="dash-header-right">
              <div className="balance-chip">
                <Wallet size={15} />
                <strong>${balance}</strong>
                <Link href="/dashboard/wallet" aria-label="Top up wallet">
                  <Plus size={14} />
                </Link>
              </div>
              <ThemeToggle />
              <Link
                href="/dashboard/announcements"
                className="icon-button"
                aria-label="Announcements"
              >
                <Bell size={17} />
              </Link>
              <div
                className="account-menu"
                ref={accountMenu}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setAccountOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAccountOpen(false);
                    accountTrigger.current?.focus();
                    return;
                  }
                  if (
                    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  if (!accountOpen) {
                    setAccountOpen(true);
                    requestAnimationFrame(() => {
                      const items =
                        accountMenu.current?.querySelectorAll<HTMLElement>(
                          '[role="menuitem"]',
                        );
                      items?.[
                        event.key === "ArrowUp" || event.key === "End"
                          ? items.length - 1
                          : 0
                      ]?.focus();
                    });
                    return;
                  }
                  const items = Array.from(
                    accountMenu.current?.querySelectorAll<HTMLElement>(
                      '[role="menuitem"]',
                    ) || [],
                  );
                  const current = items.indexOf(
                    document.activeElement as HTMLElement,
                  );
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? items.length - 1
                        : (current +
                            (event.key === "ArrowUp" ? -1 : 1) +
                            items.length) %
                          items.length;
                  items[next]?.focus();
                }}
              >
                <button
                  type="button"
                  className="avatar"
                  ref={accountTrigger}
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  aria-controls="account-dropdown"
                  onClick={() => setAccountOpen(!accountOpen)}
                >
                  <img
                    src="https://img.magnific.com/premium-vector/male-face-avatar-icon-set-flat-design-social-media-profiles_1281173-3806.jpg?semt=ais_hybrid&w=740&q=80"
                    width={32}
                    height={32}
                    alt=""
                  />
                </button>
                {accountOpen && (
                  <div
                    id="account-dropdown"
                    className="account-dropdown"
                    role="menu"
                    aria-label="Account"
                  >
                    <Link
                      role="menuitem"
                      href="/dashboard/profile"
                      onClick={() => setAccountOpen(false)}
                    >
                      Profile
                    </Link>
                    <Link
                      role="menuitem"
                      href="/dashboard/profile/change-password"
                      onClick={() => setAccountOpen(false)}
                    >
                      Change Password
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={signingOut}
                      onClick={signOut}
                    >
                      <LogOut size={15} />
                      {signingOut ? "Signing out?" : "Sign Out"}
                    </button>
                    {signOutError && <p role="alert">{signOutError}</p>}
                  </div>
                )}
              </div>
            </div>
          </header>
          <main id="main-content" className="dash-content">
            {impersonating && (
              <div className="admin-impersonation-banner" role="status">
                <span>
                  You are logged in as a customer{user ? `: ${user.email}` : ""}
                  .
                </span>
                <button
                  className="button secondary small"
                  disabled={returning}
                  onClick={async () => {
                    setReturning(true);
                    try {
                      const result = await api<{ redirect: string }>(
                        "/auth/impersonation/stop",
                        { method: "POST", body: "{}" },
                      );
                      window.location.assign(result.redirect);
                    } catch (e) {
                      setError((e as Error).message);
                      setReturning(false);
                    }
                  }}
                >
                  {returning ? "Returning…" : "Return to admin"}
                </button>
              </div>
            )}
            {error ? (
              <>
                <Alert kind="error">{error}</Alert>
                <button className="button secondary small" onClick={refresh}>
                  Retry connection
                </button>
              </>
            ) : !user ? (
              <div className="empty-state">
                <Spinner />
                <p>Opening your workspace…</p>
              </div>
            ) : admin && user.role !== "admin" ? (
              <Alert kind="error">Administrator access is required.</Alert>
            ) : (
              children
            )}
          </main>
        </div>
        <nav className="mobile-bottom" aria-label="Quick navigation">
          {[
            ["Boost", "/boost-account/new-order", Zap],
            ["USA", "/dashboard/numbers", Flag],
            ["Global", "/dashboard/global", Globe2],
            ["Long-term", "/dashboard/rentals", Clock3],
            ["Wallet", "/dashboard/wallet", Wallet],
          ].map(([label, url, Icon]) => {
            const I = Icon as typeof Wallet;
            return (
              <Link
                key={String(url)}
                href={String(url)}
                className={path === url ? "active" : ""}
              >
                <I size={18} />
                {String(label)}
              </Link>
            );
          })}
        </nav>
      </div>
    </AccountContext.Provider>
  );
}
