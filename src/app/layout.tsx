import type { Metadata } from "next";
import "./globals.css";
import { site } from "@/lib/config";
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Boostlier — Social Boosts & SMS Numbers",
    template: "%s | Boostlier",
  },
  description: site.description,
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: site.name,
    images: [{ url: "/social-preview.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/social-preview.png"] },
  icons: {
    icon: { url: "/Boostlier.png", type: "image/png" },
    shortcut: "/Boostlier.png",
    apple: "/Boostlier.png",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}`,
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  name: site.name,
                  url: site.url,
                  logo: site.url + "/Boostlier.png",
                },
                { "@type": "WebSite", name: site.name, url: site.url },
              ],
            }).replace(/</g, "\u003c"),
          }}
        />
      </body>
    </html>
  );
}
