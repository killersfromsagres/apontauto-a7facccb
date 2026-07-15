import { lazy, Suspense } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const data = [
  { week: "S1", programadas: 120, concluidas: 108 },
  { week: "S2", programadas: 135, concluidas: 121 },
  { week: "S3", programadas: 128, concluidas: 119 },
  { week: "S4", programadas: 142, concluidas: 133 },
  { week: "S5", programadas: 138, concluidas: 129 },
  { week: "S6", programadas: 151, concluidas: 145 },
  { week: "S7", programadas: 147, concluidas: 140 },
];

export default function ProductivityChart() {
  return (
    <ResponsiveContainer>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="gConc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.696 0.17 162.48)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="oklch(0.696 0.17 162.48)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gProg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.62 0.19 256)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="oklch(0.62 0.19 256)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="programadas"
          stroke="oklch(0.62 0.19 256)"
          fill="url(#gProg)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="concluidas"
          stroke="oklch(0.696 0.17 162.48)"
          fill="url(#gConc)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export { lazy, Suspense };
