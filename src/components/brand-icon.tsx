import Image from "next/image";
import { homepageDescription } from "@/lib/public-seo";

export function BrandIcon() {
  return (
    <Image
      className="brand-icon"
      src="/Boostlier.png"
      alt={homepageDescription}
      width={35}
      height={35}
      sizes="35px"
    />
  );
}
