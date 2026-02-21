'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import type { NFTCollection } from '@/app/api/nfts/collections/route';
import { type Currency, fmtETH, fmtNFTUSD } from '@/lib/nftCurrency';

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { value: number; payload: { label: string } }[];
  currency: Currency;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-gray-500 mb-0.5">{payload[0].payload.label}</p>
      <p className="text-white font-bold">
        {currency === 'usd' ? fmtNFTUSD(v) : fmtETH(v)}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  collections: NFTCollection[];
  currency: Currency;
}

export function EcosystemOverview({ collections, currency }: Props) {
  // Aggregate stats across all collections
  const total24h = collections.reduce((s, c) => s + c.volume24h, 0);
  const total7d  = collections.reduce((s, c) => s + c.volume7d, 0);
  const total30d = collections.reduce((s, c) => s + c.volume30d, 0);

  // Find a non-zero ETH price (preview collections always carry it)
  const ethPriceUSD = collections.find((c) => c.ethPriceUSD > 0)?.ethPriceUSD ?? 2000;

  // Daily averages for the comparison chart
  const avg7dDaily  = total7d  > 0 ? total7d  / 7  : 0;
  const avg30dDaily = total30d > 0 ? total30d / 30 : 0;

  // Trend vs weekly average
  const trendPct = avg7dDaily > 0 ? ((total24h - avg7dDaily) / avg7dDaily) * 100 : 0;
  const trendUp  = trendPct >= 0;

  const toDisplay = (eth: number) =>
    currency === 'usd' ? eth * ethPriceUSD : eth;

  const fmt = (eth: number) =>
    currency === 'usd' ? fmtNFTUSD(eth * ethPriceUSD) : fmtETH(eth);

  // Bar chart: today's 24h vol vs the two period averages
  const chartData = [
    { label: 'Today (24h)', value: toDisplay(total24h),    color: '#00FF94' },
    { label: '7d daily avg', value: toDisplay(avg7dDaily),  color: '#3B82F6' },
    { label: '30d daily avg', value: toDisplay(avg30dDaily), color: '#6366f1' },
  ];

  const hasData = total24h > 0 || total7d > 0 || total30d > 0;

  const stats = [
    { label: '24h Volume',   value: fmt(total24h) },
    { label: '7d Volume',    value: fmt(total7d) },
    { label: '30d Volume',   value: fmt(total30d) },
    { label: 'Collections',  value: collections.length.toLocaleString() },
  ];

  return (
    <div className="card mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">MegaETH NFT Ecosystem</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Aggregated across {collections.length} collections
          </p>
        </div>
        {avg7dDaily > 0 && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              trendUp
                ? 'bg-green-400/10 text-green-400'
                : 'bg-red-400/10 text-red-400'
            }`}
          >
            {trendUp ? '↑' : '↓'} {Math.abs(trendPct).toFixed(0)}% vs 7d avg
          </span>
        )}
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-white/[0.04] rounded-lg px-2.5 py-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-xs font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Daily volume comparison chart */}
      <div>
        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
          Daily Volume — Today vs Weekly & Monthly Average
        </p>

        {!hasData ? (
          <div className="h-[64px] flex items-center justify-center">
            <p className="text-xs text-gray-600">No volume data available yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={72}>
            <BarChart
              data={chartData}
              barSize={40}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="label"
                stroke="transparent"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                tickLine={false}
              />
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                content={<ChartTooltip currency={currency} />}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {avg7dDaily > 0 && (
          <p className="text-[10px] text-gray-600 mt-2">
            Today&apos;s volume is{' '}
            <span className={trendUp ? 'text-green-400' : 'text-red-400'}>
              {Math.abs(trendPct).toFixed(0)}% {trendUp ? 'above' : 'below'}
            </span>{' '}
            the 7-day daily average
            {avg30dDaily > 0 &&
              ` · 30d daily avg: ${fmt(avg30dDaily)}`}
          </p>
        )}
      </div>
    </div>
  );
}
