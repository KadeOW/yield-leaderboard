'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { usePositions } from '@/hooks/usePositions';
import { usePoolData, type PoolInfo } from '@/hooks/usePoolData';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useWatchList } from '@/hooks/useWatchList';
import { detectStrategy, type DetectedStrategy, type StrategyStep } from '@/lib/strategyDetector';
import { scanForLoopStrategists, type DiscoveredWalletStrategy } from '@/lib/strategyScanner';
import { truncateAddress, formatUSD, formatAPY, formatUSDCompact, scoreColor } from '@/lib/utils';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { useMarketData } from '@/hooks/useMarketData';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import type { Trade } from '@/app/api/trades/route';
import type { MarketPool } from '@/app/api/market/route';

// ─── Market helpers ───────────────────────────────────────────────────────────

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function PriceChange({ pct }: { pct: number }) {
  const isPos = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
      {isPos ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}

function DexBadge({ dex }: { dex: string }) {
  const cls = dex === 'Kumbaya'
    ? 'text-cyan-400 bg-cyan-400/10'
    : dex === 'Prism'
    ? 'text-violet-400 bg-violet-400/10'
    : 'text-gray-400 bg-white/5';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{dex}</span>;
}

function TokenLogos({ logo0, logo1, sym0, sym1 }: { logo0?: string; logo1?: string; sym0: string; sym1: string }) {
  return (
    <div className="flex -space-x-1.5 shrink-0">
      {[{ logo: logo0, sym: sym0 }, { logo: logo1, sym: sym1 }].map((t, i) =>
        t.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={t.logo} alt={t.sym} className="w-5 h-5 rounded-full border border-[#1a1a1a]" />
        ) : (
          <div key={i} className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-gray-400 border border-[#1a1a1a]">
            {t.sym[0]}
          </div>
        )
      )}
    </div>
  );
}

// ─── Market Tab ───────────────────────────────────────────────────────────────

function MarketTab() {
  const { data: marketData, isLoading: mktLoading } = useMarketData();
  const { data: poolData, isLoading: poolLoading } = usePoolData();
  const [view, setView] = useState<'movers' | 'volume' | 'new'>('movers');

  const allPools = useMemo(() => [...(poolData?.prism ?? []), ...(poolData?.kumbaya ?? [])], [poolData]);

  const topMovers: MarketPool[] = useMemo(() =>
    [...(marketData?.trending ?? [])]
      .filter((p) => p.tvlUSD > 500)
      .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h))
      .slice(0, 20),
    [marketData],
  );

  const volumeLeaders = useMemo(() =>
    [...allPools].sort((a, b) => b.volume24hUSD - a.volume24hUSD).slice(0, 20),
    [allPools],
  );

  const newPools: MarketPool[] = useMemo(() =>
    [...(marketData?.newPools ?? [])].slice(0, 20),
    [marketData],
  );

  const loading = mktLoading || poolLoading;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {([['movers', 'Top Movers'], ['volume', 'Volume Leaders'], ['new', 'New Pools']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === v ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      )}

      {/* Top Movers */}
      {!loading && view === 'movers' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-card/50">
              <tr>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Pool</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">24h Change</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">TVL</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden md:table-cell">Volume 24h</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">APY</th>
              </tr>
            </thead>
            <tbody>
              {topMovers.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">No trending data yet</td></tr>
              )}
              {topMovers.map((p) => (
                <tr key={p.address} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <TokenLogos logo0={p.token0Logo} logo1={p.token1Logo} sym0={p.token0Symbol} sym1={p.token1Symbol} />
                      <div>
                        <p className="text-xs font-medium text-white">{p.token0Symbol}/{p.token1Symbol}</p>
                        <DexBadge dex={p.dex} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right"><PriceChange pct={p.priceChange24h} /></td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400 hidden sm:table-cell">{formatUSDCompact(p.tvlUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400 hidden md:table-cell">{formatUSDCompact(p.volume24hUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-accent">{formatAPY(p.apy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Volume Leaders */}
      {!loading && view === 'volume' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-card/50">
              <tr>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Pool</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">Volume 24h</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">Fees 24h</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden md:table-cell">TVL</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">APY</th>
              </tr>
            </thead>
            <tbody>
              {volumeLeaders.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">No pool data yet</td></tr>
              )}
              {volumeLeaders.map((p) => (
                <tr key={p.address} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <TokenLogos logo0={p.token0Logo} logo1={p.token1Logo} sym0={p.token0Symbol} sym1={p.token1Symbol} />
                      <div>
                        <p className="text-xs font-medium text-white">{p.token0Symbol}/{p.token1Symbol}</p>
                        <DexBadge dex={p.dex} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-white">{formatUSDCompact(p.volume24hUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400 hidden sm:table-cell">{formatUSDCompact(p.fees24hUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400 hidden md:table-cell">{formatUSDCompact(p.tvlUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-accent">{formatAPY(p.apy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Pools */}
      {!loading && view === 'new' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-card/50">
              <tr>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Pool</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">Created</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">TVL</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">APY</th>
              </tr>
            </thead>
            <tbody>
              {newPools.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">No new pool data yet</td></tr>
              )}
              {newPools.map((p) => (
                <tr key={p.address} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <TokenLogos logo0={p.token0Logo} logo1={p.token1Logo} sym0={p.token0Symbol} sym1={p.token1Symbol} />
                      <div>
                        <p className="text-xs font-medium text-white">{p.token0Symbol}/{p.token1Symbol}</p>
                        <DexBadge dex={p.dex} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500 hidden sm:table-cell">
                    {p.createdAt ? formatTimeAgo(p.createdAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400">{formatUSDCompact(p.tvlUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-accent">{formatAPY(p.apy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

interface TopTrader {
  address: string;
  tradeCount: number;
  buyVolumeUSD: number;
  sellVolumeUSD: number;
  totalVolumeUSD: number;
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.kind === 'buy';
  return (
    <tr className="border-t border-border hover:bg-white/[0.02] transition-colors">
      <td className="px-3 py-2">
        <p className="text-xs font-mono text-gray-300">{truncateAddress(trade.makerAddress || '0x0000000000000000000000000000000000000000')}</p>
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs font-semibold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
          {isBuy ? '↑ Buy' : '↓ Sell'}
        </span>
      </td>
      <td className="px-3 py-2 hidden sm:table-cell">
        <div className="flex items-center gap-1.5">
          <DexBadge dex={trade.dex} />
          <p className="text-xs text-gray-500 truncate max-w-[100px]">{trade.poolName.split(' ')[0]}/{trade.poolName.split(' / ')[1]?.split(' ')[0] ?? ''}</p>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <p className={`text-xs font-semibold ${trade.volumeUSD >= 10_000 ? 'text-yellow-400' : 'text-white'}`}>
          {formatUSD(trade.volumeUSD)}
        </p>
      </td>
      <td className="px-3 py-2 text-right text-xs text-gray-600 hidden md:table-cell">
        {formatTimeAgo(trade.timestamp)}
      </td>
    </tr>
  );
}

function ActivityTab() {
  const { data: tradesData, isLoading } = useLiveTrades();
  const [view, setView] = useState<'feed' | 'traders'>('feed');

  const trades = tradesData?.trades ?? [];

  // Aggregate top traders from trade history
  const topTraders = useMemo<TopTrader[]>(() => {
    const map = new Map<string, TopTrader>();
    for (const t of trades) {
      if (!t.makerAddress) continue;
      const addr = t.makerAddress.toLowerCase();
      const existing = map.get(addr) ?? { address: t.makerAddress, tradeCount: 0, buyVolumeUSD: 0, sellVolumeUSD: 0, totalVolumeUSD: 0 };
      map.set(addr, {
        ...existing,
        tradeCount: existing.tradeCount + 1,
        buyVolumeUSD: existing.buyVolumeUSD + (t.kind === 'buy' ? t.volumeUSD : 0),
        sellVolumeUSD: existing.sellVolumeUSD + (t.kind === 'sell' ? t.volumeUSD : 0),
        totalVolumeUSD: existing.totalVolumeUSD + t.volumeUSD,
      });
    }
    return [...map.values()].sort((a, b) => b.totalVolumeUSD - a.totalVolumeUSD).slice(0, 20);
  }, [trades]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {([['feed', 'Live Feed'], ['traders', 'Top Traders']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${view === v ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tradesData && (
          <p className="text-[10px] text-gray-600">
            Updated {formatTimeAgo(tradesData.fetchedAt)} · refreshes every 60s
          </p>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      )}

      {/* Live trade feed */}
      {!isLoading && view === 'feed' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-card/50">
              <tr>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Wallet</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Action</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left hidden sm:table-cell">Pool</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">Value</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden md:table-cell">When</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                  No recent trades found — data may still be loading
                </td></tr>
              )}
              {trades.slice(0, 50).map((t, i) => (
                <TradeRow key={`${t.txHash}-${i}`} trade={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top traders */}
      {!isLoading && view === 'traders' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-card/50">
              <tr>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">#</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Wallet</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">Trades</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">Bought</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">Sold</th>
                <th className="px-3 py-2.5 text-xs text-gray-500 text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {topTraders.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">No trader data yet</td></tr>
              )}
              {topTraders.map((trader, i) => (
                <tr key={trader.address} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5 text-xs text-gray-600">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-mono text-white">{truncateAddress(trader.address)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-400">{trader.tradeCount}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-green-400 hidden sm:table-cell">{formatUSDCompact(trader.buyVolumeUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-red-400 hidden sm:table-cell">{formatUSDCompact(trader.sellVolumeUSD)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-white">{formatUSDCompact(trader.totalVolumeUSD)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pool table ───────────────────────────────────────────────────────────────

type PoolSort = 'apy' | 'tvl' | 'volume24h' | 'fees24h';

const DEX_BADGE: Record<string, string> = {
  Prism:   'text-violet-400 bg-violet-400/10 border-violet-400/20',
  Kumbaya: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
};

function formatM(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function PoolTable({
  prism,
  kumbaya,
  activePoolAddresses,
  isLoading,
}: {
  prism: PoolInfo[];
  kumbaya: PoolInfo[];
  /** Pool contract addresses where the user holds an LP position */
  activePoolAddresses: Set<string>;
  isLoading: boolean;
}) {
  const [sort, setSort] = useState<PoolSort>('apy');
  const [dexFilter, setDexFilter] = useState<'all' | 'Prism' | 'Kumbaya'>('all');

  const all = [...prism, ...kumbaya].filter(
    (p) => dexFilter === 'all' || p.dex === dexFilter,
  );
  const sorted = [...all].sort((a, b) => b[sort === 'apy' ? 'apy' : sort === 'tvl' ? 'tvlUSD' : sort === 'volume24h' ? 'volume24hUSD' : 'fees24hUSD'] - a[sort === 'apy' ? 'apy' : sort === 'tvl' ? 'tvlUSD' : sort === 'volume24h' ? 'volume24hUSD' : 'fees24hUSD']);

  const totalTVL = all.reduce((s, p) => s + p.tvlUSD, 0);
  const totalVol = all.reduce((s, p) => s + p.volume24hUSD, 0);

  function SortBtn({ col, label }: { col: PoolSort; label: string }) {
    return (
      <button
        onClick={() => setSort(col)}
        className={`text-xs px-2 py-0.5 rounded transition-colors ${sort === col ? 'text-white bg-white/10' : 'text-gray-500 hover:text-gray-300'}`}
      >
        {label} {sort === col ? '↓' : ''}
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        <p>No pool data available — check back soon.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-6 mb-4 px-1">
        <div>
          <p className="text-xs text-gray-500">Total TVL</p>
          <p className="font-semibold text-white">{formatM(totalTVL)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">24h Volume</p>
          <p className="font-semibold text-white">{formatM(totalVol)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pools</p>
          <p className="font-semibold text-white">{sorted.length}</p>
        </div>
        {/* DEX filter */}
        <div className="ml-auto flex gap-1">
          {(['all', 'Prism', 'Kumbaya'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDexFilter(f)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${dexFilter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-3 pb-2 border-b border-border text-xs text-gray-500">
        <span>Pool</span>
        <SortBtn col="tvl" label="TVL" />
        <SortBtn col="volume24h" label="24h Vol" />
        <SortBtn col="fees24h" label="24h Fees" />
        <SortBtn col="apy" label="Fee APY" />
        <span className="w-16" />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/50">
        {sorted.map((pool) => {
          const isActive = activePoolAddresses.has(pool.address.toLowerCase());
          return (
            <div
              key={pool.address}
              className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 items-center px-3 py-3 hover:bg-white/[0.02] transition-colors ${isActive ? 'ring-1 ring-inset ring-accent/20' : ''}`}
            >
              {/* Pair */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex -space-x-1">
                  {pool.token0Logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pool.token0Logo} alt={pool.token0Symbol} className="w-5 h-5 rounded-full border border-card" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/10 border border-card flex items-center justify-center text-[9px] text-gray-400">{pool.token0Symbol[0]}</div>
                  )}
                  {pool.token1Logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pool.token1Logo} alt={pool.token1Symbol} className="w-5 h-5 rounded-full border border-card" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/10 border border-card flex items-center justify-center text-[9px] text-gray-400">{pool.token1Symbol[0]}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {pool.token0Symbol}/{pool.token1Symbol}
                    <span className="ml-1 text-xs text-gray-600">{pool.feePct}%</span>
                  </p>
                  <span className={`text-[10px] px-1.5 py-px rounded border ${DEX_BADGE[pool.dex]}`}>{pool.dex}</span>
                </div>
                {isActive && (
                  <span className="text-[10px] px-1.5 py-px rounded bg-accent/10 border border-accent/30 text-accent">Active</span>
                )}
              </div>

              <span className="text-sm text-gray-300 tabular-nums text-right">{formatM(pool.tvlUSD)}</span>
              <span className="text-sm text-gray-400 tabular-nums text-right">{formatM(pool.volume24hUSD)}</span>
              <span className="text-sm text-gray-400 tabular-nums text-right">{formatM(pool.fees24hUSD)}</span>
              <span className={`text-sm font-bold tabular-nums text-right ${pool.apy > 50 ? 'text-accent' : pool.apy > 20 ? 'text-yellow-400' : 'text-gray-300'}`}>
                {pool.apy > 0 ? `${pool.apy.toFixed(1)}%` : '—'}
              </span>
              <a
                href={pool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-16 text-center text-xs px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Open →
              </a>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-600 text-center mt-4">
        Fee APY = (24h fees / TVL) × 365. Data from GeckoTerminal, refreshed every 3 hours.
      </p>
    </div>
  );
}

// ─── Strategy data ────────────────────────────────────────────────────────────

const AVON_APY = 8; // Avon vault yield (stable, fetched separately if needed)

/** Picks the best pool (highest APY with ≥$10k TVL) from a list. */
function bestPool(pools: PoolInfo[], minTVL = 10_000): PoolInfo | undefined {
  return pools
    .filter((p) => p.tvlUSD >= minTVL)
    .sort((a, b) => b.apy - a.apy)[0];
}

function buildCuratedStrategies(
  kumbayaPools: PoolInfo[],
  prismPools: PoolInfo[],
): DetectedStrategy[] {
  const kBest = bestPool(kumbayaPools);
  const pBest = bestPool(prismPools);

  const kAPY = Math.round(kBest?.apy ?? 60);
  const pAPY = Math.round(pBest?.apy ?? 25);
  const kAction = kBest ? `Provide ${kBest.token0Symbol}/${kBest.token1Symbol} ${kBest.feePct}% liquidity` : 'Provide USDMy/WETH liquidity';
  const pAction = pBest ? `Provide ${pBest.token0Symbol}/${pBest.token1Symbol} ${pBest.feePct}% liquidity` : 'Provide USDMy/WETH liquidity';

  return [
    {
      name: 'Yield Loop: Avon → Kumbaya',
      description: 'Deposit USDM into Avon to earn vault yield and receive USDMy. Re-deploy USDMy as liquidity in a Kumbaya pool to stack LP fees on top.',
      isLoop: true, complexity: 'Intermediate', baseAPY: AVON_APY, bonusAPY: kAPY, totalAPY: AVON_APY + kAPY, totalValue: 0,
      tags: ['Yield Loop', 'Stablecoin', 'Kumbaya'],
      steps: [
        { stepNumber: 1, protocol: 'Avon',    emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy', inputToken: 'USDM',  outputToken: 'USDMy',   apy: AVON_APY, url: 'https://www.avon.xyz/',    positionValue: 0 },
        { stepNumber: 2, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: kAction,                       inputToken: 'USDMy', outputToken: 'LP Fees', apy: kAPY,     url: 'https://www.kumbaya.xyz/', positionValue: 0 },
      ],
    },
    {
      name: 'Yield Loop: Avon → Prism',
      description: 'Deposit USDM into Avon, then use USDMy shares as one side of a concentrated LP on Prism — earning vault yield and swap fees simultaneously.',
      isLoop: true, complexity: 'Intermediate', baseAPY: AVON_APY, bonusAPY: pAPY, totalAPY: AVON_APY + pAPY, totalValue: 0,
      tags: ['Yield Loop', 'Stablecoin', 'Prism'],
      steps: [
        { stepNumber: 1, protocol: 'Avon',  emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy', inputToken: 'USDM',  outputToken: 'USDMy',   apy: AVON_APY, url: 'https://www.avon.xyz/', positionValue: 0 },
        { stepNumber: 2, protocol: 'Prism', emoji: '💎', color: '#8b5cf6', action: pAction,                       inputToken: 'USDMy', outputToken: 'LP Fees', apy: pAPY,     url: 'https://prismfi.cc/',   positionValue: 0 },
      ],
    },
    {
      name: 'Double Loop: Avon → Kumbaya + Prism',
      description: 'Split USDMy across both Kumbaya and Prism to diversify LP risk while maximising fee capture. Vault yield compounds underneath both positions.',
      isLoop: true, complexity: 'Advanced', baseAPY: AVON_APY, bonusAPY: kAPY + pAPY, totalAPY: AVON_APY + kAPY + pAPY, totalValue: 0,
      tags: ['Yield Loop', 'Stablecoin', 'Kumbaya', 'Prism', 'Diversified'],
      steps: [
        { stepNumber: 1, protocol: 'Avon',    emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy', inputToken: 'USDM',  outputToken: 'USDMy',   apy: AVON_APY, url: 'https://www.avon.xyz/',    positionValue: 0 },
        { stepNumber: 2, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: kAction,                       inputToken: 'USDMy', outputToken: 'LP Fees', apy: kAPY,     url: 'https://www.kumbaya.xyz/', positionValue: 0 },
        { stepNumber: 3, protocol: 'Prism',   emoji: '💎', color: '#8b5cf6', action: pAction,                       inputToken: 'USDMy', outputToken: 'LP Fees', apy: pAPY,     url: 'https://prismfi.cc/',       positionValue: 0 },
      ],
    },
    {
      name: 'Pure Kumbaya LP',
      description: 'Provide WETH-paired liquidity directly on Kumbaya. Higher capital efficiency if you want direct ETH exposure without the vault layer.',
      isLoop: false, complexity: 'Simple', baseAPY: kAPY, bonusAPY: 0, totalAPY: kAPY, totalValue: 0,
      tags: ['LP', 'Kumbaya', 'ETH'],
      steps: [
        { stepNumber: 1, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: kAction, inputToken: 'WETH', outputToken: 'LP Fees', apy: kAPY, url: 'https://www.kumbaya.xyz/', positionValue: 0 },
      ],
    },
  ];
}

// ─── Strategy sub-components ──────────────────────────────────────────────────

function StepFlow({ steps }: { steps: StrategyStep[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-300 font-mono">{step.inputToken}</div>
          <span className="text-gray-600">→</span>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
            style={{ borderColor: `${step.color}40`, backgroundColor: `${step.color}10`, color: step.color }}
          >
            <span>{step.emoji}</span>
            <span>{step.protocol}</span>
            <span className="opacity-70">· {formatAPY(step.apy)}</span>
          </div>
          <span className="text-gray-600">→</span>
          {i === steps.length - 1 && (
            <div className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-mono border border-accent/20">{step.outputToken}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CopyRecipe({ strategy }: { strategy: DetectedStrategy }) {
  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Step-by-step</p>
      {strategy.steps.map((step) => (
        <div key={step.stepNumber} className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: `${step.color}20`, color: step.color }}>
            {step.stepNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white"><span className="font-medium">{step.protocol}</span> — {step.action}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Earn <span className="text-accent">{formatAPY(step.apy)}</span> · {step.inputToken} → {step.outputToken}
            </p>
          </div>
          <a href={step.url} target="_blank" rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors shrink-0">
            Open →
          </a>
        </div>
      ))}
    </div>
  );
}

const COMPLEXITY_COLORS = {
  Simple:       'text-accent bg-accent/10 border-accent/20',
  Intermediate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  Advanced:     'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

function StrategyCard({ strategy, walletAddress, isOwn }: { strategy: DetectedStrategy; walletAddress?: string; isOwn?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`card relative ${isOwn ? 'ring-1 ring-accent/30' : ''}`}
      style={isOwn ? { boxShadow: '0 0 24px rgba(0,255,148,0.08)' } : undefined}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {isOwn && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent">Your Strategy</span>}
        {strategy.isLoop && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400">⟲ Yield Loop</span>}
        <span className={`text-xs px-2 py-0.5 rounded-full border ${COMPLEXITY_COLORS[strategy.complexity]}`}>{strategy.complexity}</span>
        {walletAddress && <span className="text-xs font-mono text-gray-600 ml-auto">{truncateAddress(walletAddress)}</span>}
      </div>
      <h3 className="font-bold text-white mb-1">{strategy.name}</h3>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">{strategy.description}</p>
      <div className="mb-4 overflow-x-auto"><StepFlow steps={strategy.steps} /></div>
      <div className="flex items-center gap-4 mb-4">
        <div><p className="text-xs text-gray-500">Base APY</p><p className="text-lg font-bold text-white">{formatAPY(strategy.baseAPY)}</p></div>
        {strategy.bonusAPY > 0 && (
          <><div className="text-gray-600 text-lg">+</div>
          <div><p className="text-xs text-gray-500">LP Bonus</p><p className="text-lg font-bold text-accent">{formatAPY(strategy.bonusAPY)}</p></div>
          <div className="text-gray-600 text-lg">=</div></>
        )}
        <div><p className="text-xs text-gray-500">Combined</p><p className="text-xl font-bold text-accent">{formatAPY(strategy.totalAPY)}</p></div>
        {strategy.totalValue > 0 && (
          <div className="ml-auto text-right"><p className="text-xs text-gray-500">Value</p><p className="text-sm font-semibold text-white">{formatUSD(strategy.totalValue)}</p></div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {strategy.tags.map((tag) => <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-500">{tag}</span>)}
      </div>
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full py-2 rounded-lg border border-accent/20 text-accent text-sm font-medium hover:bg-accent/5 transition-colors">
        {expanded ? '↑ Hide recipe' : '↓ Copy this strategy'}
      </button>
      {expanded && <CopyRecipe strategy={strategy} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Yield Earners Tab ────────────────────────────────────────────────────────

function YieldEarnersTab() {
  const { data: entries, isLoading } = useLeaderboard();
  const { addresses, add, remove } = useWatchList();
  const watchedSet = useMemo(() => new Set(addresses.map((a) => a.toLowerCase())), [addresses]);

  const handleFollow = useCallback((address: string) => {
    if (watchedSet.has(address.toLowerCase())) remove(address);
    else add(address);
  }, [watchedSet, add, remove]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-card/50">
          <tr>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-center w-10">Rank</th>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-left">Address</th>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-right">Score</th>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden sm:table-cell">APY</th>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-right hidden md:table-cell">TVL</th>
            <th className="px-3 py-2.5 text-xs text-gray-500 text-left hidden lg:table-cell">Strategy</th>
            <th className="px-3 py-2.5 w-20" />
          </tr>
        </thead>
        <tbody>
          {(entries ?? []).map((e) => {
            const isFollowing = watchedSet.has(e.address.toLowerCase());
            return (
              <tr key={e.address} className="border-t border-border hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2.5 text-center">
                  <span className={`text-xs font-bold ${e.rank <= 3 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-xs font-mono text-white">{truncateAddress(e.address)}</p>
                  {e.ensName && <p className="text-[10px] text-gray-500">{e.ensName}</p>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-xs font-bold ${scoreColor(e.yieldScore)}`}>{e.yieldScore}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-accent hidden sm:table-cell">{formatAPY(e.weightedAPY)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-gray-400 hidden md:table-cell">{formatUSDCompact(e.totalDeposited)}</td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  <div className="flex gap-1 flex-wrap">
                    {e.strategyTags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => handleFollow(e.address)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      isFollowing
                        ? 'border-accent/30 text-accent bg-accent/5'
                        : 'border-border text-gray-500 hover:border-accent/30 hover:text-accent'
                    }`}
                  >
                    {isFollowing ? 'Following' : '+ Follow'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'protocols' | 'strategies' | 'earners' | 'pools' | 'activity';

export default function ExplorePage() {
  const [tab, setTab] = useState<Tab>('protocols');
  // suppress unused import warning — formatUSD used in StrategyCard
  const { isConnected } = useAccount();
  const { data: myPositions, isLoading: myLoading } = usePositions();
  const { data: poolData, isLoading: poolLoading } = usePoolData();

  const myStrategy = myPositions ? detectStrategy(myPositions) : null;

  // Only LP positions count as "active" on a DEX — just holding a token does not
  const lpPositions = myPositions?.filter((p) => p.positionType === 'lp') ?? [];
  const activeLPProtocols = new Set(lpPositions.map((p) => p.protocol));
  const activePoolAddresses = new Set(lpPositions.map((p) => p.assetAddress.toLowerCase()));
  const hasAvonPosition = myPositions?.some((p) => p.protocol === 'Avon') ?? false;

  const prismPools = poolData?.prism ?? [];
  const kumbayaPools = poolData?.kumbaya ?? [];
  const CURATED = buildCuratedStrategies(kumbayaPools, prismPools);

  const { data: discovered = [], isLoading: scanLoading } = useQuery<DiscoveredWalletStrategy[]>({
    queryKey: ['strategy-scan'],
    queryFn: () => scanForLoopStrategists(6),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: tab === 'strategies',
  });

  const communityStrategies = discovered.length > 0 ? discovered : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Yield</h1>
        <p className="text-sm text-gray-500 mt-1">LP pools, yield strategies, and top earners on MegaETH.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {([
          ['protocols', 'Protocols'],
          ['strategies', 'Strategies'],
          ['earners', 'Yield Earners'],
          ['pools', 'Pools'],
          ['activity', 'Activity'],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === v ? 'border-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Strategies tab ── */}
      {tab === 'strategies' && (
        <div className="space-y-8">
          {/* How it works */}
          <div className="card border-accent/10 bg-accent/[0.02]">
            <h2 className="font-bold text-white mb-4">How yield looping works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { n: '1️⃣', title: 'Deposit into a vault', body: 'Put USDM into Avon. You receive USDMy — a yield-bearing token that grows in value as the vault earns.' },
                { n: '2️⃣', title: 'Re-deploy the receipt token', body: 'Use USDMy as liquidity on Prism or Kumbaya. Your LP earns swap fees on top of Avon vault yield compounding underneath.' },
                { n: '3️⃣', title: 'Stack the yields', body: 'Both layers pay simultaneously. The vault yield increases USDMy value, so your LP position value also grows — compounding returns.' },
              ].map((item) => (
                <div key={item.n}>
                  <div className="text-2xl mb-2">{item.n}</div>
                  <p className="text-sm font-medium text-white mb-1">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Your strategy */}
          <div>
            <h2 className="font-semibold text-white mb-4">Your Strategy</h2>
            {!isConnected && (
              <div className="card text-center py-10">
                <p className="text-2xl mb-3">🔗</p>
                <p className="font-medium text-white mb-2">Connect your wallet</p>
                <p className="text-sm text-gray-500 mb-4">We&apos;ll analyse your on-chain positions and show your current strategy.</p>
                <ConnectButton />
              </div>
            )}
            {isConnected && myLoading && <div className="h-40 bg-white/5 rounded-xl animate-pulse" />}
            {isConnected && !myLoading && myStrategy?.isLoop && <StrategyCard strategy={myStrategy} isOwn />}
            {isConnected && !myLoading && !myStrategy?.isLoop && (
              <div className="card border-dashed border-border text-center py-10">
                <p className="text-2xl mb-3">🌱</p>
                <p className="font-medium text-white mb-2">No yield loop detected yet</p>
                <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
                  Deposit USDM into Avon to receive USDMy, then pair USDMy as liquidity on Kumbaya or Prism. That&apos;s a loop.
                </p>
                <a href="https://www.avon.xyz/" target="_blank" rel="noopener noreferrer" className="btn-primary inline-block px-5 py-2 text-sm">
                  Start on Avon →
                </a>
              </div>
            )}
          </div>

          {/* Community / curated strategies */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-semibold text-white">
                {communityStrategies ? 'On-chain Discovered Loops' : 'Example Strategies'}
              </h2>
              {scanLoading && <span className="text-xs text-gray-500 animate-pulse">Scanning chain…</span>}
              {!scanLoading && communityStrategies && <span className="text-xs text-gray-500">{communityStrategies.length} wallets found</span>}
              {!scanLoading && !communityStrategies && <span className="text-xs text-gray-600">No loops found on-chain yet — showing curated examples</span>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {communityStrategies
                ? communityStrategies.map((d) => <StrategyCard key={d.address} strategy={d.strategy} walletAddress={d.address} />)
                : CURATED.map((s) => <StrategyCard key={s.name} strategy={s} />)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Protocols tab ── */}
      {tab === 'protocols' && (
        <div className="space-y-8">
          {/* Protocol overview cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Avon */}
            <div className={`card border-emerald-500/30 bg-emerald-500/5 ${hasAvonPosition ? 'ring-1 ring-emerald-500/40' : ''}`}
              style={hasAvonPosition ? { boxShadow: '0 0 0 1px rgba(16,185,129,0.5), 0 0 24px rgba(16,185,129,0.2)' } : undefined}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🌿</span>
                <div>
                  <p className="font-bold text-white">Avon</p>
                  <p className="text-xs text-gray-500">ERC-4626 vault · Stablecoin</p>
                </div>
                {hasAvonPosition && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">Active</span>}
              </div>
              <p className="text-xs text-gray-400 mb-3">Deposit USDM stablecoin to earn auto-compounding yield. Receive USDMy vault shares.</p>
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-gray-500">Est. APY</p><p className="font-bold text-accent">7–10%</p></div>
                <a href="https://www.avon.xyz/" target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors">Open →</a>
              </div>
            </div>
            {/* Prism */}
            <div className={`card border-violet-500/30 bg-violet-500/5 ${activeLPProtocols.has('Prism') ? 'ring-1 ring-violet-500/40' : ''}`}
              style={activeLPProtocols.has('Prism') ? { boxShadow: '0 0 0 1px rgba(139,92,246,0.5), 0 0 24px rgba(139,92,246,0.2)' } : undefined}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">💎</span>
                <div>
                  <p className="font-bold text-white">Prism</p>
                  <p className="text-xs text-gray-500">UniV3 fork · {prismPools.length} pools</p>
                </div>
                {activeLPProtocols.has('Prism') && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">Active</span>}
              </div>
              <p className="text-xs text-gray-400 mb-3">Concentrated liquidity DEX on MegaETH. High fee capture from real-time block throughput.</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Top Pool APY</p>
                  <p className="font-bold text-violet-400">
                    {prismPools.length > 0 ? `${Math.round(bestPool(prismPools)?.apy ?? 0)}%` : '—'}
                  </p>
                </div>
                <a href="https://prismfi.cc/" target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors">Open →</a>
              </div>
            </div>
            {/* Kumbaya */}
            <div className={`card border-cyan-500/30 bg-cyan-500/5 ${activeLPProtocols.has('Kumbaya') ? 'ring-1 ring-cyan-500/40' : ''}`}
              style={activeLPProtocols.has('Kumbaya') ? { boxShadow: '0 0 0 1px rgba(6,182,212,0.5), 0 0 24px rgba(6,182,212,0.2)' } : undefined}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🌊</span>
                <div>
                  <p className="font-bold text-white">Kumbaya</p>
                  <p className="text-xs text-gray-500">UniV3 fork · {kumbayaPools.length} pools</p>
                </div>
                {activeLPProtocols.has('Kumbaya') && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">Active</span>}
              </div>
              <p className="text-xs text-gray-400 mb-3">High-throughput AMM on MegaETH with deep liquidity incentives and real-time fee generation.</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Top Pool APY</p>
                  <p className="font-bold text-cyan-400">
                    {kumbayaPools.length > 0 ? `${Math.round(bestPool(kumbayaPools)?.apy ?? 0)}%` : '—'}
                  </p>
                </div>
                <a href="https://www.kumbaya.xyz/" target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors">Open →</a>
              </div>
            </div>
          </div>

          {/* Live pool table */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-white">Live Pools</h2>
                <p className="text-xs text-gray-500 mt-0.5">Sorted by fee APY · refreshed every 3h</p>
              </div>
              {poolData?.fetchedAt && (
                <p className="text-xs text-gray-600">
                  Updated {new Date(poolData.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <PoolTable
              prism={prismPools}
              kumbaya={kumbayaPools}
              activePoolAddresses={activePoolAddresses}
              isLoading={poolLoading}
            />
          </div>
        </div>
      )}

      {/* ── Yield Earners tab ── */}
      {tab === 'earners' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-white mb-1">Top Yield Earners</h2>
            <p className="text-xs text-gray-500">Ranked by yield score · follow wallets to track on Live Feed</p>
          </div>
          <YieldEarnersTab />
        </div>
      )}

      {/* ── Pools tab ── */}
      {tab === 'pools' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-white mb-1">Market Pools</h2>
            <p className="text-xs text-gray-500">Top movers, volume leaders, and new pools on MegaETH</p>
          </div>
          <MarketTab />
        </div>
      )}

      {/* ── Activity tab ── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-white mb-1">Trading Activity</h2>
            <p className="text-xs text-gray-500">Live trades and top traders on MegaETH</p>
          </div>
          <ActivityTab />
        </div>
      )}
    </div>
  );
}
