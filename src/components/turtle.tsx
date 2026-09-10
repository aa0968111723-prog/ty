type Mood = "idle" | "wave" | "happy" | "surprise" | "cheer";

export function Turtle({ mood = "idle", size = 56 }: { mood?: Mood; size?: number }) {
  return (
    <svg
      className={`turtle turtle-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <ellipse cx="32" cy="54" rx="14" ry="4" fill="rgba(44,36,22,0.16)" />
      <path d="M18 34c0-12 8-20 14-20s14 8 14 20c2 8-4 16-14 16s-16-8-14-16z" fill="#6DB86A" />
      <path d="M24 30c2-8 6-12 8-12s6 4 8 12c1 6-2 12-8 12s-9-6-8-12z" fill="#3F7A4A" />
      <circle cx="32" cy="22" r="8" fill="#8ED08A" />
      <circle cx="29" cy="21" r="1.6" fill="#2C2416" />
      <circle cx="35" cy="21" r="1.6" fill="#2C2416" />
      <path d="M29 25c1.4 1.4 4.6 1.4 6 0" fill="none" stroke="#2C2416" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M24 18c-4-6-9-6-10-4" fill="none" stroke="#6DB86A" strokeWidth="3" strokeLinecap="round" className="turtle-hand" />
      <path d="M40 18c4-6 9-6 10-4" fill="none" stroke="#6DB86A" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type TurtleMood = Mood;
