"use client";

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({score, size = 120}: ScoreRingProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (clampedScore / 100) * circ;
  const color = clampedScore >= 70 ? "#16A34A" : clampedScore >= 40 ? "#D97706" : "#E11D48";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Score: ${clampedScore}/100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E4F3" strokeWidth={8} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        style={{transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)"}}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.24} fontWeight={800} fill={color}>
        {clampedScore}
      </text>
      <text x="50%" y={size * 0.67} dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.1} fill="#9AA0BF">
        /100
      </text>
    </svg>
  );
}
