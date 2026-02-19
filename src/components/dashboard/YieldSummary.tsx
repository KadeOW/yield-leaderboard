'use client';

import { useEffect, useState } from 'react';
import { formatUSD, formatAPY, scoreColor } from '@/lib/utils';

interface Props {
  totalDeposited: number;
  totalYieldEarned: number;
  weightedAPY: number;
  yieldScore: number;
}

function ScoreGauge({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0);

  // Animate score on mount
  useEffect(() => {
    if (score === 0) return;
    const duration = 800;
    const start = performance.now();
    const from = 0;

    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + (score - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  // SVG arc gauge
  const size = 96;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // half circle
  const arc = (displayed / 100) * circumference;

  const color =
    score >= 80
      ? '#00FF94'
      : score >= 60
      ? '#facc15'
      : score >= 40
      ? '#fb923c'
      : '#f87171';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 8 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ marginTop: -(size / 2) }}>
          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.5s ease-out, stroke 0.3s' }}
          />
        </svg>
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center"
        >
          <span className="text-2xl font-bold" style={{ color }}>
            {displayed}
          </span>
          <span className="text-xs text-gray-500">/ 100</span>
        </div>
      </div>
    </div>
  );
}

export function YieldSummary({ totalDeposited, totalYieldEarned, weightedAPY, yieldScore }: Props) {
  const returnPct =
    totalDeposited > 0 ? (totalYieldEarned / totalDeposited) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Portfolio */}
      <div className="card">
        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Portfolio Value</p>
        <p className="text-2xl font-bold text-white">{formatUSD(totalDeposited)}</p>
        {totalYieldEarned > 0 && (
          <p className="text-xs text-green-400 mt-1">
            +{formatUSD(totalYieldEarned)} yield earned
          </p>
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

      {/* Yield Score gauge */}
      <div className="card flex flex-col items-center justify-center pt-2">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide self-start">Yield Score</p>
        <ScoreGauge score={yieldScore} />
      </div>
    </div>
  );
}
