import { site } from "@/lib/config";
export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard/",
          "/admin/",
          "/auth/",
          "/boost-account/",
          "/payment/",
        ],
      },
    ],
    sitemap: site.url + "/sitemap.xml",
  };
}
