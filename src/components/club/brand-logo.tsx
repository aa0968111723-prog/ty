const MARK_48 = "/brand/tkuzen-turtle-3d-icon-48-v2.png";
const MARK_180 = "/brand/tkuzen-turtle-3d-icon-180-v2.png";
const MARK_192 = "/brand/tkuzen-turtle-3d-icon-192-v2.png";

/** Header/mark uses the small icon set, not the 798KB master PNG. */
export function BrandLogo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={MARK_180}
      srcSet={`${MARK_48} 48w, ${MARK_180} 180w, ${MARK_192} 192w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      decoding="async"
      fetchPriority="high"
    />
  );
}
