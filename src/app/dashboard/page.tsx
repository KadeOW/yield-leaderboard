'use client';

import { useAccount } from 'wagmi';
import Link from 'next/link';
import { usePositions } from '@/hooks/usePositions';
import { useYieldData } from '@/hooks/useYieldData';
import { YieldSummary } from '@/components/dashboard/YieldSummary';
import { PositionCard } from '@/components/dashboard/PositionCard';
import { YieldChart } from '@/components/dashboard/YieldChart';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { truncateAddress, formatUSD } from '@/lib/utils';
import { useMemo } from 'react';
import { usePoolData, poolAPYByAddress } from '@/hooks/usePoolData';
import { useWalletPortfolio } from '@/hooks/useWalletPortfolio';

function generateChartData(totalDeposited: number, totalYieldEarned: number) {
  const points = 30;
  const now = Date.now();
  const DAY_MS = 86400_000;
  return Array.from({ length: points }, (_, i) => {
    const date = new Date(now - (points - i) * DAY_MS);
    const progress = i / (points - 1);
    // Slightly realistic curve: slow start, faster towards end
    const curved = Math.pow(progress, 0.7);
    const value = totalDeposited + totalYieldEarned * curved;
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.round(value),
    };
  });
}

function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-28 bg-card" />
        ))}
      </div>
      <div className="card h-64 bg-card" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-48 bg-card" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isConnected, address } = useAccount();
  const { data: positions, isLoading, isError, dataUpdatedAt } = usePositions();
  const { data: poolData } = usePoolData();
  const { data: portfolio } = useWalletPortfolio();
  const { totalDeposited, totalYieldEarned, weightedAPY, yieldScore, strategyTags } =
    useYieldData(positions);

  const chartData = useMemo(
    () => generateChartData(totalDeposited, totalYieldEarned),
    [totalDeposited, totalYieldEarned]
  );

  // Determine if data is real on-chain positions or mock
  const REAL_PROTOCOLS = new Set(['Aave V3', 'Avon', 'Prism', 'Kumbaya']);
  const hasRealPositions = positions?.some((p) => REAL_PROTOCOLS.has(p.protocol));
  const isMockData = !hasRealPositions && (positions?.length ?? 0) > 0;
  const liveProtocols = positions
    ?.filter((p) => REAL_PROTOCOLS.has(p.protocol))
    .map((p) => p.protocol)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="text-5xl mb-6">📊</div>
        <h1 className="text-3xl font-bold text-white mb-4">Connect your wallet</h1>
        <p className="text-gray-400 mb-8 max-w-md mx-auto">
          Connect your wallet to see your yield-earning positions across DeFi protocols and get your Yield Score.
        </p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-500 font-mono">{truncateAddress(address!)}</p>
            {isMockData && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
                Demo data — no Aave positions found on Sepolia
              </span>
            )}
            {hasRealPositions && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent">
                Live · {liveProtocols}
              </span>
            )}
          </div>
        </div>
        {strategyTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {strategyTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-3 py-1 rounded-full border border-accent/30 text-accent bg-accent/5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && <SkeletonDashboard />}

      {/* Error */}
      {isError && !isLoading && (
        <div className="card text-center py-12 text-gray-500 border-red-500/20">
          <p className="text-red-400 mb-2 font-medium">Failed to load positions</p>
          <p className="text-sm">Could not reach the blockchain. Please check your connection.</p>
        </div>
      )}

      {/* Dashboard content */}
      {!isLoading && !isError && (
        <div className="space-y-4">
          {/* Chart first — compact, at the top */}
          <YieldChart data={chartData} compact />

          {/* Stats bar */}
          <YieldSummary
            totalDeposited={totalDeposited}
            totalYieldEarned={totalYieldEarned}
            weightedAPY={weightedAPY}
            yieldScore={yieldScore}
          />

          {/* Wallet Holdings */}
          {portfolio && portfolio.holdings.length > 0 && (
            <div className="card !py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white">Wallet Holdings</p>
                <p className="text-sm font-bold text-white">{formatUSD(portfolio.totalValueUSD)}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {portfolio.holdings.map((h) => (
                  <div key={h.address} className="flex items-center gap-2 py-1.5">
                    {h.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.logo} alt={h.symbol} className="w-6 h-6 rounded-full shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-gray-400 shrink-0 font-medium">
                        {h.symbol[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{h.symbol}</p>
                      <p className="text-xs text-gray-500">
                        {h.priceUSD > 0 ? formatUSD(h.valueUSD) : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* Positions */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">
                Active Positions
                {positions && positions.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({positions.length})
                  </span>
                )}
              </h2>
              {isMockData && (
                <p className="text-xs text-gray-500">
                  Showing demo positions · Fund your Sepolia wallet on Aave to see real data
                </p>
              )}
            </div>

            {positions && positions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {positions.map((position, i) => (
                  <PositionCard
                    key={`${position.protocol}-${position.asset}-${i}`}
                    position={position}
                    isMock={isMockData}
                    livePoolAPY={
                      position.positionType === 'lp'
                        ? poolAPYByAddress(poolData, position.assetAddress)
                        : undefined
                    }
                    dataUpdatedAt={dataUpdatedAt}
                  />
                ))}
              </div>
            ) : (
              <div className="card text-center py-16">
                <p className="text-3xl mb-3">🌱</p>
                <p className="font-medium text-white mb-2">No positions found</p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  No active supply positions detected on Aave V3 Sepolia for this wallet.
                  Try depositing some test tokens on{' '}
                  <a
                    href="https://app.aave.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue hover:underline"
                  >
                    app.aave.com
                  </a>
                  .
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-center pt-2">
            <Link href="/leaderboard" className="btn-secondary">
              View Leaderboard →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
