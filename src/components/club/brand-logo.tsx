import brand from "@/lib/og/site.json";

/** All in-app brand marks use the same replaceable 3D turtle master. */
export function BrandLogo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={brand.logo}
      width={size}
      height={size}
      alt=""
    />
  );
}
