export function FlagIcon({
  country,
  code,
}: {
  country: string;
  code?: string | null;
}) {
  if (country === "england") country = "united-kingdom";
  if (
    code &&
    /^[A-Z]{2}$/.test(code) &&
    !["usa", "united-kingdom", "germany", "france", "netherlands"].includes(
      country,
    )
  )
    return (
      <span
        className="country-flag"
        role="img"
        aria-label={`${country} flag`}
        title={country}
        style={{
          display: "inline-block",
          width: 24,
          lineHeight: "16px",
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {Array.from(code)
          .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
          .join("")}
      </span>
    );
  return (
    <svg
      aria-label={
        country === "usa"
          ? "United States flag"
          : country === "united-kingdom"
            ? "United Kingdom flag"
            : country + " flag"
      }
      role="img"
      width="24"
      height="16"
      viewBox="0 0 60 40"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        borderRadius: 3,
        flexShrink: 0,
      }}
    >
      {country === "usa" ? (
        <>
          <rect width="60" height="40" fill="#fff" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} y={i * 6} width="60" height="3" fill="#b32b3c" />
          ))}
          <rect width="25" height="22" fill="#294679" />
          <text x="3" y="15" fontSize="15" fill="white">
            ✦✦
          </text>
        </>
      ) : country === "united-kingdom" ? (
        <>
          <rect width="60" height="40" fill="#254678" />
          <path d="m0 0 60 40m0-40L0 40" stroke="white" strokeWidth="9" />
          <path d="m0 0 60 40m0-40L0 40" stroke="#c63642" strokeWidth="3" />
          <path d="M30 0v40M0 20h60" stroke="white" strokeWidth="14" />
          <path d="M30 0v40M0 20h60" stroke="#c63642" strokeWidth="8" />
        </>
      ) : country === "germany" ? (
        <>
          <rect width="60" height="14" fill="#202020" />
          <rect y="14" width="60" height="13" fill="#c93636" />
          <rect y="27" width="60" height="13" fill="#e6bf3f" />
        </>
      ) : country === "france" ? (
        <>
          <rect width="20" height="40" fill="#294c98" />
          <rect x="20" width="20" height="40" fill="white" />
          <rect x="40" width="20" height="40" fill="#d3404c" />
        </>
      ) : country === "netherlands" ? (
        <>
          <rect width="60" height="14" fill="#bd3a46" />
          <rect y="14" width="60" height="13" fill="white" />
          <rect y="27" width="60" height="13" fill="#335c9c" />
        </>
      ) : (
        <>
          <rect width="60" height="40" fill="#e2ebdf" />
          <circle
            cx="30"
            cy="20"
            r="12"
            fill="none"
            stroke="#62875d"
            strokeWidth="2"
          />
          <path d="M18 20h24M30 8v24" stroke="#62875d" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
