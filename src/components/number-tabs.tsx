import Link from "next/link";

export function NumberTabs({
  active,
}: {
  active: "numbers" | "global" | "rentals" | "history";
}) {
  return (
    <nav className="tabs number-tabs" aria-label="Number services">
      {(
        [
          ["numbers", "USA Numbers"],
          ["global", "Global Numbers"],
          ["rentals", "Long-term Rentals"],
          ["history", "History"],
        ] as const
      ).map(([page, label]) => (
        <Link
          key={page}
          href={`/dashboard/${page}`}
          className={active === page ? "active" : undefined}
          aria-current={active === page ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
