"use client";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DOMAIN_LABELS } from "@/types/assessment";
import { cn } from "@/lib/utils";

interface Props {
  dimensionScores: Record<string, number>;
  className?: string;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; score: number } }>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-clinical-border rounded-lg px-3 py-2 shadow-card text-sm">
      <p className="font-semibold text-clinical-navy">{d.label}</p>
      <p className="text-clinical-jade font-medium">{d.score.toFixed(1)} / 10</p>
    </div>
  );
};

export function RadarHealth({ dimensionScores, className }: Props) {
  const data = Object.entries(dimensionScores).map(([dim, score]) => ({
    dimension: DOMAIN_LABELS[dim] ?? dim,
    label:     DOMAIN_LABELS[dim] ?? dim,
    score,
    fullMark:  10,
  }));

  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
          <PolarGrid
            stroke="#E2E8F0"
            strokeWidth={1}
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{
              fontSize: 10,
              fill: "#64748B",
              fontWeight: 500,
            }}
            tickLine={false}
          />
          <Radar
            name="Health Domains"
            dataKey="score"
            stroke="#0D7A5F"
            fill="#0D7A5F"
            fillOpacity={0.12}
            strokeWidth={1.5}
            dot={{ r: 3, fill: "#0D7A5F", strokeWidth: 0 }}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 px-2">
        {data.map((d) => {
          const pct  = Math.round((d.score / 10) * 100);
          const color =
            d.score >= 8 ? "#0D7A5F" : d.score >= 6 ? "#C8A96E" : "#9B2335";
          return (
            <div key={d.dimension} className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span className="text-[10px] text-clinical-muted truncate">
                {d.dimension}
              </span>
              <span
                className="text-[10px] font-semibold ml-auto shrink-0"
                style={{ color }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
