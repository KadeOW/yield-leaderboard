'use client';

import type { Position } from '@/types';
import { formatUSD, formatAPY, formatPositionAge, formatTokenAmount } from '@/lib/utils';

const PROTOCOL_COLORS: Record<string, string> = {
  'Aave V3': 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  Morpho: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  Lido: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  'Uniswap V3': 'bg-pink-500/10 border-pink-500/30 text-pink-400',
  'Compound V3': 'bg-green-500/10 border-green-500/30 text-green-400',
  Spark: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  Avon: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  Prism: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  Kumbaya: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
};

const POSITION_TYPE_LABEL: Record<string, string> = {
  lending: 'Supply',
  staking: 'Staking',
  lp: 'LP',
  bond: 'Bond',
};

const TOKEN_EMOJI: Record<string, string> = {
  WETH: '⟠',
  ETH: '⟠',
  USDC: '💵',
  USDT: '💵',
  DAI: '💵',
  USDM: '💵',
  GHO: '👻',
  WBTC: '₿',
  LINK: '🔗',
  AAVE: '👻',
  EURS: '💶',
  stETH: '⟠',
  wstETH: '⟠',
  'ETH/USDC': '⟠',
};

interface Props {
  position: Position;
  isMock?: boolean;
  livePoolAPY?: number; // current fee APY for this pool from GeckoTerminal
}

export function PositionCard({ position, isMock, livePoolAPY }: Props) {
  const protocolColor =
    PROTOCOL_COLORS[position.protocol] ?? 'bg-accent/10 border-accent/30 text-accent';
  const positionLabel = POSITION_TYPE_LABEL[position.positionType] ?? position.positionType;
  const tokenEmoji = TOKEN_EMOJI[position.asset] ?? '🪙';
  const ageDays = formatPositionAge(position.entryTimestamp);

  // APY bar: green at high APY, yellow at medium, shows relative performance
  const apyBarWidth = Math.min((position.currentAPY / 25) * 100, 100);
  const apyBarColor =
    position.currentAPY >= 10
      ? 'bg-accent'
      : position.currentAPY >= 5
      ? 'bg-yellow-400'
      : 'bg-blue-400';

  return (
    <div className="card-hover group relative overflow-hidden">
      {/* Top-right badges */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {position.inRange === true && (
          <div className="text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">
            In Range
          </div>
        )}
        {position.inRange === false && (
          <div className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
            Out of Range
          </div>
        )}
        {isMock && (
          <div className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
            Demo
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{tokenEmoji}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{position.asset}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${protocolColor}`}
              >
                {position.protocol}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5 capitalize">{positionLabel} position</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Value</p>
          {position.depositedUSD > 0 ? (
            <p className="font-semibold text-white">{formatUSD(position.depositedUSD)}</p>
          ) : (
            <p className="font-semibold text-gray-500 text-sm">Price unknown</p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Yield Earned</p>
          <p className="font-semibold text-green-400">+{formatUSD(position.yieldEarned)}</p>
          {position.depositedUSD > 0 && position.yieldEarned > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">
              {((position.yieldEarned / position.depositedUSD) * 100).toFixed(2)}% return
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">
            {position.positionType === 'lp' ? 'Your Earned APY' : 'Current APY'}
          </p>
          <p className="font-bold text-accent">{formatAPY(position.currentAPY)}</p>
          {/* APY bar */}
          <div className="h-1 bg-border rounded-full overflow-hidden mt-1.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${apyBarColor}`}
              style={{ width: `${apyBarWidth}%` }}
            />
          </div>
        </div>
        {livePoolAPY !== undefined && (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">
              Pool APY
              <span className="ml-1 text-gray-600 text-[10px]">live</span>
            </p>
            <p className="font-bold text-cyan-400">{formatAPY(livePoolAPY)}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Position Age</p>
          <p className="font-semibold text-white">{ageDays}</p>
          <p className="text-xs text-gray-600 mt-0.5 capitalize">{position.positionType}</p>
        </div>
      </div>

      {/* Bottom accent line on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}
