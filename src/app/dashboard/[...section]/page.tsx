import { notFound, redirect } from "next/navigation";
import {
  NumberHistoryPage,
  WalletPage,
  WalletHistoryPage,
  Profile,
  ApiDashboard,
  Support,
  Announcements,
} from "@/components/dashboard";
import { Rewards } from "@/components/rewards";
import { ProductDashboard } from "@/components/products";
import { TemporaryEmails } from "@/components/temp-mail";
import { AdsPage } from "@/components/ads";
import { NumbersDashboard } from "@/components/numbers";
import { NumberRentalsDashboard } from "@/components/number-rentals";
import { GlobalNumbersDashboard } from "@/components/global-numbers";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const s = (await params).section.join("/");
  if (s === "referral") redirect("/dashboard/rewards");
  if (s === "numbers") return <NumbersDashboard />;
  if (s === "usa") redirect("/dashboard/numbers");
  if (s === "global") return <GlobalNumbersDashboard />;
  if (s === "wallet") return <WalletPage />;
  if (s === "wallet/activity") return <WalletHistoryPage />;
  if (s === "wallet/top-ups") redirect("/dashboard/wallet");
  if (s === "rentals") return <NumberRentalsDashboard />;
  if (s === "long-term") redirect("/dashboard/rentals");
  if (s === "history") return <NumberHistoryPage />;
  if (s === "profile" || s === "profile/change-password")
    return <Profile password={s.includes("change-password")} />;
  if (s === "api") return <ApiDashboard />;
  if (s === "rewards") return <Rewards />;
  if (s === "temp-mail") return <TemporaryEmails />;
  if (s === "ads") return <AdsPage />;
  if (["long-term", "dedicated"].includes(s))
    return <ProductDashboard product={s} />;
  if (s === "support") return <Support />;
  if (s === "announcements") return <Announcements />;
  notFound();
}
