import Link from "next/link";
import { ArrowUpRight, MessageSquare, Zap } from "lucide-react";
export function ServiceChoices({ dashboard = false }: { dashboard?: boolean }) {
  return (
    <div className="service-pillars" aria-label="Boostlier main services">
      {[
        {
          name: "Boost Account",
          eyebrow: "SOCIAL ACCOUNT PROMOTION",
          description: "Social promotion for your account, post or video.",
          Icon: Zap,
          href: dashboard ? "/boost-account/new-order" : "/social-boosting",
          action: dashboard ? "Boost an account" : "Explore Boost Account",
          links: dashboard
            ? [["Order history", "/boost-account/orders"]]
            : [["Browse promotion services", "/boost-account/new-order"]],
        },
        {
          name: "Numbers & SMS",
          eyebrow: "MOBILE NUMBERS & SMS",
          description: "USA and Global numbers for SMS verification.",
          Icon: MessageSquare,
          href: dashboard ? "/dashboard/numbers" : "/numbers",
          action: dashboard ? "Get a number" : "Explore numbers",
          links: dashboard
            ? [["Rental history", "/dashboard/history"]]
            : [
                ["Number pricing", "/pricing"],
                ["Long-term rentals", "/long-term-rentals"],
              ],
        },
      ].map(({ name, eyebrow, description, Icon, href, action, links }) => (
        <article className="service-pillar" key={name}>
          <div className="pillar-header">
            <span className="feature-icon">
              <Icon size={24} />
            </span>
            <span className="eyebrow">{eyebrow}</span>
          </div>
          <h2>{name}</h2>
          <p>{description}</p>
          <Link className="button" href={href}>
            {action}
            <ArrowUpRight size={15} />
          </Link>
          {dashboard && (
            <div className="pillar-links">
              {links.map(([label, url]) => (
                <Link key={url} href={url}>
                  {label}
                  <ArrowUpRight size={12} />
                </Link>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
