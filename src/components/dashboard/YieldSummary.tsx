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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Portfolio */}
      <div className="card">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Portfolio Value</p>
        <p className="text-2xl font-bold text-white">{formatUSD(totalDeposited)}</p>
        {totalYieldEarned > 0 && (
          <p className="text-xs text-green-400 mt-1">+{formatUSD(totalYieldEarned)} yield earned</p>
        )}
      </div>

      {/* Total Yield */}
      <div className="card">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Yield Earned</p>
        <p className="text-2xl font-bold text-green-400">+{formatUSD(totalYieldEarned)}</p>
        {returnPct > 0 && (
          <p className="text-xs text-gray-500 mt-1">{returnPct.toFixed(2)}% total return</p>
        )}
      </div>

      {/* Weighted APY */}
      <div className="card">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Weighted APY</p>
        <p className="text-2xl font-bold text-accent">{formatAPY(weightedAPY)}</p>
        <p className="text-xs text-gray-500 mt-1">across all positions</p>
      </div>

      {/* Yield Score — numbers only */}
      <div className="card">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Yield Score</p>
        <div className="flex items-baseline gap-1.5">
          <p className={`text-2xl font-bold ${scoreColor(yieldScore)}`}>{yieldScore}</p>
          <p className="text-sm text-gray-600">/ 100</p>
        </div>
        <p className={`text-xs mt-1 ${scoreColor(yieldScore)}`}>{scoreTier}</p>
      </div>
    </div>
  );
}
