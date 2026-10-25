import Link from "next/link";
import { PublicShell } from "@/components/public";
export default function NotFound() {
  return (
    <PublicShell>
      <div className="not-found">
        <div>
          <span className="eyebrow">A SMALL DETOUR</span>
          <h1>Page not found.</h1>
          <p>That address does not lead to a Boostlier page.</p>
          <Link className="button" href="/">
            Back to home →
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
