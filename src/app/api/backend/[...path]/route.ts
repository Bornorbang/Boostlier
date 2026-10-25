import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const headers = new Headers();
  if (Number(req.headers.get("content-length") || 0) > 6 * 1024 * 1024)
    return NextResponse.json(
      {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "The request exceeds the upload limit.",
        },
      },
      { status: 413 },
    );
  for (const name of [
    "content-type",
    "cookie",
    "x-api-key",
    "idempotency-key",
    "stripe-signature",
    "verif-hash",
  ]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Trust only the country header inserted by the configured hosting edge.
  // Production must strip incoming copies of that header before setting it.
  const geoProvider =
    process.env.IP_GEOLOCATION_PROVIDER || (process.env.VERCEL ? "vercel" : "");
  const countryHeader =
    geoProvider === "cloudflare"
      ? "cf-ipcountry"
      : geoProvider === "vercel"
        ? "x-vercel-ip-country"
        : null;
  const country = countryHeader ? req.headers.get(countryHeader) : null;
  if (process.env.BACKEND_PROXY_SECRET) {
    headers.set("x-boostlier-proxy-secret", process.env.BACKEND_PROXY_SECRET);
    if (country && /^[A-Z]{2}$/i.test(country))
      headers.set("x-boostlier-country", country.toUpperCase());
  }
  // Mutating browser requests must originate from this application.
  const origin = req.headers.get("origin");
  const siteOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || req.url)
    .origin;
  if (!["GET", "HEAD"].includes(req.method) && origin && origin !== siteOrigin)
    return NextResponse.json(
      {
        error: { code: "ORIGIN_REJECTED", message: "Request origin rejected." },
      },
      { status: 403 },
    );
  try {
    const upstream = await fetch(
      `${process.env.BACKEND_URL || "http://127.0.0.1:8080"}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`,
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : await req.arrayBuffer(),
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      },
    );
    const out = new NextResponse(upstream.body, { status: upstream.status });
    out.headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "application/json",
    );
    out.headers.set("Cache-Control", "no-store");
    for (const cookie of upstream.headers.getSetCookie())
      out.headers.append("Set-Cookie", cookie);
    for (const name of ["Location", "Retry-After", "Content-Disposition"]) {
      const value = upstream.headers.get(name);
      if (value) out.headers.set(name, value);
    }
    return out;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNAVAILABLE",
          message:
            "We could not reach the service. Your session has been kept. Please try again.",
        },
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
