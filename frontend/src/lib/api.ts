export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api/backend" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    cache: "no-store",
  });
  const body = await res
    .json()
    .catch(() => ({
      error: { message: "The service returned an unreadable response." },
    }));
  if (!res.ok)
    throw new ApiError(
      body.error?.message || "Something went wrong. Please try again.",
      res.status,
      body.error?.code || "REQUEST_FAILED",
    );
  return body;
}
export type PriceRow = {
  id: string;
  service: string;
  stock: number;
  duration_minutes?: number;
  price_usd: string;
};
export type Snapshot = {
  items: PriceRow[];
  state: "live" | "stale" | "unavailable";
  message?: string;
  updated_at?: string;
};
export async function serverPrices(
  catalogue = "usa",
  country = "united-kingdom",
  wholesale = false,
): Promise<Snapshot> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL || "http://127.0.0.1:8080"}/public/prices?catalogue=${catalogue}&country=${country}&wholesale=${wholesale ? "1" : "0"}`,
      { next: { revalidate: 45 }, signal: AbortSignal.timeout(3500) },
    );
    if (!res.ok) throw Error();
    return await res.json();
  } catch {
    return {
      items: [],
      state: "unavailable",
      message:
        "Live pricing is currently unavailable. No order will be charged until a current quote can be confirmed.",
    };
  }
}
