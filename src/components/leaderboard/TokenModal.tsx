'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  CartesianGrid,
} from 'recharts';
import type { TokenStat } from '@/app/api/tokens/route';
import type { OHLCVCandle, OHLCVResponse } from '@/app/api/ohlcv/route';
import type { Trade } from '@/app/api/trades/route';
import { formatUSD, formatUSDCompact, truncateAddress } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(p: number): string {
  if (p === 0) return '—';
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.001) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  if (p < 10) return `$${p.toFixed(3)}`;
  return formatUSD(p);
}

function formatTimeLabel(ts: number, period: string): string {
  const d = new Date(ts);
  if (period === 'minute') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (period === 'hour') {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Closest OHLCV candle to a trade timestamp
function closestCandle(candles: OHLCVCandle[], ts: number): OHLCVCandle | undefined {
  if (!candles.length) return undefined;
  return candles.reduce((best, c) =>
    Math.abs(c.timestamp - ts) < Math.abs(best.timestamp - ts) ? c : best,
  );
}

// Synthetic 24h price series when real OHLCV isn't available
function buildSyntheticCandles(priceNow: number, change24h: number, points = 24): OHLCVCandle[] {
  const now = Date.now();
  const stepMs = (24 * 60 * 60 * 1000) / (points - 1);
  const startPrice = priceNow / (1 + change24h / 100);
  // Simple seeded pseudo-random for reproducibility
  let seed = Math.floor(priceNow * 10000) % 9999 + 1;
  function rand() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }

  const candles: OHLCVCandle[] = [];
  let price = startPrice;
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const trend = startPrice + (priceNow - startPrice) * progress;
    const noise = trend * 0.008 * (rand() - 0.5);
    price = Math.max(0, trend + noise);
    candles.push({
      timestamp: now - (points - 1 - i) * stepMs,
      open: price,
      high: price * (1 + 0.003 * rand()),
      low: price * (1 - 0.003 * rand()),
      close: price,
      volume: 0,
    });
  }
  return candles;
}

// ─── Marker types ─────────────────────────────────────────────────────────────

type MarkerKind = 'followed-buy' | 'followed-sell' | 'trader-buy' | 'trader-sell';

interface TradeMarker {
  timestamp: number;
  price: number;
  kind: MarkerKind;
  address: string;
  volumeUSD: number;
}

const MARKER_COLORS: Record<MarkerKind, string> = {
  'followed-buy':  '#00FF94',
  'followed-sell': '#ef4444',
  'trader-buy':    '#f59e0b',
  'trader-sell':   '#f472b6',
};

