// The recurring signature: a branching pattern that reads simultaneously as mangrove prop
// roots and as a tidal creek delta seen from above — the same fractal branching shape shows up
// in both, which is exactly the overlap this product lives in. Hand-authored paths, not a
// generated fractal, so the composition stays art-directed rather than noisy.

type RootMotifProps = {
  className?: string;
  strokeColor?: string;
  animate?: boolean;
};

const BRANCHES: { d: string; width: number; opacity: number; length: number }[] = [
  { d: "M 400 620 C 400 520 380 460 400 380 C 415 320 395 260 400 190", width: 3.5, opacity: 0.9, length: 480 },
  { d: "M 400 480 C 340 460 300 430 240 420 C 190 412 150 390 100 395", width: 2.4, opacity: 0.75, length: 340 },
  { d: "M 240 420 C 210 390 200 350 170 320", width: 1.6, opacity: 0.6, length: 120 },
  { d: "M 240 420 C 220 460 230 500 200 540", width: 1.6, opacity: 0.6, length: 130 },
  { d: "M 400 480 C 460 455 500 425 560 412 C 610 401 650 378 700 380", width: 2.4, opacity: 0.75, length: 340 },
  { d: "M 560 412 C 590 380 600 340 630 308", width: 1.6, opacity: 0.6, length: 120 },
  { d: "M 560 412 C 580 452 570 495 600 532", width: 1.6, opacity: 0.6, length: 130 },
  { d: "M 400 350 C 355 335 330 305 285 292", width: 1.8, opacity: 0.65, length: 160 },
  { d: "M 285 292 C 265 268 260 240 240 216", width: 1.1, opacity: 0.5, length: 80 },
  { d: "M 400 350 C 445 335 470 305 515 292", width: 1.8, opacity: 0.65, length: 160 },
  { d: "M 515 292 C 535 268 540 240 560 216", width: 1.1, opacity: 0.5, length: 80 },
  { d: "M 400 260 C 385 230 388 200 375 168", width: 1.3, opacity: 0.55, length: 110 },
  { d: "M 400 260 C 415 230 412 200 425 168", width: 1.3, opacity: 0.55, length: 110 },
];

export function RootMotif({ className, strokeColor = "currentColor", animate = false }: RootMotifProps) {
  return (
    <svg
      viewBox="0 0 800 640"
      fill="none"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      {BRANCHES.map((branch, index) => (
        <path
          key={index}
          d={branch.d}
          stroke={strokeColor}
          strokeWidth={branch.width}
          strokeLinecap="round"
          opacity={branch.opacity}
          style={
            animate
              ? {
                  strokeDasharray: branch.length,
                  strokeDashoffset: branch.length,
                  animation: `grow-root 1.6s cubic-bezier(0.22,1,0.36,1) forwards`,
                  animationDelay: `${index * 0.05}s`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}

/** Small mark used in the nav — a single-branch simplification of the full motif. */
export function RootMark({ className, strokeColor = "currentColor" }: { className?: string; strokeColor?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 37 C20 29 15 26 15 19 C15 13 20 11 20 4"
        stroke={strokeColor}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path d="M20 27 C14 25 11 21 6 20" stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
      <path d="M20 27 C26 25 29 21 34 20" stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" opacity={0.8} />
      <path d="M20 16 C16 14 14 11 10 10" stroke={strokeColor} strokeWidth={1.3} strokeLinecap="round" opacity={0.65} />
      <path d="M20 16 C24 14 26 11 30 10" stroke={strokeColor} strokeWidth={1.3} strokeLinecap="round" opacity={0.65} />
    </svg>
  );
}
