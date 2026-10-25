import Image from "next/image";
import boostlierHero from "../../public/Boostlier-hero.png";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Search,
  Wallet,
  Zap,
} from "lucide-react";
import { PublicShell, FAQ, StructuredFAQ } from "./public";
import { OrderButton } from "./ui";
import { ServiceChoices } from "./service-choices";
import { faqs } from "@/lib/config";
import { homepageDescription } from "@/lib/public-seo";

export function Home() {
  return (
    <PublicShell>
      <section className="hero section-wrap dual-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-dot" /> INSTANT DELIVERY SMM PANEL
          </div>
          <h1>
            Fast & cheap
            <br />
            <em>social media growth.</em>
          </h1>
          <p className="hero-description">
            {homepageDescription}
          </p>
          <div className="hero-actions dual-actions">
            <OrderButton
              label="Boost an account"
              href="/boost-account/new-order"
            />
            <OrderButton label="Get a number" href="/dashboard/numbers" />
          </div>
        </div>
        <div className="hero-art hero-image">
          <Image
            src={boostlierHero}
            alt={homepageDescription}
            fill
            sizes="(min-width: 1200px) 540px, (min-width: 1024px) 45vw, 1px"
            loading="eager"
            fetchPriority="high"
            style={{ objectFit: "contain" }}
          />
        </div>
      </section>
      <section className="section-wrap section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">OUR SERVICES</span>
            <h2>
              What brings you
              <br />
              <em>to Boostlier?</em>
            </h2>
          </div>
          <p>A quick social media boost, or a temporary number for your next SMS verification.</p>
        </div>
        <ServiceChoices />
      </section>
      <section className="services-section">
        <div className="section-wrap">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                A SIMPLE START, WHICHEVER YOU CHOOSE
              </span>
              <h2>
                Your next move.
                <br />
                <em>Three straightforward steps.</em>
              </h2>
            </div>
          </div>
          <div className="steps-grid">
            {[
              {
                Icon: Wallet,
                n: "01",
                title: "Create an account & fund your wallet",
                body: "Use one Boostlier account and a prepaid USD balance for both main services.",
              },
              {
                Icon: Search,
                n: "02",
                title: "Choose your service",
                body: "Pick a social promotion service and quantity, or select a country and number rental. Check your quote before paying.",
              },
              {
                Icon: CheckCircle2,
                n: "03",
                title: "Follow it in your dashboard",
                body: "Track your social order and supported refills, or receive SMS codes and manage your number rental.",
              },
            ].map(({ Icon, n, title, body }) => (
              <article className="step-card" key={n}>
                <div className="step-top">
                  <span className="feature-icon">
                    <Icon size={22} />
                  </span>
                  <span className="step-number">{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section-wrap section-block faq-section">
        <div>
          <span className="eyebrow">BOTH SERVICES. CLEAR ANSWERS.</span>
          <h2>
            A few things
            <br />
            <em>you might ask.</em>
          </h2>
          <p>From social orders to SMS verification.</p>
          <Link className="text-link" href="/faq">
            Read all FAQs <ArrowUpRight size={16} />
          </Link>
        </div>
        <FAQ items={faqs.filter((_, i) => [0, 1, 2].includes(i))} />
      </section>
      <section className="cta section-wrap">
        <div className="cta-icon">
          <Zap size={30} />
        </div>
        <div>
          <h2>What’s your next move?</h2>
          <p>Boost an account. Rent a number. Start with Boostlier.</p>
        </div>
        <OrderButton label="Get started" href="/dashboard" />
      </section>
      <StructuredFAQ items={faqs.filter((_, i) => [0, 1, 2].includes(i))} />
    </PublicShell>
  );
}
