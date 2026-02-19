'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWatchList } from '@/hooks/useWatchList';
import { getAllPositions } from '@/lib/protocols';
import { getWalletActivity, type ActivityEvent } from '@/lib/walletActivity';
import { useYieldData } from '@/hooks/useYieldData';
import { PositionCard } from '@/components/dashboard/PositionCard';
import { truncateAddress, formatUSD, formatAPY, formatPositionAge } from '@/lib/utils';
import type { Position } from '@/types';

// ─── Activity feed item ──────────────────────────────────────────────────────

const ACTIVITY_META: Record<ActivityEvent['type'], { label: string; color: string; icon: string }> = {
  lp_open:        { label: 'Opened LP',   color: 'text-accent',      icon: '↗' },
  lp_close:       { label: 'Closed LP',   color: 'text-red-400',     icon: '↙' },
  vault_deposit:  { label: 'Deposited',   color: 'text-blue-400',    icon: '+' },
  vault_withdraw: { label: 'Withdrew',    color: 'text-yellow-400',  icon: '−' },
};

function ActivityRow({ event }: { event: ActivityEvent }) {
  const meta = ACTIVITY_META[event.type];
  const age = event.timestamp ? formatPositionAge(event.timestamp) : '—';
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className={`text-lg font-bold w-5 text-center ${meta.color}`}>{meta.icon}</span>
        <div>
          <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
          <p className="text-xs text-gray-500">{event.protocol}{event.tokenId != null ? ` #${event.tokenId}` : ''}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">{age}</p>
    </div>
  );
}

// ─── Single watched wallet card ──────────────────────────────────────────────

function WatchedWalletCard({ address, onRemove }: { address: string; onRemove: () => void }) {
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

  const { totalDeposited, totalYieldEarned, weightedAPY, yieldScore, strategyTags } =
    useYieldData(positions);

  const isMock = positions?.every((p) =>
    ['Morpho', 'Lido', 'Uniswap V3', 'Compound V3', 'Spark', 'Avon', 'Prism', 'Kumbaya', 'Aave V3'].includes(p.protocol)
  ) ?? false;

  const scoreColor =
    yieldScore >= 80 ? 'text-accent' :
    yieldScore >= 60 ? 'text-yellow-400' :
    yieldScore >= 40 ? 'text-orange-400' : 'text-red-400';

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
            {address.slice(2, 4).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-mono text-sm text-white truncate">{truncateAddress(address)}</p>
            {strategyTags.length > 0 && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {strategyTags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats summary */}
        {!posLoading && (
          <div className="hidden sm:flex items-center gap-6 shrink-0">
            <div className="text-right">
              <p className="text-xs text-gray-500">Value</p>
              <p className="text-sm font-semibold text-white">{formatUSD(totalDeposited)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">APY</p>
              <p className="text-sm font-semibold text-accent">{formatAPY(weightedAPY)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Score</p>
              <p className={`text-sm font-bold ${scoreColor}`}>{yieldScore}</p>
            </div>
          </div>
        )}
        {posLoading && <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />}

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-gray-400 hover:text-white hover:border-white/20 transition-colors"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            onClick={onRemove}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          {/* Tab bar */}
          <div className="flex gap-1 mb-4">
            {(['positions', 'activity'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Positions tab */}
          {tab === 'positions' && (
            <>
              {posLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[1, 2].map((i) => <div key={i} className="h-40 bg-white/5 rounded-xl animate-pulse" />)}
                </div>
              )}
              {!posLoading && positions && positions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {positions.map((pos, i) => (
                    <PositionCard key={`${pos.protocol}-${pos.asset}-${i}`} position={pos} isMock={isMock} />
                  ))}
                </div>
              )}
              {!posLoading && (!positions || positions.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-6">No positions found for this wallet.</p>
              )}
            </>
          )}

          {/* Activity tab */}
          {tab === 'activity' && (
            <>
              {actLoading && <div className="h-32 bg-white/5 rounded-xl animate-pulse" />}
              {!actLoading && activity && activity.length > 0 && (
                <div>
                  {activity.map((ev, i) => <ActivityRow key={i} event={ev} />)}
                </div>
              )}
              {!actLoading && (!activity || activity.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-6">No recent on-chain activity found.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add address form ────────────────────────────────────────────────────────

function AddAddressForm({ onAdd }: { onAdd: (addr: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const val = input.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(val)) {
        setError('Enter a valid 0x Ethereum address');
        return;
      }
      setError('');
      onAdd(val);
      setInput('');
    },
    [input, onAdd],
  );

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(''); }}
        placeholder="0x... wallet address to track"
        className="flex-1 bg-card border border-border rounded-lg px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/40 font-mono"
      />
      <button type="submit" className="btn-primary px-5 py-2 text-sm">
        Track
      </button>
      {error && <p className="text-xs text-red-400 self-center">{error}</p>}
    </form>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WatchPage() {
  const { addresses, add, remove } = useWatchList();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Wallet Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">
          Follow any wallet to see their live DeFi positions and on-chain activity.
        </p>
      </div>

      <div className="mb-6">
        <AddAddressForm onAdd={add} />
      </div>

      {addresses.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-3xl mb-3">👁</p>
          <p className="font-medium text-white mb-2">No wallets tracked yet</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Paste any Ethereum address above to start tracking their yield positions and activity.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {addresses.map((addr) => (
          <WatchedWalletCard key={addr} address={addr} onRemove={() => remove(addr)} />
        ))}
      </div>
    </div>
  );
}
