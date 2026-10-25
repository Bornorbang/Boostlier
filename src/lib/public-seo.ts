import type { Metadata } from "next";
import { site } from "./config";

export const homepageTitle = "Boostlier SMM Panel | Fast & Cheap Social Media Growth";
export const homepageDescription = "Buy followers, likes, views and engagement for your social media accounts - Facebook, Instagram, Tiktok, Youtube, etc.";

export const publicSeo: Record<string, [string, string]> = {
  "social-boosting": ["SMM Panel | Buy Followers, Likes & Views", "Buy followers instantly with Boostlier. Explore a cheap Instagram followers panel, low price TikTok likes, YouTube views and Facebook post likes in one easy SMM panel."],
  numbers: ["Temporary Phone Numbers | USA & Global SMS Verification", "Get temporary USA and Global phone numbers for SMS verification. Choose your country and service, receive codes online and manage numbers from one dashboard."],
  pricing: ["SMM Panel & Temporary Number Prices in USD", "Explore affordable social media growth and temporary number pricing. Compare Boost Socials services, USA and Global SMS numbers, long-term rentals and temporary email."],
  "long-term-rentals": ["Long-term USA Number Rentals | Receive SMS Online", "Rent a USA mobile number for longer-term SMS access. Choose your service and duration, receive messages online and extend manually before expiry."],
  "dedicated-numbers": ["Dedicated Numbers | Service Availability", "Explore Boostlier number services. Dedicated numbers are not currently available; browse USA, Global and long-term number rentals instead."],
  "temporary-email": ["Temporary Email Addresses | 24-Hour Disposable Inbox", "Generate a temporary email address with a 24-hour inbox. Read messages online, renew before expiry and manage addresses with your Boostlier account."],
  developers: ["SMM Panel & SMS Verification API for Developers", "Build your own website with the Boostlier API. Integrate social media boosts, USA and Global SMS numbers, long-term rentals and temporary email with API documentation."],
  faq: ["SMM Panel, SMS Numbers & Wallet FAQs", "Find answers about Boostlier social media promotion, followers, likes, views, SMS verification numbers, temporary email, USD wallet payments and order tracking."],
  ads: ["Advertising Terms | Boostlier Community Ads", "Read the terms for Boostlier community banner ads, including placement duration, payment, prohibited content, removal and advertiser responsibilities."],
  "legal/terms": ["Terms of Service", "Read Boostlier LTD terms for social promotion, SMS numbers, temporary email, account eligibility, wallet funding, cancellations and acceptable use."],
  "legal/privacy": ["Privacy Policy", "Learn how Boostlier LTD processes account, payment, social promotion, SMS, temporary email and support data, and how to contact us about privacy."],
};

export function publicMetadata(path: string, title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title, description, url: path, type: "website", locale: "en_GB", siteName: site.name,
      images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "Boostlier social media boosts and temporary numbers" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/social-preview.png"] },
  };
}
