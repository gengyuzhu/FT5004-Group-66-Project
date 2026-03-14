import Link from "next/link";

import { AppTopbar } from "@/components/app-topbar";

export default function NotFound() {
  return (
    <main className="detail-shell not-found-shell">
      <AppTopbar backHref="/" backLabel="Back to dashboard" />
      <section className="detail-card not-found-card">
        <p className="eyebrow">Not Found</p>
        <h1>This campaign page does not exist.</h1>
        <p className="hero-text">
          The route may be invalid, or the selected campaign has not been deployed on the current
          network yet. Return to the dashboard to browse the live campaign directory.
        </p>
        <Link className="button" href="/">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
