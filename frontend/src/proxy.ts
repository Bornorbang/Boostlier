import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const canonical = process.env.NEXT_PUBLIC_SITE_URL;
  const target = canonical ? new URL(canonical) : null;
  if (process.env.NODE_ENV === "production" && target?.protocol === "https:") {
    const hostname = request.headers.get("host");
    const proto =
      request.headers.get("x-forwarded-proto") ||
      request.nextUrl.protocol.replace(":", "");
    if (hostname !== target.host || proto !== "https") {
      target.pathname = request.nextUrl.pathname;
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }
  }
  // Reject unknown private paths before an async layout can begin a 200 stream.
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  const privateGroups: [string, RegExp][] = [
    [
      "/dashboard",
      /^\/dashboard(?:\/(?:numbers|usa|global|rentals|history|wallet(?:\/(?:activity|top-ups))?|long-term|dedicated|temp-mail|ads|rewards|referral|api|announcements|support|profile(?:\/change-password)?))?$/,
    ],
    [
      "/admin",
      /^\/admin(?:\/(?:users|numbers|rentals|ads|payments|support|operations|audit-log|settings|wallet-history|rental-history|long-term|dedicated|temp-mail|boost-orders|rewards|announcements|updates))?$/,
    ],
    ["/boost-account", /^\/boost-account(?:\/(?:new-order|orders))?$/],
  ];
  if (
    privateGroups.some(
      ([prefix, pattern]) =>
        (path === prefix || path.startsWith(prefix + "/")) &&
        !pattern.test(path),
    )
  ) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), {
      status: 404,
    });
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
