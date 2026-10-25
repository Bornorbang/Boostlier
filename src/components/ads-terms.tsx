import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
const sections = [
  [
    "Your placement",
    "Your banner, title and website link appear on Community ads for one calendar month, unless removed under these terms. The price shown before purchase is charged to your wallet. There is no automatic renewal or guaranteed position, reach, clicks or sales.",
  ],
  [
    "Content rules",
    "No explicit or adult content, exploitation, hate, threats, illegal goods, scams, phishing, malware, impersonation, infringement or misleading claims. These rules also apply to linked websites. Regulated or age-restricted offers need our written approval and evidence of compliance.",
  ],
  [
    "Your responsibilities",
    "You must be 18 or older and authorised to advertise. You are responsible for your content, claims, offers, permissions and destination website, including changes after publication. Follow applicable law and advertising standards. Publication does not mean Boostlier endorses your business.",
  ],
  [
    "Review and removal",
    "We may review, reject, hide, suspend or remove ads at any time where appropriate, including for suspected breaches, complaints, fraud, security risks, infringement or legal requirements. We may request corrections or evidence and restrict repeat offenders. Contact support to request a review.",
  ],
  [
    "Payments and refunds",
    "We do not offer discretionary refunds for a change of mind, poor results, your mistakes, early deletion or removal caused by your breach, to the extent lawful. Deleting an ad does not restore wallet credit. Refunds, cancellation rights and remedies required by law remain available, including where the agreed service is not supplied.",
  ],
  [
    "Immediate publication",
    "Publishing confirms your agreement to these Ads Terms and requests that the service starts immediately. Starting the service does not automatically waive statutory cancellation or refund rights; any loss of those rights is subject to the legal requirements.",
  ],
  [
    "Content rights",
    "You keep ownership of your content and give Boostlier permission to host, resize and display it to deliver and moderate your placement. You must hold the necessary rights. You are responsible for dealings through your website. Limited records may be retained for complaints, security, accounting and legal obligations under our Privacy Policy.",
  ],
  [
    "Liability and your rights",
    "For business advertisers, liability relating to a placement is limited to its fee, and indirect losses and lost profits are excluded, to the extent lawful. You are responsible for reasonable, evidenced third-party costs caused by your unlawful content or infringement, excluding our own fault. Nothing excludes fraud, death or injury caused by negligence, or liability and consumer rights that cannot lawfully be excluded. English law applies subject to mandatory protections and courts available in your home jurisdiction.",
  ],
  [
    "Changes and contact",
    "The version accepted at purchase applies to that placement. Changes apply to future purchases. These terms supplement our Terms of service and Privacy Policy. For complaints, payment issues or ad reviews, email support@boostlier.com with the ad title and relevant details.",
  ],
];
export function AdsTerms() {
  return (
    <>
      <div className="ads-policy-intro">
        <div>
          <span className="public-kicker">COMMUNITY ADS</span>
          <h2>A place for your business.</h2>
          <p>Publish a banner for one month. Manage it from your dashboard.</p>
        </div>
        <Link className="button" href="/dashboard/ads">
          Create an ad
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <article id="ads-terms" className="policy-document ads-policy">
        <div className="policy-heading">
          <h2>Ads terms</h2>
          <span>Updated 24 October 2026</span>
        </div>
        <p className="policy-lead">
          These terms apply when you publish a paid banner on Boostlier.
        </p>
        {sections.map(([title, text], i) => (
          <section key={title}>
            <span className="policy-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </section>
        ))}
        <p className="policy-contact">
          Questions?{" "}
          <a href="mailto:support@boostlier.com">support@boostlier.com</a>
        </p>
      </article>
    </>
  );
}
