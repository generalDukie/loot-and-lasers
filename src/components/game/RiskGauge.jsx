import React from "react";
import { Star } from "lucide-react";

const RISK_COLORS = ["#22C55E", "#84CC16", "#F59E0B", "#F97316", "#EF4444"];

export function riskColor(risk) {
  return RISK_COLORS[Math.max(0, Math.min(4, (risk || 1) - 1))];
}

export default function RiskGauge({ risk = 1, size = 14 }) {
  const color = riskColor(risk);
  return (
    <span className="inline-flex items-center gap-0.5" title={`Risk: ${risk}/5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          width={size}
          height={size}
          className={s <= risk ? "" : "opacity-20"}
          style={{ color }}
          fill={s <= risk ? color : "none"}
          strokeWidth={s <= risk ? 0 : 2}
        />
      ))}
    </span>
  );
}