'use client';

import { formatUSD, formatAPY, scoreColor } from '@/lib/utils';

interface Props {
  totalDeposited: number;
  totalYieldEarned: number;
  weightedAPY: number;
  yieldScore: number;
}

export function YieldSummary({ totalDeposited, totalYieldEarned, weightedAPY, yieldScore }: Props) {
  const returnPct =
    totalDeposited > 0 ? (totalYieldEarned / totalDeposited) * 100 : 0;

  const scoreTier =
    yieldScore >= 80 ? 'Excellent' :
    yieldScore >= 60 ? 'Good' :
    yieldScore >= 40 ? 'Fair' : 'Building';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden">
      {/* Portfolio Value */}
      <div className="bg-card px-4 py-3">
        <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide">Portfolio</p>
        <p className="text-lg font-bold text-white">{formatUSD(totalDeposited)}</p>
        {totalYieldEarned > 0 && (
          <p className="text-xs text-green-400">+{formatUSD(totalYieldEarned)} yield</p>
        )}
      </div>

      {/* Yield Earned */}
      <div className="bg-card px-4 py-3">
        <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide">Yield Earned</p>
        <p className="text-lg font-bold text-green-400">+{formatUSD(totalYieldEarned)}</p>
        {returnPct > 0 && (
          <p className="text-xs text-gray-600">{returnPct.toFixed(2)}% return</p>
        )}
      </div>

      {/* Weighted APY */}
      <div className="bg-card px-4 py-3">
        <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide">Weighted APY</p>
        <p className="text-lg font-bold text-accent">{formatAPY(weightedAPY)}</p>
        <p className="text-xs text-gray-600">across all positions</p>
      </div>

      {/* Yield Score */}
      <div className="bg-card px-4 py-3">
        <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide">Yield Score</p>
        <div className="flex items-baseline gap-1">
          <p className={`text-lg font-bold ${scoreColor(yieldScore)}`}>{yieldScore}</p>
          <p className="text-xs text-gray-600">/ 100</p>
        </div>
        <p className={`text-xs ${scoreColor(yieldScore)}`}>{scoreTier}</p>
      </div>
    </div>
  );
}
