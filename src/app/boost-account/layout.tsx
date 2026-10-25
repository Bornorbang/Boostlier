import { DashboardShell } from "@/components/dashboard-shell";
export const metadata = {
  title: "Boost Socials",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
