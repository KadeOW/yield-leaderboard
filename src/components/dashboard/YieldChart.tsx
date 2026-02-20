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
  compact?: boolean;
}

export function YieldChart({ data, compact }: Props) {
  const height = compact ? 110 : 240;

  return (
    <div className={compact ? 'card !px-3 !py-2' : 'card'}>
      {!compact && <h3 className="font-semibold mb-4">Portfolio Value Over Time</h3>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: compact ? 0 : 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            tick={{ fontSize: compact ? 10 : 12 }}
            tickLine={false}
            interval={compact ? 6 : 'preserveStartEnd'}
          />
          <YAxis
            stroke="#6b7280"
            tick={{ fontSize: compact ? 10 : 12 }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={compact ? 36 : 48}
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
            strokeWidth={compact ? 1.5 : 2}
            dot={false}
            activeDot={{ r: 3, fill: '#00FF94' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
