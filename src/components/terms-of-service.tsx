import Link from "next/link";

const sections = [
  {
    id: "eligibility",
    title: "Eligibility: adults only",
    paragraphs: [
      "You must be at least 18 years old and legally able to enter a binding contract to register, fund a wallet, place an order or use our API. Do not create an account for a child or allow anyone under 18 to use your account. If you act for a business, you must have authority to bind that business.",
      "Provide accurate account and payment information and keep it up to date. We may request proportionate evidence of age, identity, payment authority or business authority where reasonably necessary to investigate risk or meet legal obligations. We may restrict access while relevant checks are outstanding.",
    ],
  },
  {
    id: "services",
    title: "Our services and your orders",
    paragraphs: [
      "Boostlier offers prepaid digital services, including SMS verification numbers, long-term number rentals, social promotion, temporary email access and advertising. The service description, supported options, price and duration shown when you order form part of your purchase. A service being listed does not guarantee that stock will remain available.",
      "Read the service details before ordering. You are responsible for choosing the correct service, country, duration, quantity and public target link. We may reject an order for unavailable stock, an obvious pricing error, suspected misuse or a legal restriction. If an order is not supplied, we will release reserved funds or provide the remedy required by the applicable service policy and law. New prices apply to new orders; an accepted order is not retrospectively repriced without your agreement.",
    ],
  },
  {
    id: "wallet-funding",
    title: "Wallet funding is normally final; no cash withdrawals",
    paragraphs: [
      "Prices and wallet balances are in US dollars (USD). Your Boostlier wallet is prepaid credit for services on Boostlier. It is not a bank account, does not earn interest and is not offered as a money-transfer or cash-withdrawal facility. Credit cannot be sold or transferred to another account unless we expressly permit it.",
      "Our commercial policy is that authorised wallet top-ups are final. We do not offer discretionary refunds to bank accounts, cards or other payment methods for a change of mind, an accidental overpayment by you, deciding not to use the platform, or dissatisfaction with a service that was supplied as described. Fund only the amount you intend to spend. Your bank or payment provider may apply its own currency-conversion charges.",
      "This policy is subject to mandatory law. It does not remove a refund or cancellation right that applies to unused prepaid funds, an unauthorised or duplicate payment, our failure to supply a service, or another legally protected circumstance. Where the law requires a payment-method refund, we will follow the legally required method and timing rather than insist on wallet credit. We will not treat the words 'funding is final' as a waiver of those rights.",
      "A pending or failed payment does not create spendable credit. We credit verified successful payments only once. We may investigate payment discrepancies and correct a proven duplicate credit or accounting error, with an explanation. Do not spend credit you know was issued in error.",
    ],
  },
  {
    id: "service-refunds",
    title: "Service cancellations and wallet refunds",
    paragraphs: [
      "A wallet top-up and a service order are separate transactions. Our ordinary service-refund policy credits eligible refunds to your Boostlier wallet; it does not create a right to cash out the wallet. Mandatory payment-method refunds remain available where the law requires them.",
      "For USA and Global verification numbers, a confirmed eligible cancellation or no-SMS expiry returns the original amount charged to the wallet once. Cancellation depends on the order state and service rules. A delivered code can make an order ineligible. Follow the cancellation action in the dashboard or API; deleting an SMS or choosing not to use a code does not establish non-delivery.",
      "An unavailable status page, a provider outage or an unclear response does not by itself prove that an order failed. An uncertain order may remain pending while it is reconciled. We will investigate rather than charge a replacement automatically. This does not allow us to retain funds indefinitely or avoid remedies for an order we fail to supply.",
      "Long-term cancellations, extensions and refunds follow the eligibility shown for that rental. Social promotion and advertising have their own conditions below. Temporary email generation that definitively fails releases reserved funds; deleting an activated inbox or allowing it to expire does not ordinarily earn a discretionary refund.",
    ],
  },
  {
    id: "consumer-cancellation",
    title: "Immediate service and statutory cancellation rights",
    paragraphs: [
      "Many orders are intended to start immediately. Where consumer cancellation rules apply, we will obtain any legally required express request or consent before starting during a cancellation period, and any acknowledgement required for a right to end. Merely creating an account, funding a wallet or reading these terms does not waive a statutory cancellation right.",
      "Starting a service does not automatically remove every cancellation right. A consumer may have a 14-day cancellation period for a distance service contract, subject to the rules and exceptions that apply to the particular contract. Where lawful, a charge for work already supplied following an express request must be proportionate. Any right that ends only after full performance or valid digital-content consent ends only when the applicable legal conditions are met. Statutory remedies for faulty or misdescribed services continue to apply.",
    ],
  },
  {
    id: "number-email-access",
    title: "Number rentals and temporary email limitations",
    paragraphs: [
      "Temporary numbers and email addresses provide limited access for the purchased service and duration. They do not give permanent ownership of a phone number, email domain or third-party account. Numbers and addresses may later be recycled. Do not use them as the only recovery method for important accounts, or for banking, emergency communications, confidential correspondence or services requiring permanent control of an address or number.",
      "We do not guarantee that a third-party website will accept a number or email address, that a sender will deliver a message, or that an external account will remain accessible. These limitations do not excuse us from supplying the access we agreed to provide. Keep your own copies of information you need: a 24-hour inbox access period does not mean the upstream provider retains every message for 24 hours.",
      "Long-term rental extensions are manual, subject to inventory, provider support and the quoted renewal price. Renew before expiry if you want to keep access; an extension is not guaranteed until confirmed. Expired or deleted access may be unrecoverable. Cancellation and expiry can revoke message access.",
    ],
  },
  {
    id: "social-promotion",
    title: "Boost Account and third-party platforms",
    paragraphs: [
      "Social promotion services vary in delivery speed, retention, refill eligibility and supported targets. No particular engagement, income, ranking, permanent follower count or platform outcome is guaranteed. Counts can change after delivery. A refill is available only when the chosen service offers it and its conditions are met.",
      "Check the public target URL and quantity before submitting. Current social promotion orders cannot be cancelled once submitted. An incorrect target, a private or deleted page, or a change to your username can prevent delivery. We will assess any requested remedy against the service description, evidence and applicable rights; a provider's decision does not override your mandatory rights against us.",
      "Boostlier is independent of the platforms named in its catalogue. A service listing is not their endorsement or permission. You are responsible for understanding and complying with their rules, and for any account restrictions resulting from your own use. Do not give us or other users a platform password or access credentials through an order target field.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Prohibited use",
    paragraphs: [
      "Do not use Boostlier for fraud, scams, impersonation, identity theft, phishing, account takeover, harassment, threats, unlawful discrimination, exploitation, sexual content involving minors, spam, malware, payment abuse, infringement of intellectual-property rights, or other unlawful activity. Do not use our services to defeat a lawful identity or age check, evade a legal restriction or access an account without its owner's permission.",
      "Do not exploit software or pricing errors, manipulate rewards or referrals, create accounts to evade a restriction, interfere with another customer's orders, scrape private data, attack our systems, bypass rate limits or resell access using misleading claims. Tell us about a security issue without using it to access other people's information. You must have the rights and permissions needed for the links, content and instructions you submit.",
    ],
  },
  {
    id: "account-security-api",
    title: "Account security and API use",
    paragraphs: [
      "Protect your login, email account and API keys. Keep API keys on your backend, rotate a key if it is exposed and report suspected unauthorised use promptly. You are responsible for requests you authorise and for taking reasonable steps to secure your own systems; this does not make you automatically liable for losses caused by our security failures.",
      "API keys act on your Boostlier account and its wallet. If you build another website using our API, you are responsible for your own customers, authentication, pricing, disclosures, support and applicable legal obligations. Do not imply that Boostlier operates or guarantees your business. Use the documented idempotency and status mechanisms to avoid duplicate orders, and respect published rate limits.",
    ],
  },
  {
    id: "suspension",
    title: "Suspension, restrictions and account closure",
    paragraphs: [
      "We may restrict transactions, revoke API keys, remove content, suspend an account or close an account where we reasonably believe there is a serious or repeated breach, an underage user, fraud, an unauthorised payment, a security threat, unlawful activity, a legal requirement, or a material risk to other customers or the platform. We may act immediately and without advance notice where necessary to contain that risk, preserve evidence or comply with law.",
      "Where practicable and lawful, we will explain the restriction, give an opportunity to correct a remediable issue and provide a way to request review. We may withhold information where disclosure would compromise an investigation or breach a legal obligation. For an otherwise compliant account that we close for our own business reasons, we will give reasonable notice where practicable and address outstanding service and prepaid-fund obligations lawfully.",
      "Suspension or closure does not automatically forfeit every unused balance or cancel a refund already owed. We may temporarily hold the funds reasonably connected with a payment or fraud investigation, and recover evidenced amounts legally owed to us, without imposing an arbitrary penalty or double recovery. Remaining funds and incomplete orders will be assessed under these terms and applicable law. Do not open another account to bypass a restriction; use the review process.",
    ],
  },
  {
    id: "ads-rewards",
    title: "Advertising, rewards and promotional credit",
    paragraphs: [
      "Paid banners are governed by the Ads Terms linked below, including content restrictions, removal rights, placement duration and the absence of guaranteed traffic or sales. Those terms govern advertising-specific matters. Publication is not our endorsement of an advertiser or its website.",
      "Rewards and referral benefits require the eligibility shown in the programme. We may correct errors, reverse benefits obtained through fraud or invalid qualifying transactions, and change or end a programme prospectively with appropriate notice. Changes do not arbitrarily erase valid accrued rights. Unclaimed promotional benefits are not cash deposits and cannot be withdrawn to a bank account unless required by law.",
    ],
  },
  {
    id: "payments-disputes",
    title: "Payment disputes and complaints",
    paragraphs: [
      "Contact Support with the relevant order or payment reference so we can investigate a mistake, non-delivery or disputed charge. Never send a password, API key or full payment-card details. We may ask for reasonable supporting evidence and will assess the information available. A good-faith complaint does not itself justify an account penalty.",
      "Do not knowingly make a false payment dispute or seek double recovery. A dispute may require us to restrict the affected transaction while the payment provider investigates. These terms do not require you to surrender a legitimate chargeback, statutory remedy or access to a court, regulator or other legally available complaint process. Any amount already returned for the same loss will be taken into account so it is not paid twice.",
    ],
  },
  {
    id: "liability",
    title: "Our responsibility and limits of liability",
    paragraphs: [
      "We remain responsible for performing our contractual obligations with reasonable care and skill and for providing the remedies the law requires. We cannot promise uninterrupted third-party networks, permanent inventory or the actions of independent platforms. We will take reasonable steps to address disruption. A third-party failure does not automatically remove our own obligations to you.",
      "For business customers only, and to the extent lawful, we exclude indirect or consequential loss and lost profits, revenue, anticipated savings or business opportunities. Our aggregate liability for the affected services is limited to the fees you paid for those services in the 12 months before the event giving rise to the claim. Advertising-specific business liability provisions are in the Ads Terms.",
      "For business customers only, you must reimburse reasonable, evidenced third-party claims and direct costs caused by your unlawful content, infringement or material breach, excluding losses caused by our own fault. We will notify you and allow reasonable participation in the response. This is not an unlimited consumer indemnity.",
      "Nothing in these terms excludes or limits liability for fraud, fraudulent misrepresentation, death or personal injury caused by negligence, or any other liability or consumer right that cannot lawfully be excluded or restricted. Business-only limitations do not restrict a consumer's mandatory remedies.",
    ],
  },
  {
    id: "changes-law-contact",
    title: "Changes, applicable rights and contact",
    paragraphs: [
      "The terms and service description applicable when an order is accepted govern that order. We may update these terms for future use, explain material changes and give reasonable notice where required. We will not retrospectively remove mandatory rights or impose a new charge on an accepted order without a lawful basis. You may stop placing new orders if you do not accept a future change.",
      "Mandatory laws and consumer protections applicable to your contract continue to apply. Nothing here requires a consumer to give up a court or legal protection available in their home jurisdiction. If a provision is unenforceable, the remaining provisions continue only to the extent lawful; our not enforcing a term immediately does not waive it permanently.",
      "Contact Boostlier LTD at support@boostlier.com or use the Support page for a service or payment complaint, an account-restriction review, or a question about these terms. Our Privacy Policy explains how account, order and security information is handled. These terms do not grant unlimited rights to use or disclose your personal data.",
    ],
  },
];

export function TermsOfService() {
  return (
    <div className="terms-of-service">
      <p className="muted">Version 22 October 2026</p>
      <p>
        Boostlier is operated by Boostlier LTD. These terms cover your use of
        Boostlier and the services you purchase. Read the applicable service
        description before placing an order.
      </p>
      <p>
        Contact:{" "}
        <a href="mailto:support@boostlier.com">support@boostlier.com</a>
      </p>
      <ul>
        <li>
          <strong>18+ only.</strong> You must be an adult to use Boostlier.
        </li>
        <li>
          <strong>Fund only what you need.</strong> Top-ups are normally final,
          and the wallet has no discretionary cash-withdrawal facility.
        </li>
        <li>
          <strong>
            Eligible service refunds normally return to the wallet.
          </strong>{" "}
          Mandatory legal remedies are preserved.
        </li>
        <li>
          <strong>Misuse can lead to immediate suspension.</strong> Restrictions
          and retained funds must have a lawful, proportionate basis.
        </li>
      </ul>
      {sections.map((section, index) => (
        <section
          id={section.id}
          key={section.id}
          style={{ scrollMarginTop: 100 }}
        >
          <h2>
            {index + 1}. {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p>
        <Link href="/dashboard/support">Contact Support</Link>
        {" · "}
        <Link href="/legal/privacy">Privacy Policy</Link>
        {" · "}
        <Link href="/ads#ads-terms">Ads Terms</Link>
      </p>
    </div>
  );
}
