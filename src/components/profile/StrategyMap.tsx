'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Position } from '@/types';
import { formatUSD } from '@/lib/utils';

interface Props {
  positions: Position[];
}

const COLORS = ['#00FF94', '#3B82F6', '#A78BFA', '#F59E0B', '#EC4899', '#10B981'];

export function StrategyMap({ positions }: Props) {
  const data = positions.map((p) => ({
    name: `${p.protocol} (${p.asset})`,
    value: p.depositedUSD,
  }));

  return (
    <div className="card">
      <h3 className="font-semibold mb-4">Strategy Allocation</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
            formatter={(value: number) => [formatUSD(value), 'Deposited']}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
