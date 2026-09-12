type Mood = "idle" | "wave" | "happy" | "surprise" | "cheer";

export function Turtle({ mood = "idle", size = 56 }: { mood?: Mood; size?: number }) {
  const surprised = mood === "surprise";
  const cheerful = mood === "happy" || mood === "cheer";
  return (
    <svg
      className={`turtle turtle-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      {/* ground shadow */}
      <ellipse cx="32" cy="55.5" rx="16" ry="3.6" fill="rgba(44,36,22,0.16)" />
      {/* back flippers */}
      <path d="M16 47c-4.6 2.8-5.4 6.8-1.8 7.6 3 .7 6.8-1.8 8.2-4.6z" fill="#8ED08A" />
      <path d="M48 47c4.6 2.8 5.4 6.8 1.8 7.6-3 .7-6.8-1.8-8.2-4.6z" fill="#8ED08A" />
      {/* front flippers resting on the rim */}
      <path d="M12.6 45.4c-3.6 1.4-4.8 4.2-2.6 5.4 2 1.1 5.4-.6 6.6-3z" fill="#7CC478" />
      <path d="M51.4 45.4c3.6 1.4 4.8 4.2 2.6 5.4-2 1.1-5.4-.6-6.6-3z" fill="#7CC478" />
      {/* shell */}
      <path d="M10 45c0-11.4 9.9-19 22-19s22 7.6 22 19c0 3.6-2.2 5.4-5.4 5.4H15.4C12.2 50.4 10 48.6 10 45z" fill="#6DB86A" />
      {/* scutes */}
      <path d="M32 26.8c-3.2 4.4-4.4 13-2.6 23h5.2c1.8-10 .6-18.6-2.6-23z" fill="#5AA85F" />
      <path d="M27.6 27.6c-6.4 1.2-10.8 6-11.6 12.4l9.6 3.4c-.6-6 .2-11.4 2-15.8z" fill="#5AA85F" />
      <path d="M36.4 27.6c6.4 1.2 10.8 6 11.6 12.4l-9.6 3.4c.6-6-.2-11.4-2-15.8z" fill="#5AA85F" />
      {/* shell rim */}
      <path d="M10 45c0 3.6 2.2 5.4 5.4 5.4h33.2c3.2 0 5.4-1.8 5.4-5.4z" fill="#4E9455" />
      {/* head */}
      <circle cx="32" cy="16.5" r="9.5" fill="#8ED08A" />
      {/* wave flipper sits over the head side */}
      <path
        d="M24.4 13.6c-3-5.4-8.4-6.6-10.2-4.6"
        fill="none"
        stroke="#8ED08A"
        strokeWidth="4"
        strokeLinecap="round"
        className="turtle-hand"
      />
      <circle cx="14.2" cy="9" r="2.6" fill="#8ED08A" className="turtle-hand" />
      {/* cheeks */}
      <ellipse cx="25" cy="19.4" rx="2.3" ry="1.5" fill="#F2A9A0" opacity="0.75" />
      <ellipse cx="39" cy="19.4" rx="2.3" ry="1.5" fill="#F2A9A0" opacity="0.75" />
      {surprised ? (
        <>
          <circle cx="28.5" cy="16" r="2.3" fill="#2C2416" />
          <circle cx="35.5" cy="16" r="2.3" fill="#2C2416" />
          <circle cx="32" cy="20.6" r="1.7" fill="#2C2416" />
        </>
      ) : (
        <>
          <circle cx="28.5" cy="16" r="1.9" fill="#2C2416" />
          <circle cx="35.5" cy="16" r="1.9" fill="#2C2416" />
          <circle cx="29.2" cy="15.3" r="0.7" fill="#FFFDF8" />
          <circle cx="36.2" cy="15.3" r="0.7" fill="#FFFDF8" />
          {cheerful ? (
            <path
              d="M29 18.8c.6 1.9 5.4 1.9 6 0z"
              fill="#2C2416"
              stroke="#2C2416"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M29.4 19.6c1.6 1.5 3.6 1.5 5.2 0"
              fill="none"
              stroke="#2C2416"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
}

export type TurtleMood = Mood;
