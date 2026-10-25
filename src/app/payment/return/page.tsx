import { PaymentReturn } from "@/components/payment-return";
export const metadata = {
  title: "Payment status",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PaymentReturn />;
}
