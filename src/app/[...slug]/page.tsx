import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell, FAQ, StructuredFAQ } from "@/components/public";
import { OrderButton } from "@/components/ui";
import {
  PublicPricing,
  PublicProduct,
  PublicDevelopers,
} from "@/components/public-page-content";
import { faqs, serviceGuides, site } from "@/lib/config";
import { MainServiceLanding } from "@/components/main-service-landing";
import { AdsTerms } from "@/components/ads-terms";
import { TermsOfService } from "@/components/terms-of-service";
import { publicMetadata, publicSeo } from "@/lib/public-seo";
const pages: Record<string, [string, string]> = {
  ads: ["Ads terms", "A simple guide to advertising with Boostlier."],
  "social-boosting": [
    "Fast & cheap social media growth",
    "An instant delivery SMM panel for followers, likes and views. Boost Instagram, TikTok, YouTube and Facebook with no technical setup required.",
  ],
  numbers: [
    "Numbers & SMS",
    "USA and Global numbers for your next verification.",
  ],
  pricing: [
    "Simple pricing. In USD.",
    "Choose a service to see current prices in your dashboard.",
  ],
  "long-term-rentals": [
    "Long-term Rentals",
    "A USA number for the time you need.",
  ],
  "dedicated-numbers": [
    "Dedicated numbers",
    "Find the number access that works for you.",
  ],
  "temporary-email": ["Temporary Emails", "A fresh address. A 24-hour inbox."],
  developers: [
    "Build with Boostlier",
    "Bring Boostlier services to your own website.",
  ],
  faq: ["Frequently asked questions", "A few things to know before you start."],
  "legal/terms": [
    "Terms of service",
    "Terms for accounts, wallet funding, orders, refunds and acceptable use.",
  ],
  "legal/privacy": [
    "Privacy policy",
    "How Boostlier handles account, payment and service data.",
  ],
};
type Props = { params: Promise<{ slug: string[] }> };
export const revalidate = 45;
export function generateStaticParams() {
  return [
    ...Object.keys(pages),
    ...Object.keys(serviceGuides).map((s) => "services/" + s),
  ].map((s) => ({ slug: s.split("/") }));
}
export async function generateMetadata({ params }: Props) {
  const key = (await params).slug.join("/");
  const guide = serviceGuides[key.replace("services/", "")];
  const p =
    pages[key] ||
    (key.startsWith("services/") && guide ? [guide.title, guide.intro] : null);
  if (!p) return {};
  const seo = publicSeo[key] || p;
  return {
    ...publicMetadata("/" + key, seo[0] + " | Boostlier", seo[1]),
    ...(key === "dedicated-numbers" ? { robots: { index: false, follow: true } } : {}),
  };
}
export default async function Page({ params }: Props) {
  const key = (await params).slug.join("/");
  const guide = key.startsWith("services/")
    ? serviceGuides[key.split("/")[1]]
    : null;
  const p = pages[key] || (guide ? [guide.title, guide.intro] : null);
  if (!p) notFound();
  return (
    <PublicShell>
      <div className="public-page">
        <section className="public-page-hero section-wrap">
          {guide && (
            <div className="breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              <Link href="/pricing">Services</Link>
              <span>/</span>
              <span>{key.split("/")[1]}</span>
            </div>
          )}
          <span className="public-kicker">BOOSTLIER</span>
          <h1>{p[0]}</h1>
          <p>{p[1]}</p>
        </section>
        <div
          className={`section-wrap public-page-content${key.startsWith("legal/") ? " public-legal-content" : ""}`}
        >
          {key === "ads" ? (
            <AdsTerms />
          ) : key === "social-boosting" || key === "numbers" ? (
            <MainServiceLanding
              kind={key === "social-boosting" ? "social" : "numbers"}
            />
          ) : key === "pricing" ? (
            <PublicPricing />
          ) : key === "faq" ? (
            <>
              <FAQ />
              <StructuredFAQ />
            </>
          ) : key === "developers" ? (
            <PublicDevelopers />
          ) : guide ? (
            <>
              <div className="prose policy-document public-guide">
                <h2>Before you rent</h2>
                <p>{guide.limitation}</p>
                <h2>How to receive your verification SMS</h2>
                <ol>
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <h2>Pricing & availability</h2>
                <p>
                  Current USD prices and stock appear in our pricing catalogue.
                  Your final quote is confirmed before purchase. Temporary
                  access ends at expiry and does not provide permanent control
                  of a number.
                </p>
              </div>
              <div style={{ margin: "25px 0" }}>
                <OrderButton
                  label={`Rent for ${key.split("/")[1]}`}
                  href={`/dashboard/numbers?service=${key.split("/")[1]}`}
                />
              </div>
              <FAQ items={guide.questions} />
              <StructuredFAQ items={guide.questions} />
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "BreadcrumbList",
                    itemListElement: [
                      {
                        "@type": "ListItem",
                        position: 1,
                        name: "Home",
                        item: site.url,
                      },
                      {
                        "@type": "ListItem",
                        position: 2,
                        name: guide.title,
                        item: site.url + "/" + key,
                      },
                    ],
                  }).replace(/</g, "\u003c"),
                }}
              />
            </>
          ) : key.startsWith("legal/") ? (
            <Legal privacy={key.endsWith("privacy")} />
          ) : (
            <PublicProduct name={key} />
          )}
        </div>
      </div>
    </PublicShell>
  );
}
function Legal({ privacy }: { privacy: boolean }) {
  return (
    <article className="prose policy-document">
      {privacy ? (
        <>
          <h2>Data we process</h2>
          <p>
            Accounts include your name, email, password hash and referral
            information. We retain wallet entries, payment references, rental
            records, social promotion service selections, public target links,
            quantities, order/refill status, incoming messages, support requests
            and security audit events for service operation and accounting.
          </p>
          <h2>Providers and payments</h2>
          <p>
            Number fulfilment uses TextVerified and 5sim. Hosted payment
            checkout is handled by Stripe or another configured payment
            provider. Boost Account sends the selected social promotion service,
            public target link and quantity to SMM Panel (app.smmpanel.ng) for
            fulfilment and status checks. Google sign-in, SMTP and temporary
            email providers are enabled only after configuration. Payment card
            details are handled by the hosted checkout provider.
          </p>
          <h2>Access and storage</h2>
          <p>
            Private records require authentication and ownership checks.
            Authorised administrators may access service and support records for
            operations. Email message views block active content and remote
            images. Session cookies are necessary for sign-in.
          </p>
          <h2>Retention and your rights</h2>
          <p>
            For account access or data enquiries, email support@boostlier.com.
            Account and transaction records are kept for service operation,
            security, dispute resolution and applicable accounting or legal
            obligations. Some records may need to be retained after an account
            is closed.
          </p>
        </>
      ) : (
        <TermsOfService />
      )}
    </article>
  );
}
