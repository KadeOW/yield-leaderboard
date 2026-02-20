'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useWatchList } from '@/hooks/useWatchList';
import { useYieldData } from '@/hooks/useYieldData';
import { usePoolData } from '@/hooks/usePoolData';
import { useMarketData } from '@/hooks/useMarketData';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import { useTokenStats } from '@/hooks/useTokenStats';
import { TokenModal } from '@/components/leaderboard/TokenModal';
import type { TokenStat } from '@/app/api/tokens/route';
import { getAllPositions } from '@/lib/protocols';
import { getWalletActivity, type ActivityEvent } from '@/lib/walletActivity';
import { PositionCard } from '@/components/dashboard/PositionCard';
import { truncateAddress, formatUSD, formatUSDCompact, formatAPY, formatPositionAge, scoreColor } from '@/lib/utils';
import type { Position } from '@/types';
import type { Trade } from '@/app/api/trades/route';
import type { MarketPool, NewTokenInfo } from '@/app/api/market/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Right Sidebar ─────────────────────────────────────────────────────────────

function MiniLeaderboard({ watchedSet, onFollowToggle }: { watchedSet: Set<string>; onFollowToggle: (addr: string) => void }) {
  const { data: entries, isLoading } = useLeaderboard();

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs font-semibold text-white">Top Earners</p>
        <p className="text-[10px] text-gray-500">Yield score ranking</p>
      </div>
      {isLoading && (
        <div className="p-3 space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />)}
        </div>
      )}
      <div className="divide-y divide-border">
        {(entries ?? []).slice(0, 10).map((e) => {
          const isFollowing = watchedSet.has(e.address.toLowerCase());
          return (
            <div key={e.address} className="flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-bold w-5 text-center shrink-0 ${e.rank <= 3 ? 'text-yellow-400' : 'text-gray-600'}`}>
                  {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `${e.rank}`}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-white truncate">{truncateAddress(e.address)}</p>
                  <p className={`text-[10px] font-semibold ${scoreColor(e.yieldScore)}`}>{e.yieldScore} pts</p>
                </div>
              </div>
              <button
                onClick={() => onFollowToggle(e.address)}
                className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
                  isFollowing
                    ? 'border-accent/30 text-accent'
                    : 'border-border text-gray-600 hover:text-accent hover:border-accent/30'
                }`}
              >
                {isFollowing ? '✓' : '+'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const ACTIVITY_META: Record<ActivityEvent['type'], { label: string; color: string; icon: string }> = {
  lp_open:        { label: 'Opened LP',  color: 'text-accent',     icon: '↗' },
  lp_close:       { label: 'Closed LP',  color: 'text-red-400',    icon: '↙' },
  vault_deposit:  { label: 'Deposited',  color: 'text-blue-400',   icon: '+' },
  vault_withdraw: { label: 'Withdrew',   color: 'text-yellow-400', icon: '−' },
};

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = ACTIVITY_META[event.type];
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold w-4 text-center ${meta.color}`}>{meta.icon}</span>
        <div>
          <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
          <p className="text-[10px] text-gray-500">{event.protocol}</p>
        </div>
      </div>
      <p className="text-[10px] text-gray-600">{event.timestamp ? formatPositionAge(event.timestamp) : '—'}</p>
    </div>
  );
}

// ─── Watched wallet card (sidebar version) ────────────────────────────────────

function WatchedWalletCard({ address, onUnfollow }: { address: string; onUnfollow: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'positions' | 'activity'>('positions');

  const { data: positions, isLoading: posLoading } = useQuery<Position[]>({
    queryKey: ['watch-positions', address],
    queryFn: () => getAllPositions(address),
    staleTime: 60_000,
  });

  const { data: activity, isLoading: actLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['watch-activity', address],
    queryFn: () => getWalletActivity(address),
    staleTime: 60_000,
    enabled: expanded && tab === 'activity',
  });

  const { totalDeposited, weightedAPY, yieldScore, strategyTags } = useYieldData(positions);

  const sColor = scoreColor(yieldScore);

  return (
    <div className="card !p-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
          {address.slice(2, 4).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-white truncate">{truncateAddress(address)}</p>
          {strategyTags.length > 0 && (
            <p className="text-[10px] text-gray-500 truncate">{strategyTags.slice(0, 2).join(' · ')}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!posLoading && (
            <div className="text-right">
              <p className="text-[10px] text-gray-500">{formatAPY(weightedAPY)}</p>
              <p className={`text-xs font-bold ${sColor}`}>{yieldScore}</p>
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] px-2 py-1 rounded border border-border text-gray-500 hover:text-white transition-colors"
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            onClick={onUnfollow}
            className="text-[10px] px-2 py-1 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {!posLoading && (
        <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
          <span>TVL: <span className="text-white">{formatUSD(totalDeposited)}</span></span>
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex gap-1 mb-3">
            {(['positions', 'activity'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors capitalize ${
                  tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'positions' && (
            <>
              {posLoading && <div className="h-20 bg-white/5 rounded-lg animate-pulse" />}
              {!posLoading && positions && positions.length > 0 && (
                <div className="space-y-2">
                  {positions.map((pos, i) => (
                    <PositionCard key={`${pos.protocol}-${pos.asset}-${i}`} position={pos} />
                  ))}
                </div>
              )}
              {!posLoading && (!positions || positions.length === 0) && (
                <p className="text-xs text-gray-500 text-center py-4">No positions found.</p>
              )}
            </>
          )}

          {tab === 'activity' && (
            <>
              {actLoading && <div className="h-20 bg-white/5 rounded-lg animate-pulse" />}
              {!actLoading && activity && activity.length > 0 && (
                <div>{activity.map((ev, i) => <ActivityRow key={i} event={ev} />)}</div>
              )}
              {!actLoading && (!activity || activity.length === 0) && (
                <p className="text-xs text-gray-500 text-center py-4">No recent activity.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add address input ─────────────────────────────────────────────────────────

function AddAddressInput({ onAdd }: { onAdd: (addr: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(val)) {
      setError('Enter a valid 0x address');
      return;
    }
    setError('');
    onAdd(val);
    setInput('');
  }, [input, onAdd]);

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(''); }}
        placeholder="0x... follow a wallet"
        className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent/40 font-mono"
      />
      <button type="submit" className="btn-primary px-3 py-1.5 text-xs shrink-0">Follow</button>
      {error && <p className="text-[10px] text-red-400 self-center">{error}</p>}
    </form>
  );
}

// ─── Tokens Tab ───────────────────────────────────────────────────────────────

type TokenSort = 'volume' | 'change' | 'mcap' | 'buys' | 'new';

function ageBadge(createdAt: number): { label: string; cls: string } {
  const diff = Date.now() - createdAt;
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  if (mins < 10)  return { label: `${mins}m ago`, cls: 'bg-accent/15 text-accent border border-accent/20' };
  if (mins < 60)  return { label: `${mins}m ago`, cls: 'bg-green-500/15 text-green-400' };
  if (hrs  < 6)   return { label: `${hrs}h ago`,  cls: 'bg-yellow-500/15 text-yellow-400' };
  return { label: `${hrs}h ago`, cls: 'bg-white/5 text-gray-500' };
}

function formatPrice(p: number): string {
  if (p === 0) return '—';
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.001) return `$${p.toFixed(6)}`;
  if (p < 1)    return `$${p.toFixed(4)}`;
  if (p < 10)   return `$${p.toFixed(3)}`;
  return formatUSD(p);
}

function newTokenToTokenStat(t: NewTokenInfo): TokenStat {
  return {
    address: t.address,
    symbol: t.symbol,
    logo: t.logo,
    priceUSD: t.priceUSD,
    priceChange24h: t.priceChange24h,
    volume24hUSD: t.volume24hUSD,
    fdvUSD: undefined,
    buys24h: 0,
    sells24h: 0,
    topPoolAddress: t.topPoolAddress,
    topPoolName: t.symbol,
    topPoolDex: t.topPoolDex,
  };
}

function TokensTab({ trades, watchedSet }: { trades: Trade[]; watchedSet: Set<string> }) {
  const { data: tokenData, isLoading: tokensLoading } = useTokenStats();
  const { data: marketData, isLoading: marketLoading } = useMarketData();
  const [sort, setSort] = useState<TokenSort>('volume');
  const [selected, setSelected] = useState<TokenStat | null>(null);
  const [search, setSearch] = useState('');

  const isNew = sort === 'new';

  // Regular token list sorted, then search-filtered
  const tokens = useMemo(() => {
    const list = tokenData?.tokens ?? [];
    const sorted = [...list].sort((a, b) => {
      if (sort === 'volume') return b.volume24hUSD - a.volume24hUSD;
      if (sort === 'change') return b.priceChange24h - a.priceChange24h;
      if (sort === 'mcap')   return (b.fdvUSD ?? 0) - (a.fdvUSD ?? 0);
      if (sort === 'buys')   return b.buys24h - a.buys24h;
      return 0;
    });
    if (!search.trim()) return sorted;
    const q = search.trim().toLowerCase();
    const matches = sorted.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q),
    );
    // When multiple tokens match the same symbol, re-sort within that group by
    // volume → market cap → buys so the most legit token appears first
    return matches.sort((a, b) => {
      if (a.symbol.toLowerCase() === b.symbol.toLowerCase()) {
        const volDiff = b.volume24hUSD - a.volume24hUSD;
        if (volDiff !== 0) return volDiff;
        const mcapDiff = (b.fdvUSD ?? 0) - (a.fdvUSD ?? 0);
        if (mcapDiff !== 0) return mcapDiff;
        return b.buys24h - a.buys24h;
      }
      return 0;
    });
  }, [tokenData, sort, search]);

  // Detect symbols that appear more than once in the current list (duplicates)
  const { duplicateSymbols, topBySymbol } = useMemo(() => {
    const symbolCount = new Map<string, number>();
    const top = new Map<string, string>(); // symbol → first token's address (highest rank)
    for (const t of tokens) {
      const s = t.symbol.toLowerCase();
      symbolCount.set(s, (symbolCount.get(s) ?? 0) + 1);
      if (!top.has(s)) top.set(s, t.address);
    }
    const dupes = new Set([...symbolCount.entries()].filter(([, n]) => n > 1).map(([s]) => s));
    return { duplicateSymbols: dupes, topBySymbol: top };
  }, [tokens]);

  // New tokens — sorted newest first, last 24h only
  const newTokens = useMemo((): NewTokenInfo[] => {
    if (!isNew) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const list = [...(marketData?.newTokens ?? [])]
      .filter((t) => !t.createdAt || t.createdAt >= cutoff);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q),
    );
  }, [marketData, isNew, search]);

  const isLoading = isNew ? marketLoading : tokensLoading;

  const SORT_OPTIONS: { col: TokenSort; label: string; dot?: string }[] = [
    { col: 'volume', label: 'Volume' },
    { col: 'change', label: '▲ Gainers' },
    { col: 'buys',   label: 'Most Buys' },
    { col: 'mcap',   label: 'Mkt Cap' },
    { col: 'new',    label: 'New', dot: '#00FF94' },
  ];

  return (
    <>
      {selected && (
        <TokenModal
          token={selected}
          trades={trades}
          watchedSet={watchedSet}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-500">
            {isLoading
              ? 'Loading…'
              : isNew
              ? `${newTokens.length} new tokens in the last 24h · newest first`
              : `${tokens.length} tokens · click any row to view chart`}
          </p>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {SORT_OPTIONS.map(({ col, label, dot }) => (
              <button
                key={col}
                onClick={() => setSort(col)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  sort === col ? 'bg-white/10 text-white shadow' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or contract address…"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 pl-9 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/40 transition-colors"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm pointer-events-none">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="space-y-1.5">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* ── New tokens view ── */}
        {!isLoading && isNew && (
          <>
            {newTokens.length === 0 ? (
              <div className="rounded-xl border border-border py-14 text-center">
                <p className="text-gray-500 text-sm">No new tokens in the last 24h</p>
              </div>
            ) : (
              <div className="space-y-1">
                {newTokens.map((token, i) => {
                  const badge = token.createdAt ? ageBadge(token.createdAt) : null;
                  const isPos = token.priceChange24h >= 0;
                  return (
                    <div
                      key={token.address}
                      onClick={() => setSelected(newTokenToTokenStat(token))}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent hover:border-white/[0.06] hover:bg-white/[0.04] transition-all cursor-pointer"
                    >
                      {/* Index */}
                      <span className="text-xs text-gray-700 w-5 shrink-0 text-right font-mono">{i + 1}</span>

                      {/* Logo + name */}
                      <div className="flex items-center gap-2.5 w-36 shrink-0">
                        {token.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={token.logo} alt={token.symbol} className="w-8 h-8 rounded-full ring-1 ring-white/10 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                            {token.symbol[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white group-hover:text-accent transition-colors truncate">
                            {token.symbol}
                          </p>
                          <p className={`text-[10px] font-medium ${token.topPoolDex === 'Kumbaya' ? 'text-cyan-500' : 'text-violet-400'}`}>
                            {token.topPoolDex}
                          </p>
                        </div>
                      </div>

                      {/* Age badge */}
                      {badge && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}

                      {/* Price + change */}
                      <div className="w-28 shrink-0">
                        <p className="text-sm font-mono font-semibold text-white">{formatPrice(token.priceUSD)}</p>
                        <span className={`text-xs font-semibold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                          {isPos ? '▲' : '▼'} {Math.abs(token.priceChange24h).toFixed(2)}%
                        </span>
                      </div>

                      {/* Volume */}
                      <div className="hidden sm:block w-24 shrink-0">
                        <p className="text-xs text-gray-400 mb-0.5">Volume</p>
                        <p className="text-sm font-semibold text-white">{formatUSDCompact(token.volume24hUSD)}</p>
                      </div>

                      <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-xs shrink-0 ml-auto">→</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Regular token list ── */}
        {!isLoading && !isNew && (
          <>
            {tokens.length === 0 ? (
              <div className="rounded-xl border border-border py-14 text-center">
                <p className="text-gray-500 text-sm">
                  {search ? `No tokens matching "${search}"` : 'No token data yet'}
                </p>
                {!search && <p className="text-xs text-gray-600 mt-1">Fetching from GeckoTerminal…</p>}
              </div>
            ) : (
              <div className="space-y-1">
                {tokens.map((token, rank) => {
                  const isPos = token.priceChange24h >= 0;
                  const total = token.buys24h + token.sells24h;
                  const buyPct = total > 0 ? (token.buys24h / total) * 100 : 50;
                  const priceStr = token.priceUSD < 0.001
                    ? `$${token.priceUSD.toFixed(6)}`
                    : token.priceUSD < 1
                    ? `$${token.priceUSD.toFixed(4)}`
                    : formatUSD(token.priceUSD);
                  const symLower = token.symbol.toLowerCase();
                  const isCaution = duplicateSymbols.has(symLower) && topBySymbol.get(symLower) !== token.address;

                  return (
                    <div
                      key={token.address}
                      onClick={() => setSelected(token)}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent hover:border-white/[0.06] hover:bg-white/[0.04] transition-all cursor-pointer"
                    >
                      {/* Rank */}
                      <span className="text-xs text-gray-700 w-5 shrink-0 text-right font-mono">{rank + 1}</span>

                      {/* Logo + name */}
                      <div className="flex items-center gap-2.5 w-32 shrink-0">
                        {token.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={token.logo} alt={token.symbol} className="w-8 h-8 rounded-full ring-1 ring-white/10 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/10 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                            {token.symbol[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-semibold text-white group-hover:text-accent transition-colors truncate">
                              {token.symbol}
                            </p>
                            {isCaution && (
                              <span title="Lower-ranked duplicate — verify contract address" className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 shrink-0">⚠</span>
                            )}
                          </div>
                          <p className={`text-[10px] font-medium ${token.topPoolDex === 'Kumbaya' ? 'text-cyan-500' : 'text-violet-400'}`}>
                            {token.topPoolDex}
                          </p>
                        </div>
                      </div>

                      {/* Price + change */}
                      <div className="w-32 shrink-0">
                        <p className="text-sm font-mono font-semibold text-white">{priceStr}</p>
                        <span className={`text-xs font-semibold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                          {isPos ? '▲' : '▼'} {Math.abs(token.priceChange24h).toFixed(2)}%
                        </span>
                      </div>

                      {/* Volume */}
                      <div className="hidden sm:block w-24 shrink-0">
                        <p className="text-xs text-gray-400 mb-0.5">Volume</p>
                        <p className="text-sm font-semibold text-white">{formatUSDCompact(token.volume24hUSD)}</p>
                      </div>

                      {/* Buy/sell pressure */}
                      <div className="flex-1 hidden md:block">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-green-400 font-medium">▲ {token.buys24h} buys</span>
                          <span className="text-[10px] text-red-400 font-medium">{token.sells24h} sells ▼</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-red-500/25 overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${buyPct}%` }} />
                        </div>
                      </div>

                      {/* Market cap */}
                      <div className="hidden lg:block w-24 shrink-0 text-right">
                        <p className="text-xs text-gray-600 mb-0.5">Mkt Cap</p>
                        <p className="text-sm font-semibold text-gray-300">
                          {token.fdvUSD ? formatUSDCompact(token.fdvUSD) : '—'}
                        </p>
                      </div>

                      <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-xs shrink-0">→</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FeedTab = 'market' | 'tokens' | 'activity';

export default function LivePage() {
  const [feedTab, setFeedTab] = useState<FeedTab>('tokens');
  const { addresses, add, remove } = useWatchList();
  const { data: tradesData } = useLiveTrades();

  const watchedSet = useMemo(() => new Set(addresses.map((a) => a.toLowerCase())), [addresses]);

  const handleFollowToggle = useCallback((address: string) => {
    if (watchedSet.has(address.toLowerCase())) {
      remove(address);
    } else {
      add(address);
    }
  }, [watchedSet, add, remove]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Live Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          Real-time MegaETH token prices · pool activity · live trades
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">

        {/* ── Left: Live feed (flex-1) ── */}
        <div className="flex-1 min-w-0">
          {/* Feed tab bar */}
          <div className="flex gap-1 mb-5 border-b border-border">
            {([
              ['tokens',   'Tokens'],
              ['market',   'Market'],
              ['activity', 'Activity'],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFeedTab(v)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  feedTab === v
                    ? 'border-accent text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {feedTab === 'tokens'   && <TokensTab trades={tradesData?.trades ?? []} watchedSet={watchedSet} />}
          {feedTab === 'market'   && <MarketTab />}
          {feedTab === 'activity' && <ActivityTab />}
        </div>

        {/* ── Right: Sidebar (fixed width) ── */}
        <div className="w-72 shrink-0 space-y-4 hidden lg:block">
          <MiniLeaderboard watchedSet={watchedSet} onFollowToggle={handleFollowToggle} />

          {/* Watching section */}
          <div className="card !p-0 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-white">
                Watching
                {addresses.length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{addresses.length}</span>
                )}
              </p>
            </div>
            <div className="p-3 space-y-3">
              <AddAddressInput onAdd={add} />
              {addresses.length === 0 ? (
                <p className="text-[10px] text-gray-600 text-center py-2">
                  Follow wallets to track their positions
                </p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {addresses.map((addr) => (
                    <WatchedWalletCard key={addr} address={addr} onUnfollow={() => remove(addr)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: watching section below feed */}
      <div className="lg:hidden mt-6 space-y-4">
        <div className="card !p-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-white">
              Watching
              {addresses.length > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">{addresses.length}</span>
              )}
            </p>
          </div>
          <div className="p-3 space-y-3">
            <AddAddressInput onAdd={add} />
            {addresses.length > 0 && (
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <WatchedWalletCard key={addr} address={addr} onUnfollow={() => remove(addr)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
