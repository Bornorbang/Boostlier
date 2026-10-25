import { notFound } from "next/navigation";
import { AuthForm } from "@/components/auth";
export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ action: string }>;
}) {
  const { action } = await params;
  if (
    !["signin", "signup", "forgot-password", "reset-password"].includes(action)
  )
    notFound();
  return <AuthForm action={action} />;
}
