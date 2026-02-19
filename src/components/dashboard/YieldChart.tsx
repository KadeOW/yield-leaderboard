'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatUSD } from '@/lib/utils';

interface DataPoint {
  date: string;
  value: number;
}

interface Props {
  data: DataPoint[];
}

export function YieldChart({ data }: Props) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-4">Portfolio Value Over Time</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 12 }} />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(value: number) => [formatUSD(value), 'Portfolio Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#00FF94"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#00FF94' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
