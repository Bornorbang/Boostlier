import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Flag,
  Globe2,
  Heart,
  Play,
  Users,
} from "lucide-react";
import { OrderButton } from "./ui";
export function MainServiceLanding({ kind }: { kind: "social" | "numbers" }) {
  const social = kind === "social";
  const cards = social
    ? [
        {
          Icon: Users,
          title: "Instagram growth panel",
          text: "Buy followers instantly. Explore our cheap Instagram followers panel for your next social media boost.",
          href: "/boost-account/new-order",
        },
        {
          Icon: Heart,
          title: "Likes & engagement",
          text: "Find low price TikTok likes and a Facebook post likes panel. Order automatic likes and views from one dashboard.",
          href: "/boost-account/new-order",
        },
        {
          Icon: Play,
          title: "TikTok & YouTube views",
          text: "Buy TikTok views cheap and explore YouTube watch time booster services for your video content.",
          href: "/boost-account/new-order",
        },
      ]
    : [
        {
          Icon: Flag,
          title: "USA Numbers",
          text: "Get a USA number and receive your verification SMS.",
          href: "/dashboard/numbers",
        },
        {
          Icon: Globe2,
          title: "Global Numbers",
          text: "Choose your country and service to find a number.",
          href: "/dashboard/global",
        },
        {
          Icon: Clock3,
          title: "Long-term Rentals",
          text: "Keep a number longer and extend before expiry.",
          href: "/dashboard/rentals",
        },
      ];
  return (
    <>
      <div className="public-action-bar">
        <OrderButton
          label={social ? "Browse boost services" : "Get a number"}
          href={social ? "/boost-account/new-order" : "/dashboard/numbers"}
        />
        <span>One account. Pay as you go.</span>
      </div>
      <div className="public-card-grid">
        {cards.map(({ Icon, title, text, href }) => (
          <Link className="public-service-card" href={href} key={title}>
            <span className="public-card-icon">
              <Icon size={23} />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
            <ArrowUpRight className="public-card-arrow" size={19} />
          </Link>
        ))}
      </div>
      <p className="public-footnote">
        {social
          ? "Prices and delivery times vary by service. Review the service details before ordering."
          : "Availability and platform acceptance vary. Current prices are shown in your dashboard."}
      </p>
    </>
  );
}
