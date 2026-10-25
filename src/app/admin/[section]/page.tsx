import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "users",
      "numbers",
      "rentals",
      "ads",
      "payments",
      "support",
      "operations",
      "audit-log",
      "settings",
      "wallet-history",
      "rental-history",
      "long-term",
      "dedicated",
      "temp-mail",
      "boost-orders",
      "rewards",
      "announcements",
      "updates",
    ].includes(section)
  )
    notFound();
  return <AdminPage section={section} />;
}
