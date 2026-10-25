import { site } from "@/lib/config";
export default function sitemap() {
  return [
    "",
    "social-boosting",
    "numbers",
    "pricing",
    "long-term-rentals",
    "temporary-email",
    "developers",
    "faq",
    "ads",
    "services/whatsapp",
    "services/telegram",
    "services/google",
    "legal/terms",
    "legal/privacy",
  ].map((path) => ({ url: site.url + "/" + path }));
}
