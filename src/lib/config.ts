export const site = {
  name: "Boostlier",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  description:
    "Boost your social presence with Boostlier's SMM panel for Instagram followers, TikTok likes and YouTube views. Get USA and Global temporary numbers for SMS verification too.",
};
export const publicLinks = [
  ["Home", "/"],
  ["Boost Socials", "/social-boosting"],
  ["Numbers", "/numbers"],
  ["Pricing", "/pricing"],
  ["Temporary Email", "/temporary-email"],
  ["API", "/developers"],
];
export const dashboardLinks = [
  ["Boost Socials", "/boost-account/new-order", "boost"],
  ["USA Numbers", "/dashboard/numbers", "usa"],
  ["Global Numbers", "/dashboard/global", "globe"],
  ["Long-term Rentals", "/dashboard/rentals", "clock"],
  ["Temporary Emails", "/dashboard/temp-mail", "mail"],
  ["Ads", "/dashboard/ads", "ads"],
  ["Wallet", "/dashboard/wallet", "wallet"],
  ["Rewards", "/dashboard/rewards", "gift"],
  ["API", "/dashboard/api", "code"],
  ["Contact support", "/dashboard/support", "help"],
];
export const faqs = [
  [
    "What can I do with Boostlier?",
    "Promote social accounts, get USA or Global SMS numbers, rent a number for longer, or generate a temporary email.",
  ],
  [
    "How does Boost Socials work?",
    "Choose a service, enter your public link and quantity, then place and track your order from the dashboard.",
  ],
  [
    "What is a temporary phone number?",
    "A number with limited-time access to receive SMS for your chosen service.",
  ],
  [
    "Can I pay in US dollars?",
    "Yes. One prepaid USD wallet works across Boostlier services.",
  ],
  [
    "Which countries are available?",
    "Choose USA Numbers or select a country in Global Numbers. Availability depends on the service and current stock.",
  ],
  [
    "Will every platform accept my number?",
    "Acceptance varies by platform and service and is not guaranteed.",
  ],
  [
    "What if I do not receive a code?",
    "Use Cancel when available and try another number. Eligible cancellations and no-SMS expiries are refunded to your wallet.",
  ],
  [
    "Can I cancel a Boost Socials order?",
    "Boost Socials orders cannot currently be cancelled. Check your target link, service and quantity before ordering.",
  ],
  [
    "Can I keep a number for account recovery?",
    "Use a permanent recovery method you control. Temporary numbers expire and may be assigned to someone else.",
  ],
];
export const serviceGuides: Record<
  string,
  {
    title: string;
    intro: string;
    limitation: string;
    steps: string[];
    questions: string[][];
  }
> = {
  whatsapp: {
    title: "WhatsApp verification numbers",
    intro:
      "Receive a WhatsApp SMS verification code using a supported rented number while keeping your personal number separate.",
    limitation:
      "WhatsApp may reject rented numbers or require additional verification. A later registration by another number holder can affect your access. Enable two-step verification and keep a permanent recovery method.",
    steps: [
      "Choose WhatsApp in the USA catalogue and confirm availability.",
      "Rent the number before requesting a WhatsApp SMS.",
      "Enter the complete international number in WhatsApp.",
      "Copy the code from your active rental before it expires.",
    ],
    questions: [
      [
        "Does this include WhatsApp calling?",
        "This product receives supported SMS only. Voice calls and WhatsApp acceptance are not guaranteed.",
      ],
      [
        "Can I move an existing account?",
        "Follow WhatsApp’s own change-number process and consider how losing access to the temporary number affects recovery.",
      ],
    ],
  },
  telegram: {
    title: "Telegram verification numbers",
    intro:
      "Rent a supported number to receive a Telegram SMS when Telegram offers SMS verification for your sign-in.",
    limitation:
      "Telegram often sends sign-in codes to an existing Telegram session first. An in-app code is not an SMS and will not appear in your rental inbox. Telegram decides when SMS is available.",
    steps: [
      "Check Telegram offers SMS for your sign-in.",
      "Choose Telegram in the USA catalogue and rent an available number.",
      "Request SMS in Telegram when that option is offered.",
      "Read the SMS in your rental and set up a permanent recovery method.",
    ],
    questions: [
      [
        "Why is there no SMS?",
        "Telegram may have sent the code to another logged-in session. Check the in-app instructions; a rental cannot force Telegram to use SMS.",
      ],
      [
        "Is a rented number safe for permanent recovery?",
        "No. Temporary access ends, and the number may later be assigned to someone else. Use two-step verification and a recovery email.",
      ],
    ],
  },
  google: {
    title: "Google verification numbers",
    intro:
      "Receive a Google SMS verification code where the service permits a rented number for your particular verification step.",
    limitation:
      "Google can limit the number of accounts verified with a phone number and may decline rented or previously used numbers. SMS verification does not guarantee account creation or recovery.",
    steps: [
      "Check which Google verification step you need to complete.",
      "Select Google in the USA catalogue and confirm the quote.",
      "Request the SMS only after your rental is active.",
      "Enter the code and configure a recovery method you control.",
    ],
    questions: [
      [
        "Does this guarantee a new Google account?",
        "No. Google applies its own number eligibility, usage limits and risk checks.",
      ],
      [
        "Can I use it as my recovery phone?",
        "Temporary access is not suitable for long-term recovery. Add a permanent recovery email, passkey or another supported method.",
      ],
    ],
  },
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
