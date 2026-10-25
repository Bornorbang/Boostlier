import { notFound } from "next/navigation";
import { Boost } from "@/components/boost";
export default async function Page({
  params,
}: {
  params: Promise<{ action: string }>;
}) {
  const { action } = await params;
  if (!["new-order", "orders"].includes(action)) notFound();
  return <Boost orders={action === "orders"} />;
}
