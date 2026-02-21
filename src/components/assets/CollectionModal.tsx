'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ScatterChart, Scatter, ZAxis, Legend, ReferenceLine,
} from 'recharts';
import { useCollectionDetail } from '@/hooks/useCollectionDetail';
import { useCollectionEvents } from '@/hooks/useCollectionEvents';
import { truncateAddress } from '@/lib/utils';
import type { NFTCollection } from '@/app/api/nfts/collections/route';
import type { SaleEvent } from '@/app/api/nfts/collection/[slug]/events/route';
import { type Currency, fmtETH, fmtNFTUSD, fmtNFTPrice } from '@/lib/nftCurrency';

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtPrice(ethVal: number, currency: Currency, ethPriceUSD: number): string {
  return fmtNFTPrice(ethVal, currency, ethPriceUSD);
}

function fmtExpiry(s: string): string {
  return s || 'No expiry';
}

function timeAgo(tsMs: number): string {
  const secs = Math.floor((Date.now() - tsMs) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({
  collection,
  currency,
  ethPriceUSD,
}: {
  collection: NFTCollection;
  currency: Currency;
  ethPriceUSD: number;
}) {
  const stats = [
    { label: 'Floor', value: fmtPrice(collection.floorPriceETH, currency, ethPriceUSD) },
    { label: 'Vol 24h', value: fmtPrice(collection.volume24h, currency, ethPriceUSD) },
    { label: 'Vol 7d', value: fmtPrice(collection.volume7d, currency, ethPriceUSD) },
    { label: 'Owners', value: collection.ownersCount ? collection.ownersCount.toLocaleString() : '—' },
    { label: 'Items', value: collection.itemsCount ? collection.itemsCount.toLocaleString() : '—' },
  ];

  return (
    <div className="grid grid-cols-5 border-t border-b border-[#1e1e1e] divide-x divide-[#1e1e1e]">
      {stats.map(({ label, value }) => (
        <div key={label} className="px-3 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-sm font-bold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Analytics strip ──────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number, decimals = 1): string {
  if (!denominator || !isFinite(numerator / denominator)) return '—';
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

function AnalyticsStrip({
  collection,
  nearFloorCount,
  sales,
}: {
  collection: NFTCollection;
  nearFloorCount: number;
  sales: SaleEvent[];
}) {
  const { itemsCount, ownersCount, listedCount, floorPriceETH } = collection;

  const pctListed = pct(listedCount, itemsCount);
  const pctHolders = pct(ownersCount, itemsCount);
  const pctNearFloor = listedCount > 0 ? pct(nearFloorCount, listedCount, 0) : '—';

  // Avg sale price vs floor gap (last 10 sales)
  const recent = sales.slice(0, 10);
  const avgSaleETH = recent.length > 0
    ? recent.reduce((s, x) => s + x.priceETH, 0) / recent.length
    : null;
  const gapPct = avgSaleETH != null && floorPriceETH > 0
    ? ((avgSaleETH - floorPriceETH) / floorPriceETH) * 100
    : null;
  const gapStr = gapPct != null ? `${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}%` : '—';
  const gapPositive = gapPct != null && gapPct >= 0;

  const items = [
    {
      label: '% Listed',
      value: pctListed,
      sub: `${listedCount > 0 ? listedCount.toLocaleString() : '?'} of ${itemsCount > 0 ? itemsCount.toLocaleString() : '?'} items`,
      title: 'Percentage of total supply currently listed for sale',
      color: null,
    },
    {
      label: 'Unique Holders',
      value: pctHolders,
      sub: `${ownersCount > 0 ? ownersCount.toLocaleString() : '?'} wallets`,
      title: 'Percentage of supply held by distinct wallets',
      color: null,
    },
    {
      label: 'Near Floor',
      value: pctNearFloor,
      sub: `${nearFloorCount} of ${listedCount} within 10% of floor`,
      title: 'Percentage of active listings priced within 10% of the floor price',
      color: null,
    },
    {
      label: 'Avg Sale vs Floor',
      value: gapStr,
      sub: recent.length > 0 ? `avg of last ${recent.length} sales` : 'no recent sales',
      title: 'Average recent sale price compared to the current floor — positive means buyers paid above floor',
      color: gapPct != null ? (gapPositive ? '#00FF94' : '#f87171') : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-[#1e1e1e] divide-x divide-y sm:divide-y-0 divide-[#1e1e1e]">
      {items.map(({ label, value, sub, title, color }) => (
        <div key={label} className="px-3 py-2.5" title={title}>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-sm font-bold" style={{ color: color ?? '#fff' }}>{value}</p>
          <p className="text-[10px] text-gray-600 mt-0.5 truncate">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Floor price scatter chart ─────────────────────────────────────────────────

function ScatterTooltip({
  active,
  payload,
  currency,
  ethPriceUSD,
}: {
  active?: boolean;
  payload?: { payload: { ts: number; price: number } }[];
  currency: Currency;
  ethPriceUSD: number;
}) {
  if (!active || !payload?.length) return null;
  const { ts, price } = payload[0].payload;
  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-gray-500 mb-1">
        {new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-white font-bold">{fmtPrice(price, currency, ethPriceUSD)}</p>
      <p className="text-gray-600">{fmtETH(price)}</p>
    </div>
  );
}

function FloorPriceChart({
  sales,
  currency,
  ethPriceUSD,
}: {
  sales: { ts: number; priceETH: number }[];
  currency: Currency;
  ethPriceUSD: number;
}) {
  const data = sales.map((s) => ({
    ts: s.ts,
    price: currency === 'usd' ? s.priceETH * ethPriceUSD : s.priceETH,
  }));

  const prices = data.map((d) => d.price).filter((p) => p > 0);
  const minP = prices.length ? Math.min(...prices) * 0.9 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.1 : 1;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
        <XAxis
          type="number"
          dataKey="ts"
          domain={['auto', 'auto']}
          scale="time"
          stroke="transparent"
          tick={false}
          tickLine={false}
        />
        <YAxis
          type="number"
          dataKey="price"
          domain={[minP, maxP]}
          tickFormatter={(v) => {
            const s = fmtPrice(v, currency, 1); // already multiplied in data
            return s.length > 9 ? s.slice(0, 8) + '…' : s;
          }}
          stroke="transparent"
          tick={{ fontSize: 9, fill: '#4b5563' }}
          tickLine={false}
          width={60}
        />
        <ZAxis range={[40, 40]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={
            <ScatterTooltip
              currency={currency === 'usd' ? 'usd' : 'eth'}
              ethPriceUSD={1} // data already in chosen unit
            />
          }
        />
        <Scatter data={data} fill="#00FF94" fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── Spread chart (asks vs trades) ────────────────────────────────────────────

function SpreadTooltip({
  active,
  payload,
  currency,
  ethPriceUSD,
}: {
  active?: boolean;
  payload?: { payload: { price: number; label: string } }[];
  currency: Currency;
  ethPriceUSD: number;
}) {
  if (!active || !payload?.length) return null;
  const { price, label } = payload[0].payload;
  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-gray-500 mb-0.5">{label}</p>
      <p className="text-white font-bold">{fmtPrice(price, currency, ethPriceUSD)}</p>
    </div>
  );
}

function SpreadChart({
  listings,
  sales,
  floorPriceETH,
  currency,
  ethPriceUSD,
}: {
  listings: { priceETH: number }[];
  sales: SaleEvent[];
  floorPriceETH: number;
  currency: Currency;
  ethPriceUSD: number;
}) {
  const mult = currency === 'usd' ? ethPriceUSD : 1;
  const floorDisplay = floorPriceETH * mult;

  // Pin asks to y=1 row, recent sales to y=0 row — two clear horizontal bands
  const askData = listings.map((l) => ({ price: l.priceETH * mult, y: 1, label: 'Listing (ask)' }));
  const tradeData = sales.slice(0, 20).map((s) => ({ price: s.priceETH * mult, y: 0, label: 'Recent sale' }));

  const allPrices = [...askData, ...tradeData].map((d) => d.price).filter((p) => p > 0);
  if (allPrices.length === 0) return null;

  const minP = Math.min(...allPrices) * 0.9;
  const maxP = Math.max(...allPrices) * 1.1;

  return (
    <ResponsiveContainer width="100%" height={100}>
      <ScatterChart margin={{ top: 4, right: 8, bottom: 4, left: 52 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" horizontal={false} />
        <XAxis
          type="number"
          dataKey="price"
          domain={[minP, maxP]}
          stroke="transparent"
          tick={{ fontSize: 9, fill: '#4b5563' }}
          tickLine={false}
          tickFormatter={(v) => {
            const s = fmtPrice(v, currency, 1);
            return s.length > 8 ? s.slice(0, 7) + '…' : s;
          }}
        />
        {/* Y-axis shows row labels instead of numbers */}
        <YAxis
          type="number"
          dataKey="y"
          domain={[-0.5, 1.5]}
          ticks={[0, 1]}
          tickFormatter={(v) => (v === 1 ? 'Asks' : 'Sales')}
          stroke="transparent"
          tick={{ fontSize: 9, fill: '#6b7280' }}
          tickLine={false}
          width={46}
        />
        <ZAxis range={[28, 28]} />
        <Tooltip
          cursor={false}
          content={
            <SpreadTooltip
              currency={currency === 'usd' ? 'usd' : 'eth'}
              ethPriceUSD={1}
            />
          }
        />
        {floorDisplay > 0 && (
          <ReferenceLine
            x={floorDisplay}
            stroke="#555"
            strokeDasharray="4 3"
            label={{ value: 'Floor', position: 'insideTopRight', fontSize: 9, fill: '#6b7280' }}
          />
        )}
        <Scatter data={askData} fill="#3B82F6" fillOpacity={0.85} />
        <Scatter data={tradeData} fill="#00FF94" fillOpacity={0.85} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── Sales feed ────────────────────────────────────────────────────────────────

function SalesFeed({
  sales,
  currency,
  ethPriceUSD,
  loading,
}: {
  sales: SaleEvent[];
  currency: Currency;
  ethPriceUSD: number;
  loading: boolean;
}) {
  const sorted = [...sales].sort((a, b) => b.ts - a.ts).slice(0, 15);

  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Recent Sales</p>
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      )}
      {!loading && sorted.length === 0 && (
        <p className="text-xs text-gray-600">No recent sales data.</p>
      )}
      {!loading && sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {s.imgUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imgUrl} alt={`#${s.tokenId}`} className="w-7 h-7 rounded object-cover shrink-0 bg-white/5" />
              ) : (
                <div className="w-7 h-7 rounded bg-white/5 shrink-0" />
              )}
              <p className="text-[10px] text-gray-500 font-mono shrink-0">
                #{s.tokenId.length > 6 ? s.tokenId.slice(0, 6) + '…' : s.tokenId}
              </p>
              <p className="text-xs font-semibold text-white flex-1">
                {fmtPrice(s.priceETH, currency, ethPriceUSD)}
              </p>
              <p className="text-[10px] text-gray-600 shrink-0">{timeAgo(s.ts)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity chart ────────────────────────────────────────────────────────────

type ActivityRange = '7d' | '30d';

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2 text-xs shadow-2xl">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold capitalize">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

function ActivityChart({
  activity,
}: {
  activity: { date: string; ts: number; listed: number; sold: number }[];
}) {
  const [range, setRange] = useState<ActivityRange>('7d');

  const data = useMemo(() => {
    const count = range === '7d' ? 7 : 30;
    return activity.slice(-count);
  }, [activity, range]);

  const hasData = data.some((d) => d.listed > 0 || d.sold > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider">Listed vs Sold</p>
        <div className="flex gap-0.5">
          {(['7d', '30d'] as ActivityRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                range === r ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="h-[120px] flex items-center justify-center">
          <p className="text-xs text-gray-600">No listing or sale activity in this period.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#4b5563' }}
              tickLine={false}
              interval={range === '30d' ? 4 : 0}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: '#4b5563' }}
              tickLine={false}
              width={20}
              allowDecimals={false}
            />
            <Tooltip content={<ActivityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ fontSize: 10, color: '#6b7280', paddingTop: 4 }}
            />
            <Bar dataKey="listed" name="Listed" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={20} />
            <Bar dataKey="sold" name="Sold" fill="#00FF94" radius={[2, 2, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Volume bar chart (compact) ────────────────────────────────────────────────

function VolumeChart({
  collection,
  currency,
  ethPriceUSD,
}: {
  collection: NFTCollection;
  currency: Currency;
  ethPriceUSD: number;
}) {
  const bars = [
    { label: '1d', ethVal: collection.volume24h },
    { label: '7d', ethVal: collection.volume7d },
    { label: '30d', ethVal: collection.volume30d },
    { label: 'All', ethVal: collection.volumeTotal },
  ].map((b) => ({
    label: b.label,
    value: currency === 'usd' ? b.ethVal * ethPriceUSD : b.ethVal,
  }));

  const maxVal = Math.max(...bars.map((b) => b.value), 0.000001);
  const COLORS = ['#00FF94', '#00cc77', '#009955', '#006633'];

  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Volume</p>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={bars} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={36}>
          <XAxis
            dataKey="label"
            stroke="transparent"
            tick={{ fontSize: 9, fill: '#6b7280' }}
            tickLine={false}
          />
          <YAxis hide domain={[0, maxVal * 1.2]} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const v = payload[0]?.value as number;
              return (
                <div className="bg-[#0d0d0d] border border-[#333] rounded-xl px-3 py-2 text-xs shadow-2xl">
                  <p className="text-white font-bold">
                    {currency === 'usd' ? fmtNFTUSD(v) : fmtETH(v)}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {bars.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  slug: string;
  preview?: NFTCollection;
  currency: Currency;
  onClose: () => void;
}

export function CollectionModal({ slug, preview, currency, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const { data, isLoading: detailLoading } = useCollectionDetail(slug);
  const { data: eventsData, isLoading: eventsLoading } = useCollectionEvents(slug);

  const collection = data?.collection ?? preview;
  const listings = data?.listings ?? [];
  const nearFloorCount = data?.nearFloorCount ?? 0;
  // Use || not ?? so that ethPriceUSD:0 (detail route default) falls through to preview
  const ethPriceUSD = collection?.ethPriceUSD || preview?.ethPriceUSD || 2000;

  const sales = eventsData?.sales ?? [];
  const activity = eventsData?.activity ?? [];

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in">

        {/* ── Banner ── */}
        {collection?.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={collection.bannerUrl} alt={collection.name} className="w-full h-24 object-cover rounded-t-2xl" />
        ) : (
          <div className="w-full h-24 bg-gradient-to-r from-[#1a1a1a] to-[#0a0a0a] rounded-t-2xl" />
        )}

        {/* ── Header ── */}
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 -mt-8">
            {collection?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={collection.imageUrl}
                alt={collection?.name}
                className="w-14 h-14 rounded-xl border-2 border-[#0f0f0f] ring-1 ring-white/10 object-cover shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl border-2 border-[#0f0f0f] bg-white/10 flex items-center justify-center text-xl font-bold text-gray-400 shrink-0">
                {collection?.name?.[0] ?? '?'}
              </div>
            )}
            <div className="mt-8">
              {collection ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-white text-lg leading-tight">{collection.name}</h2>
                    {collection.safelistStatus === 'verified' && (
                      <span
                        title="Verified on OpenSea"
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] shrink-0"
                      >
                        ✓
                      </span>
                    )}
                    <a
                      href={collection.openseaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-accent transition-colors text-sm"
                      title="View on OpenSea"
                    >
                      ↗
                    </a>
                  </div>
                  <p className="text-xs text-gray-600 font-mono">{collection.contractAddress.slice(0, 10)}…</p>
                </>
              ) : (
                <div className="h-5 w-40 bg-white/10 rounded animate-pulse mt-8" />
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-1 w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        {collection?.description && (
          <p className="px-5 pb-3 text-xs text-gray-500 line-clamp-2">{collection.description}</p>
        )}

        {/* ── Stats strip ── */}
        {collection && (
          <StatsStrip collection={collection} currency={currency} ethPriceUSD={ethPriceUSD} />
        )}

        {/* ── Analytics percentages ── */}
        {collection && (
          <AnalyticsStrip collection={collection} nearFloorCount={nearFloorCount} sales={sales} />
        )}

        {/* ── Floor Price History ── */}
        <div className="px-5 pt-4 pb-2 border-b border-[#1e1e1e]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">Floor Price History</p>
            <span className="text-[10px] text-gray-700">Sale dots · last 30 days</span>
          </div>
          {eventsLoading ? (
            <div className="h-[160px] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : sales.length === 0 ? (
            <div className="h-[80px] flex items-center justify-center">
              <p className="text-xs text-gray-600">No sales recorded in the last 30 days.</p>
            </div>
          ) : (
            <FloorPriceChart sales={sales} currency={currency} ethPriceUSD={ethPriceUSD} />
          )}
        </div>

        {/* ── Spread Chart (asks vs trades) ── */}
        {(listings.length > 0 || sales.length > 0) && collection && (
          <div className="px-5 pt-4 pb-3 border-b border-[#1e1e1e]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider">Price Spread</p>
              <div className="flex items-center gap-3 text-[10px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block" />Listings</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00FF94] inline-block" />Sales</span>
              </div>
            </div>
            <SpreadChart
              listings={listings}
              sales={sales}
              floorPriceETH={collection.floorPriceETH}
              currency={currency}
              ethPriceUSD={ethPriceUSD}
            />
          </div>
        )}

        {/* ── Listed vs Sold Activity ── */}
        <div className="px-5 pt-4 pb-3 border-b border-[#1e1e1e]">
          {eventsLoading ? (
            <div className="h-[120px] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            </div>
          ) : (
            <ActivityChart activity={activity} />
          )}
        </div>

        {/* ── Volume Chart ── */}
        {collection && (
          <div className="px-5 pt-4 pb-3 border-b border-[#1e1e1e]">
            <VolumeChart collection={collection} currency={currency} ethPriceUSD={ethPriceUSD} />
          </div>
        )}

        {/* ── Recent Sales Feed ── */}
        <div className="px-5 pt-4 pb-3 border-b border-[#1e1e1e]">
          <SalesFeed sales={sales} currency={currency} ethPriceUSD={ethPriceUSD} loading={eventsLoading} />
        </div>

        {/* ── Active Listings ── */}
        <div className="px-5 py-3 border-b border-[#1e1e1e]">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
            Active Listings
            {listings.length > 0 && <span className="ml-1 normal-case text-gray-700">({listings.length})</span>}
          </p>
          {detailLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          )}
          {!detailLoading && listings.length === 0 && (
            <p className="text-xs text-gray-600">No active listings found.</p>
          )}
          {listings.length > 0 && (
            <div className="space-y-2">
              {listings.map((l, i) => (
                <div key={i} className="flex items-center gap-3">
                  {l.nftImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.nftImageUrl} alt={l.nftName} className="w-8 h-8 rounded-lg object-cover shrink-0 bg-white/5" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate">{l.nftName || `#${l.tokenId}`}</p>
                    <p className="text-[10px] text-gray-600 font-mono">{truncateAddress(l.maker)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-accent">
                      {fmtPrice(l.priceETH, currency, ethPriceUSD)}
                    </p>
                    <p className="text-[10px] text-gray-600">{fmtETH(l.priceETH)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
