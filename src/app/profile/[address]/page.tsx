'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getAllPositions } from '@/lib/protocols';
import { useYieldData } from '@/hooks/useYieldData';
import { YieldSummary } from '@/components/dashboard/YieldSummary';
import { StrategyMap } from '@/components/profile/StrategyMap';
import { PositionHistory } from '@/components/profile/PositionHistory';
import { truncateAddress, scoreColor } from '@/lib/utils';

export default function ProfilePage() {
  const { address } = useParams<{ address: string }>();

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(address ?? '');

  const { data: positions, isLoading } = useQuery({
    queryKey: ['positions', address],
    queryFn: () => getAllPositions(address!),
    enabled: isValidAddress,
  });

  const { totalDeposited, totalYieldEarned, weightedAPY, yieldScore, strategyTags } =
    useYieldData(positions);

  if (!isValidAddress) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <p className="text-red-400 mb-4">Invalid address</p>
        <Link href="/leaderboard" className="btn-secondary">
          Back to Leaderboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/leaderboard" className="text-sm text-gray-500 hover:text-white transition-colors">
          ← Leaderboard
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white font-mono">{truncateAddress(address)}</h1>
          <p className="text-xs text-gray-500 mt-1 font-mono">{address}</p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-lg font-bold ${scoreColor(yieldScore)}`}>
              Score: {yieldScore}
            </span>
            {strategyTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 rounded-full border border-border text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card h-24 skeleton" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <YieldSummary
            totalDeposited={totalDeposited}
            totalYieldEarned={totalYieldEarned}
            weightedAPY={weightedAPY}
            yieldScore={yieldScore}
          />

          {positions && positions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StrategyMap positions={positions} />
              <div className="card">
                <h3 className="font-semibold mb-3">Strategy Summary</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  This wallet earns yield across{' '}
                  <span className="text-white">
                    {new Set(positions.map((p) => p.protocol)).size} protocols
                  </span>{' '}
                  with a weighted average APY of{' '}
                  <span className="text-accent">{weightedAPY.toFixed(2)}%</span>. Strategy tags:{' '}
                  {strategyTags.join(', ')}.
                </p>
              </div>
            </div>
          )}

          <div>
            <h2 className="font-semibold text-white mb-4">Positions</h2>
            <PositionHistory positions={positions ?? []} />
          </div>
        </div>
      )}
    </div>
  );
}