const MARKER_LABELS: Record<MarkerKind, string> = {
  'followed-buy':  'Following — Buy',
  'followed-sell': 'Following — Sell',
  'trader-buy':    'Top Trader — Buy',
  'trader-sell':   'Top Trader — Sell',
};

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  period,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  period: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2.5 text-xs shadow-2xl">
      <p className="text-gray-500 mb-1">{formatTimeLabel(label, period)}</p>
      <p className="text-white font-bold text-sm">{formatPrice(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

// ─── Timeframe config ─────────────────────────────────────────────────────────

type Timeframe = '1h' | '4h' | '24h' | '7d';

const TIMEFRAME_CONFIG: Record<Timeframe, { geckoPeriod: string; limit: number; syntheticPoints: number; label: string }> = {
  '1h':  { geckoPeriod: 'minute', limit: 60,  syntheticPoints: 60,  label: '1H' },
  '4h':  { geckoPeriod: 'minute', limit: 240, syntheticPoints: 48,  label: '4H' },
  '24h': { geckoPeriod: 'hour',   limit: 24,  syntheticPoints: 24,  label: '24H' },
  '7d':  { geckoPeriod: 'hour',   limit: 168, syntheticPoints: 42,  label: '7D' },
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  token: TokenStat;
  trades: Trade[];
  watchedSet: Set<string>;
  onClose: () => void;
}

export function TokenModal({ token, trades, watchedSet, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const tfCfg = TIMEFRAME_CONFIG[timeframe];

  // Fetch OHLCV
  const { data: ohlcvData, isLoading: chartLoading } = useQuery<OHLCVResponse>({
    queryKey: ['ohlcv', token.topPoolAddress, tfCfg.geckoPeriod, tfCfg.limit],
    queryFn: async () => {
      const res = await fetch(
        `/api/ohlcv?pool=${token.topPoolAddress}&timeframe=${tfCfg.geckoPeriod}&limit=${tfCfg.limit}`,
      );
      if (!res.ok) return { candles: [], poolAddress: token.topPoolAddress, fetchedAt: Date.now() };
      return res.json();
    },
    enabled: !!token.topPoolAddress,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Use real candles if available, fall back to synthetic
  const realCandles = ohlcvData?.candles ?? [];
  const isSynthetic = !chartLoading && realCandles.length === 0;
  const candles: OHLCVCandle[] = useMemo(() => {
    if (realCandles.length > 0) return realCandles;
    if (!chartLoading) return buildSyntheticCandles(token.priceUSD, token.priceChange24h, tfCfg.syntheticPoints);
    return [];
  }, [realCandles, chartLoading, token.priceUSD, token.priceChange24h, tfCfg.syntheticPoints]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Trade markers
  const relevantTrades = trades.filter(
    (t) => t.poolAddress.toLowerCase() === token.topPoolAddress.toLowerCase(),
  );

  const traderVols = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of relevantTrades) {
      if (t.makerAddress) {
        const a = t.makerAddress.toLowerCase();
        map.set(a, (map.get(a) ?? 0) + t.volumeUSD);
      }
    }
    return map;
  }, [relevantTrades]);

  const topTraderAddrs = useMemo(() =>
    new Set([...traderVols.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a)),
    [traderVols],
  );

  const markerList = useMemo((): TradeMarker[] => {
    const seen = new Map<string, TradeMarker>();
    for (const t of relevantTrades) {
      if (!t.makerAddress) continue;
      const addr = t.makerAddress.toLowerCase();
      const isFollowed = watchedSet.has(addr);
      const isTopTrader = topTraderAddrs.has(addr);
      if (!isFollowed && !isTopTrader) continue;

      const nearest = closestCandle(candles, t.timestamp);
      if (!nearest) continue;

      const kind: MarkerKind =
        isFollowed && t.kind === 'buy' ? 'followed-buy' :
        isFollowed ? 'followed-sell' :
        t.kind === 'buy' ? 'trader-buy' : 'trader-sell';

      const key = `${nearest.timestamp}:${kind}`;
      if (!seen.has(key)) seen.set(key, { timestamp: nearest.timestamp, price: nearest.close, kind, address: t.makerAddress, volumeUSD: t.volumeUSD });
    }
    return [...seen.values()];
  }, [relevantTrades, candles, watchedSet, topTraderAddrs]);

  const usedKinds = new Set(markerList.map((m) => m.kind));

  // Y axis
  const prices = candles.map((c) => c.close).filter((p) => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const pad = (maxPrice - minPrice) * 0.12;
  const yDomain: [number, number] = [Math.max(0, minPrice - pad), maxPrice + pad];

  const isPositive = token.priceChange24h >= 0;
  const lineColor = isPositive ? '#00FF94' : '#ef4444';
  const gradId = `grad-${token.address.slice(2, 8)}`;

  const buyPct = token.buys24h + token.sells24h > 0
    ? Math.round((token.buys24h / (token.buys24h + token.sells24h)) * 100)
    : 0;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl w-full max-w-[680px] shadow-2xl overflow-hidden animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {token.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={token.logo} alt={token.symbol} className="w-10 h-10 rounded-full ring-1 ring-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-base font-bold text-gray-200 ring-1 ring-white/10">
                {token.symbol[0]}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-xl leading-none">{token.symbol}</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  isPositive ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                  {isPositive ? '+' : ''}{token.priceChange24h.toFixed(2)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{token.topPoolDex} · {token.topPoolName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-bold text-white">{formatPrice(token.priceUSD)}</p>
              <p className="text-xs text-gray-500">Current price</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-4 border-t border-b border-[#1e1e1e] divide-x divide-[#1e1e1e]">
          {[
            { label: 'Volume 24h', value: formatUSDCompact(token.volume24hUSD), color: '' },
            { label: 'Market Cap', value: token.fdvUSD ? formatUSDCompact(token.fdvUSD) : '—', color: '' },
            { label: 'Buys 24h', value: token.buys24h.toLocaleString(), color: 'text-green-400' },
            { label: 'Sells 24h', value: token.sells24h.toLocaleString(), color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 bg-[#0f0f0f]">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-sm font-bold ${color || 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Buy pressure bar ── */}
        {token.buys24h + token.sells24h > 0 && (
          <div className="px-5 py-2.5 flex items-center gap-3 border-b border-[#1e1e1e]">
            <span className="text-[10px] text-gray-600 shrink-0">Buy pressure</span>
            <div className="flex-1 h-1.5 rounded-full bg-red-500/30 overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: `${buyPct}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-green-400 shrink-0">{buyPct}% buys</span>
          </div>
        )}

        {/* ── Chart ── */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            {isSynthetic && (
              <span className="text-[10px] text-gray-600 italic">Estimated trend · no on-chain OHLCV yet</span>
            )}
            {!isSynthetic && <span className="text-[10px] text-gray-600">Live price data</span>}
            <div className="flex gap-0.5 ml-auto">
              {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    timeframe === tf
                      ? 'bg-white/10 text-white'
                      : 'text-gray-600 hover:text-gray-300'
                  }`}
                >
                  {TIMEFRAME_CONFIG[tf].label}
                </button>
              ))}
            </div>
          </div>

          {chartLoading ? (
            <div className="h-[200px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <p className="text-xs text-gray-600">Loading chart…</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={candles} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => formatTimeLabel(v, tfCfg.geckoPeriod)}
                  stroke="transparent"
                  tick={{ fontSize: 9, fill: '#4b5563' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(v) => {
                    const s = formatPrice(v);
                    return s.length > 10 ? s.slice(0, 9) + '…' : s;
                  }}
                  stroke="transparent"
                  tick={{ fontSize: 9, fill: '#4b5563' }}
                  tickLine={false}
                  width={64}
                />
                <Tooltip content={<ChartTooltip period={tfCfg.geckoPeriod} />} />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: lineColor, stroke: '#0f0f0f', strokeWidth: 2 }}
                />
                {markerList.map((m, i) => (
                  <ReferenceDot
                    key={i}
                    x={m.timestamp}
                    y={m.price}
                    r={6}
                    fill={MARKER_COLORS[m.kind]}
                    stroke="#0f0f0f"
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Marker legend */}
          {usedKinds.size > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {([...usedKinds] as MarkerKind[]).map((kind) => (
                <div key={kind} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: MARKER_COLORS[kind] }} />
                  <span className="text-[10px] text-gray-500">{MARKER_LABELS[kind]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent pool activity ── */}
        {relevantTrades.length > 0 && (
          <div className="border-t border-[#1e1e1e] px-5 py-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Recent swaps</p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {relevantTrades.slice(0, 15).map((t, i) => {
                const isBuy = t.kind === 'buy';
                const addrLower = (t.makerAddress ?? '').toLowerCase();
                const isFollowed = watchedSet.has(addrLower);
                return (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-4 ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                        {isBuy ? '▲' : '▼'}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500">
                        {truncateAddress(t.makerAddress || '0x0000000000000000000000000000000000000000')}
                      </span>
                      {isFollowed && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-medium">Following</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold ${t.volumeUSD >= 5_000 ? 'text-yellow-400' : 'text-gray-300'}`}>
                      {formatUSD(t.volumeUSD)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
