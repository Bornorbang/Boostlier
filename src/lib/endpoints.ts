export type Endpoint = {
  group: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  example: Record<string, unknown>;
  idempotent: boolean;
  multipart: boolean;
};
export const endpoints: Endpoint[] = [
  {
    group: "USA Numbers",
    method: "GET",
    path: "/api/v1/numbers/services",
    description:
      "Priced USA service catalogue. Use returned service IDs unchanged.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "USA Numbers",
    method: "GET",
    path: "/api/v1/prices",
    description:
      "Legacy USA catalogue; service query returns one live API quote.",
    example: {
      service: "facebook",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "USA Numbers",
    method: "POST",
    path: "/api/v1/numbers/quote",
    description: "Live stock and customer USD price.",
    example: {
      service: "facebook",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "POST",
    path: "/api/v1/rent",
    description:
      "Purchase a USA or Global verification. For Global include catalogue=global, country and options.quote_id from global-numbers/prices. Returns order including id, phone, sms_code, status, expiry and price_usd.",
    example: {
      service: "facebook",
      catalogue: "usa",
      max_price_usd: "5.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "POST",
    path: "/api/v1/status",
    description:
      "Synchronise owned verification and retrieve SMS, status and refund_usd. Keep SMS codes as strings.",
    example: {
      rental_id: "order-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "POST",
    path: "/api/v1/cancel",
    description:
      "Attempt eligible cancellation. Confirmed cancelled/no-SMS expired verifications refund the original charge once to your wallet; provider errors are not confirmation.",
    example: {
      rental_id: "order-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "POST",
    path: "/api/v1/finish",
    description: "Finish an owned Global verification when supported.",
    example: {
      rental_id: "order-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "GET",
    path: "/api/v1/rentals",
    description:
      "Owned history; product=usa/global/long-term, omit for all. active=1 selects visible active/recent orders.",
    example: {
      page: 1,
      per_page: 20,
      product: "global",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Numbers & history",
    method: "GET",
    path: "/api/v1/history",
    description: "Paginated USA, Global and long-term history.",
    example: {
      page: 1,
      per_page: 20,
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Global Numbers",
    method: "GET",
    path: "/api/v1/global-numbers/countries",
    description: "Available country IDs and names.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "Global Numbers",
    method: "GET",
    path: "/api/v1/global-numbers/services",
    description: "Available service IDs.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "Global Numbers",
    method: "GET",
    path: "/api/v1/global-numbers/prices",
    description:
      "Offers across countries for a service, each with price_usd, stock and quote_id. Select your country. Quote expires after 120 seconds; QUOTE_CHANGED requires a fresh quote.",
    example: {
      service: "facebook",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "GET",
    path: "/api/v1/number-rentals/catalogue",
    description:
      "Services and durations: oneDay, threeDay, sevenDay, fourteenDay, thirtyDay, ninetyDay, oneYear.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "GET",
    path: "/api/v1/number-rentals",
    description:
      "Owned rentals and pending operations; fixed 10 rentals per page.",
    example: {
      page: 1,
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/quote",
    description:
      "Quote purchase with service + duration; quote extension with id + duration.",
    example: {
      service: "facebook",
      duration: "thirtyDay",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/purchase",
    description:
      "Purchase at quoted maximum. Response id is operation ID; resource_id is rental ID when confirmed.",
    example: {
      service: "facebook",
      duration: "thirtyDay",
      max_price_usd: "20.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/extend",
    description:
      "Manually extend an active rental with a fresh extension quote. No automatic renewal.",
    example: {
      id: "rental-id",
      duration: "thirtyDay",
      max_price_usd: "20.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/status",
    description: "Synchronise status and cancellation eligibility.",
    example: {
      id: "rental-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/cancel",
    description:
      "Attempt refundable rental cancellation; refund depends on confirmed provider outcome.",
    example: {
      id: "rental-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "GET",
    path: "/api/v1/number-rentals/messages",
    description: "SMS messages for your active, unexpired rental.",
    example: {
      id: "rental-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Long-term Rentals",
    method: "POST",
    path: "/api/v1/number-rentals/recover",
    description:
      "Reconcile uncertain operation without creating a new purchase.",
    example: {
      id: "operation-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "GET",
    path: "/api/v1/smm/catalogue",
    description:
      "Filtered social services, categories, types, limits and refill eligibility. Obtain customer total using smm/quote.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "POST",
    path: "/api/v1/smm/quote",
    description: "Server-calculated USD total for service and quantity.",
    example: {
      service: "101",
      quantity: 1000,
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "POST",
    path: "/api/v1/smm/purchase",
    description:
      "Submit a supported social promotion order for a public target URL. resource_id identifies the order.",
    example: {
      service: "101",
      quantity: 1000,
      target: "https://example.com/public-profile",
      max_price_usd: "5.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "GET",
    path: "/api/v1/smm/orders",
    description: "Owned social orders plus pending submissions.",
    example: {
      page: 1,
      per_page: 20,
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "POST",
    path: "/api/v1/smm/status",
    description:
      "Refresh order status, counts and remaining quantity. Cancellation unavailable; partial/cancelled outcomes can require refund review.",
    example: {
      id: "social-order-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "POST",
    path: "/api/v1/smm/refill",
    description:
      "Request eligible refill; duplicate active requests are suppressed.",
    example: {
      id: "social-order-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Boost Socials",
    method: "POST",
    path: "/api/v1/smm/refill-status",
    description:
      "Check the refill ID returned by /smm/refill or the order refill.id field.",
    example: {
      id: "refill-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "GET",
    path: "/api/v1/temp-mail",
    description: "Owned inboxes, current price_usd and duration_hours.",
    example: {},
    idempotent: false,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "POST",
    path: "/api/v1/temp-mail/create",
    description:
      "Generate an inbox. Read inbox_id in result then list inboxes to retrieve address.",
    example: {
      max_price_usd: "1.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "GET",
    path: "/api/v1/temp-mail/messages",
    description:
      "Sender, subject and previews for an active owned inbox. Provider errors differ from empty items.",
    example: {
      inbox_id: "inbox-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "GET",
    path: "/api/v1/temp-mail/message",
    description:
      "Plain-text message; ownership, expiry and membership of selected inbox are verified.",
    example: {
      inbox_id: "inbox-id",
      message_id: "message-id",
    },
    idempotent: false,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "POST",
    path: "/api/v1/temp-mail/renew",
    description:
      "Charge configured price and add 24 hours to existing expiry; renew before expiry.",
    example: {
      id: "inbox-id",
      max_price_usd: "1.00",
    },
    idempotent: true,
    multipart: false,
  },
  {
    group: "Temporary Emails",
    method: "POST",
    path: "/api/v1/temp-mail/delete",
    description: "Remove inbox and revoke access.",
    example: {
      id: "inbox-id",
      confirmed: true,
    },
    idempotent: false,
    multipart: false,
  },
];
const responseExamples: Record<string, Record<string, unknown>> = {
  "GET /api/v1/numbers/services": {
    items: [
      {
        id: "facebook",
        service: "Facebook",
        capability: "sms",
        price_usd: "2.00",
        price_pending: false,
      },
    ],
  },
  "GET /api/v1/prices": {
    currency: "USD",
    state: "live",
    items: [
      {
        id: "facebook",
        service: "facebook",
        stock: 1,
        price_usd: "2.00",
      },
    ],
  },
  "POST /api/v1/numbers/quote": {
    currency: "USD",
    price_usd: "2.00",
    service: "facebook",
    stock: 1,
  },
  "POST /api/v1/rent": {
    id: "order-id",
    product: "usa",
    service: "facebook",
    phone: "+12025550123",
    sms_code: null,
    status: "active",
    price_usd: "2.00",
    currency: "USD",
    expires_at: "2026-10-22T12:15:00Z",
    can_cancel: true,
    refund_usd: null,
    messages: [],
  },
  "POST /api/v1/status": {
    id: "order-id",
    product: "usa",
    service: "facebook",
    phone: "+12025550123",
    sms_code: "001234",
    status: "completed",
    price_usd: "2.00",
    currency: "USD",
    expires_at: "2026-10-22T12:15:00Z",
    can_cancel: false,
    refund_usd: null,
    messages: [
      {
        body: "Your code is 001234",
        created_at: "2026-10-22 12:00:00",
      },
    ],
  },
  "POST /api/v1/cancel": {
    id: "order-id",
    product: "usa",
    service: "facebook",
    phone: "+12025550123",
    sms_code: null,
    status: "cancelled",
    price_usd: "2.00",
    currency: "USD",
    expires_at: "2026-10-22T12:15:00Z",
    can_cancel: false,
    refund_usd: "2.00",
    messages: [],
  },
  "POST /api/v1/finish": {
    id: "order-id",
    product: "usa",
    service: "facebook",
    phone: "+12025550123",
    sms_code: null,
    status: "active",
    price_usd: "2.00",
    currency: "USD",
    expires_at: "2026-10-22T12:15:00Z",
    can_cancel: false,
    refund_usd: null,
    messages: [],
  },
  "GET /api/v1/rentals": {
    items: [
      {
        id: "order-id",
        product: "usa",
        service: "facebook",
        phone: "+12025550123",
        sms_code: "001234",
        status: "completed",
        price_usd: "2.00",
        currency: "USD",
        expires_at: "2026-10-22T12:15:00Z",
        can_cancel: false,
        refund_usd: null,
        messages: [
          {
            body: "Your code is 001234",
            created_at: "2026-10-22 12:00:00",
          },
        ],
      },
    ],
    page: 1,
    per_page: 20,
    total: 1,
  },
  "GET /api/v1/history": {
    items: [
      {
        id: "order-id",
        product: "usa",
        service: "facebook",
        phone: "+12025550123",
        sms_code: "001234",
        status: "completed",
        price_usd: "2.00",
        currency: "USD",
        expires_at: "2026-10-22T12:15:00Z",
        can_cancel: false,
        refund_usd: null,
        messages: [
          {
            body: "Your code is 001234",
            created_at: "2026-10-22 12:00:00",
          },
        ],
      },
    ],
    page: 1,
    per_page: 20,
    total: 1,
  },
  "GET /api/v1/global-numbers/countries": {
    items: [
      {
        id: "england",
        name: "England",
      },
    ],
  },
  "GET /api/v1/global-numbers/services": {
    items: [
      {
        id: "facebook",
        name: "Facebook",
      },
    ],
  },
  "GET /api/v1/global-numbers/prices": {
    items: [
      {
        country: "england",
        country_name: "England",
        country_code: "GB",
        service: "facebook",
        operator: "available-operator",
        stock: 10,
        price_usd: "2.00",
        quote_id: "returned-quote-id",
      },
    ],
  },
  "GET /api/v1/number-rentals/catalogue": {
    items: [
      {
        id: "facebook",
        name: "Facebook",
      },
    ],
    durations: {
      oneDay: "1 day",
      thirtyDay: "30 days",
    },
  },
  "GET /api/v1/number-rentals": {
    items: [
      {
        id: "rental-id",
        service: "facebook",
        phone: "+12025550123",
        duration: "thirtyDay",
        status: "active",
        price_usd: "20.00",
        expires_at: "2026-11-21T12:00:00Z",
        created_at: "2026-10-22T12:00:00Z",
        refundable: false,
        can_extend: true,
      },
    ],
    pending: [],
    page: 1,
    per_page: 10,
    total: 1,
  },
  "POST /api/v1/number-rentals/quote": {
    currency: "USD",
    price_usd: "2.00",
    duration: "thirtyDay",
  },
  "POST /api/v1/number-rentals/purchase": {
    id: "operation-id",
    resource_id: "resource-id",
    status: "completed",
    price_usd: "2.00",
    currency: "USD",
  },
  "POST /api/v1/number-rentals/extend": {
    id: "operation-id",
    resource_id: "resource-id",
    status: "completed",
    price_usd: "2.00",
    currency: "USD",
  },
  "POST /api/v1/number-rentals/status": {
    status: "active",
    message: "Provider status confirmed.",
  },
  "POST /api/v1/number-rentals/cancel": {
    status: "active",
    message: "Provider status confirmed.",
  },
  "GET /api/v1/number-rentals/messages": {
    items: [
      {
        id: "message-id",
        sender: "Example",
        text: "Your code is 001234",
        code: "001234",
        created_at: "2026-10-22T12:00:00Z",
      },
    ],
  },
  "POST /api/v1/number-rentals/recover": {
    id: "operation-id",
    resource_id: "rental-id",
    status: "completed",
    price_usd: "20.00",
    currency: "USD",
  },
  "GET /api/v1/smm/catalogue": {
    items: [
      {
        id: "101",
        name: "Social Likes",
        category: "Social",
        minimum: 100,
        maximum: 10000,
        type: "Default",
        supported: true,
        refill: true,
        cancel: false,
      },
    ],
    state: "live",
    pricing_configured: true,
  },
  "POST /api/v1/smm/quote": {
    currency: "USD",
    price_usd: "2.00",
  },
  "POST /api/v1/smm/purchase": {
    id: "operation-id",
    resource_id: "resource-id",
    status: "completed",
    price_usd: "2.00",
    currency: "USD",
  },
  "GET /api/v1/smm/orders": {
    items: [
      {
        id: "social-order-id",
        service: "101",
        service_name: "Social Likes",
        target: "https://example.com/profile",
        quantity: 1000,
        status: "active",
        price_usd: "2.00",
        start_count: 100,
        remaining: 500,
        refill_supported: true,
        refill: null,
        awaiting_provisioning: false,
        refund_review_required: false,
        created_at: "2026-10-22T12:00:00Z",
        updated_at: "2026-10-22T12:05:00Z",
      },
    ],
    pending: [],
    page: 1,
    per_page: 20,
    total: 1,
  },
  "POST /api/v1/smm/status": {
    id: "social-order-id",
    service: "101",
    service_name: "Social Likes",
    target: "https://example.com/profile",
    quantity: 1000,
    status: "active",
    price_usd: "2.00",
    start_count: 100,
    remaining: 500,
    refill_supported: true,
    refill: null,
    awaiting_provisioning: false,
    refund_review_required: false,
    created_at: "2026-10-22T12:00:00Z",
    updated_at: "2026-10-22T12:05:00Z",
  },
  "POST /api/v1/smm/refill": {
    id: "refill-id",
    status: "pending",
  },
  "POST /api/v1/smm/refill-status": {
    id: "refill-id",
    status: "pending",
  },
  "GET /api/v1/temp-mail": {
    items: [
      {
        id: "inbox-id",
        address: "example@provider-domain.com",
        status: "active",
        price_paid_usd: "1.00",
        created_at: "2026-10-22T12:00:00Z",
        expires_at: "2026-10-23T12:00:00Z",
      },
    ],
    price_usd: "1.00",
    duration_hours: 24,
    configured: true,
    balance_usd: "25.00",
  },
  "POST /api/v1/temp-mail/create": {
    id: "operation-id",
    status: "completed",
    inbox_id: "inbox-id",
    price_usd: "1.00",
    error_code: null,
    message: null,
  },
  "GET /api/v1/temp-mail/messages": {
    items: [
      {
        id: "message-id",
        sender: "sender@example.com",
        subject: "Your message",
        preview: "Your code is 001234",
      },
    ],
  },
  "GET /api/v1/temp-mail/message": {
    id: "message-id",
    sender: "sender@example.com",
    preview: "Your code is 001234",
    subject: "Your message",
    text: "Your code is 001234",
  },
  "POST /api/v1/temp-mail/renew": {
    id: "operation-id",
    status: "completed",
    inbox_id: "inbox-id",
    price_usd: "1.00",
    error_code: null,
    message: null,
  },
  "POST /api/v1/temp-mail/delete": {
    status: "deleted",
    message: "Inbox deleted. Access has been revoked.",
  },
};
export function responseExample(e: Endpoint): Record<string, unknown> | null {
  return responseExamples[e.method + " " + e.path] ?? null;
}
