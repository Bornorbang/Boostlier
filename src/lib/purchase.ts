"use client";
// Retain a purchase key after network failures and pending outcomes, including across page reloads.
export function purchaseKey(scope: string, input: unknown): string {
  const name = "tn-intent:" + scope + ":" + JSON.stringify(input);
  const previous = sessionStorage.getItem(name);
  if (previous) return previous;
  const key = crypto.randomUUID();
  sessionStorage.setItem(name, key);
  return key;
}
export function finishPurchase(
  scope: string,
  input: unknown,
  status: string,
): void {
  if (["active", "completed", "cancelled", "expired"].includes(status))
    sessionStorage.removeItem(
      "tn-intent:" + scope + ":" + JSON.stringify(input),
    );
}
