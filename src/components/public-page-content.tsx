import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  Flag,
  Globe2,
  Inbox,
  Zap,
} from "lucide-react";
import { OrderButton } from "./ui";
import { ApiDocs } from "./docs";

const products = [
  {
    title: "Boost Socials",
    text: "Pick a service and quantity for a current quote.",
    href: "/boost-account/new-order",
    Icon: Zap,
  },
  {
    title: "USA Numbers",
    text: "See current prices for your verification service.",
    href: "/dashboard/numbers",
    Icon: Flag,
  },
  {
    title: "Global Numbers",
    text: "Choose a country to check prices and availability.",
    href: "/dashboard/global",
    Icon: Globe2,
  },
  {
    title: "Long-term Rentals",
    text: "Compare available durations and extension prices.",
    href: "/dashboard/rentals",
    Icon: Clock3,
  },
  {
    title: "Temporary Emails",
    text: "Generate an inbox with 24-hour access.",
    href: "/dashboard/temp-mail",
    Icon: Inbox,
  },
];
export function PublicPricing() {
  return (
    <>
      <div className="public-card-grid pricing-card-grid">
        {products.map(({ title, text, href, Icon }) => (
          <Link className="public-service-card" key={title} href={href}>
            <span className="public-card-icon">
              <Icon size={23} />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
            <span className="public-card-link">
              View prices
              <ArrowUpRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      <p className="public-footnote">
        Prices are shown in USD in your dashboard before purchase.
      </p>
    </>
  );
}
export function PublicProduct({ name }: { name: string }) {
  const email = name === "temporary-email";
  if (name === "dedicated-numbers")
    return (
      <div className="public-product-panel">
        <h2>Not available yet</h2>
        <p>Explore USA, Global and long-term numbers instead.</p>
        <Link className="button" href="/numbers">
          Explore numbers
          <ArrowUpRight size={15} />
        </Link>
      </div>
    );
  const features = email
    ? ["Active for 24 hours", "Read incoming messages", "Renew before expiry"]
    : [
        "Service-specific USA numbers",
        "Available rental durations",
        "Extend manually before expiry",
      ];
  return (
    <>
      <section className="public-product-panel">
        <span className="public-product-icon">
          {email ? <Inbox size={36} /> : <Clock3 size={36} />}
        </span>
        <div>
          <h2>
            {email
              ? "An inbox, ready when you are."
              : "More time with your number."}
          </h2>
          <p>
            {email
              ? "Generate an address, copy it and read your messages in one place."
              : "Choose your service and duration, then receive messages in your dashboard."}
          </p>
          <ul>
            {features.map((f) => (
              <li key={f}>
                <Check size={16} />
                {f}
              </li>
            ))}
          </ul>
          <OrderButton
            label={email ? "Generate an email" : "Explore rentals"}
            href={email ? "/dashboard/temp-mail" : "/dashboard/rentals"}
          />
        </div>
      </section>
      <p className="public-footnote">
        {email
          ? "Temporary inboxes expire. Keep a permanent email for important accounts."
          : "Availability varies by service. Extend before expiry to keep the same number."}
      </p>
    </>
  );
}
export function PublicDevelopers() {
  return (
    <>
      <section className="public-developer-intro">
        <div>
          <Code2 size={30} />
          <h2>Your website. Our services.</h2>
          <p>
            Offer numbers, rentals, social promotion and temporary email through
            one API.
          </p>
          <div className="public-action-bar">
            <OrderButton label="Get your API key" href="/dashboard/api" />
            <a href="/openapi.json" className="text-link" download>
              Download OpenAPI
              <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <div className="public-code-sample">
          <span>YOUR FIRST REQUEST</span>
          <pre>
            <code>{`curl https://boostlier.com/api/backend/api/v1/numbers/services \\\n  -H 'X-API-Key: YOUR_API_KEY'`}</code>
          </pre>
          <p>Keep your key on your backend.</p>
        </div>
      </section>
      <details className="public-api-reference">
        <summary>
          Full API reference<span>+</span>
        </summary>
        <div>
          <ApiDocs />
        </div>
      </details>
    </>
  );
}
