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
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(score * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [score]);

  // Self-contained SVG gauge — no negative margins, no overflow
  const W = 110;
  const strokeWidth = 9;
  const radius = 44;
  const cx = W / 2;
  const cy = radius + strokeWidth / 2; // y of arc endpoints (arc peaks at y ≈ strokeWidth/2)
  const H = cy + 32;                   // room for score text below endpoints

  const circumference = Math.PI * radius;
  const arc = (displayed / 100) * circumference;

  const color =
    score >= 80
      ? '#00FF94'
      : score >= 60
      ? '#facc15'
      : score >= 40
      ? '#fb923c'
      : '#f87171';

  const sx = strokeWidth / 2;
  const ex = W - strokeWidth / 2;

  return (
    <div className="flex items-center justify-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Background track */}
        <path
          d={`M ${sx} ${cy} A ${radius} ${radius} 0 0 1 ${ex} ${cy}`}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${sx} ${cy} A ${radius} ${radius} 0 0 1 ${ex} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.5s ease-out, stroke 0.3s' }}
        />
        {/* Score number */}
        <text x={cx} y={cy + 10} textAnchor="middle" fill={color} fontSize="24" fontWeight="bold" fontFamily="inherit">
          {displayed}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fill="#6b7280" fontSize="11" fontFamily="inherit">
          / 100
        </text>
      </svg>
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
