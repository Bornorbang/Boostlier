import Image from "next/image";

export function BrandIcon() {
  return (
    <Image
      className="brand-icon"
      src="/Boostlier.png"
      alt=""
      width={35}
      height={35}
      sizes="35px"
    />
  );
}
