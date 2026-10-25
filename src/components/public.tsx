import { BrandIcon } from "./brand-icon";
import Link from "next/link";
import { PublicNav } from "./ui";
import { faqs } from "@/lib/config";
import { homepageDescription } from "@/lib/public-seo";
function configuredLinks(name: string): { label: string; url: string }[] {
  try {
    const values = JSON.parse(process.env[name] || "[]");
    return Array.isArray(values)
      ? values.filter(
          (v): v is { label: string; url: string } =>
            typeof v?.label === "string" &&
            typeof v?.url === "string" &&
            v.url.startsWith("https://"),
        )
      : [];
  } catch {
    return [];
  }
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid footer-simple">
        <div>
          <Link href="/" className="brand">
            <BrandIcon />
            Boostlier<span className="brand-dot">.</span>
          </Link>
          <p>{homepageDescription}</p>
          {configuredLinks("BUSINESS_SOCIAL_LINKS").map((link) => (
            <a key={link.url} href={link.url} rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </div>
        <div>
          <h3>Services</h3>
          <Link href="/social-boosting">Boost Account</Link>
          <Link href="/numbers">Numbers & SMS</Link>
          <Link href="/long-term-rentals">Long-term Rentals</Link>
          <Link href="/temporary-email">Temporary Emails</Link>
        </div>
        <div>
          <h3>Resources</h3>
          <Link href="/developers">Developer API</Link>
          <Link href="/faq">FAQs</Link>
          <a href="mailto:support@boostlier.com">Contact support</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>&copy; {new Date().getUTCFullYear()} Boostlier LTD</span>
        <nav className="footer-legal" aria-label="Legal">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/ads#ads-terms">Ads terms</Link>
        </nav>
      </div>
    </footer>
  );
}
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNav />
      <main id="main-content">{children}</main>
      <Footer />
    </>
  );
}
export function FAQ({ items = faqs }: { items?: string[][] }) {
  return (
    <div className="faq-list">
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <span>+</span>
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
export function StructuredFAQ({ items = faqs }: { items?: string[][] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }).replace(/</g, "\u003c"),
      }}
    />
  );
}
