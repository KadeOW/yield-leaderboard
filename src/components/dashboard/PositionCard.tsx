'use client';

import type { Position } from '@/types';
import { formatUSD, formatAPY, formatPositionAge, formatTokenAmount } from '@/lib/utils';
import { tickToAdjustedPrice } from '@/lib/uniswapMath';

// ─── LP Range Gauge ───────────────────────────────────────────────────────────

function formatPriceLabel(priceInToken1: number, t1PriceUSD: number, t1Symbol: string): string {
  const usd = priceInToken1 * t1PriceUSD;
  if (usd > 0) {
    if (usd < 0.0001) return `$${usd.toExponential(2)}`;
    if (usd < 0.01) return `$${usd.toFixed(5)}`;
    if (usd < 1) return `$${usd.toFixed(4)}`;
    if (usd < 10) return `$${usd.toFixed(3)}`;
    if (usd < 10000) return `$${usd.toFixed(2)}`;
    return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  // Fall back to raw ratio when USD price unavailable
  if (priceInToken1 < 0.0001) return priceInToken1.toExponential(2);
  if (priceInToken1 < 1) return priceInToken1.toFixed(5);
  return `${priceInToken1.toFixed(4)} ${t1Symbol}`;
}

function LPRangeGauge({ position }: { position: Position }) {
  const { tickLower, tickUpper, tickCurrent, token0Decimals, token1Decimals, token0Symbol, token1Symbol, token0Amount, token1Amount, token0PriceUSD = 0, token1PriceUSD = 0, inRange } = position;

  if (tickLower === undefined || tickUpper === undefined || tickCurrent === undefined) return null;

  const d0 = token0Decimals ?? 18;
  const d1 = token1Decimals ?? 18;

  // Where is the current tick within the range? 0 = at lower, 1 = at upper
  const rangeSpan = tickUpper - tickLower;
  const rawPct = rangeSpan > 0 ? (tickCurrent - tickLower) / rangeSpan : 0.5;
  const clampedPct = Math.max(0, Math.min(1, rawPct));

  // Near-edge warning when within 15% of either boundary (and still in range)
  const nearEdge = inRange && (rawPct < 0.15 || rawPct > 0.85);
  const nearLower = nearEdge && rawPct < 0.15;

  // Tick → decimal-adjusted price of token0 in token1
  const priceLower = tickToAdjustedPrice(tickLower, d0, d1);
  const priceUpper = tickToAdjustedPrice(tickUpper, d0, d1);
  const priceCurrent = token0PriceUSD > 0 && token1PriceUSD > 0
    ? token0PriceUSD / token1PriceUSD  // live ratio from slot0
    : tickToAdjustedPrice(tickCurrent, d0, d1);

  // Bar colour
  const barColor = !inRange ? 'bg-red-500' : nearEdge ? 'bg-yellow-400' : 'bg-accent';
  const statusText = !inRange
    ? (rawPct <= 0 ? `Below range` : `Above range`)
    : nearEdge
    ? (nearLower ? 'Near lower edge — may go out of range' : 'Near upper edge — may go out of range')
    : 'In range';
  const statusColor = !inRange ? 'text-red-400' : nearEdge ? 'text-yellow-400' : 'text-accent';

  // Token amount display
  const hasAmounts = token0Amount !== undefined && token1Amount !== undefined;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Status label */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium">LP Range</p>
        <p className={`text-xs font-semibold ${statusColor}`}>{statusText}</p>
      </div>

      {/* Range bar */}
      <div className="relative mb-3">
        {/* Track */}
        <div className="h-2 rounded-full bg-white/[0.06] relative overflow-visible">
          {/* Filled portion */}
          {inRange && (
            <div
              className={`absolute top-0 left-0 h-full rounded-full opacity-20 ${barColor}`}
              style={{ width: `${clampedPct * 100}%` }}
            />
          )}
          {/* Current price marker */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background shadow ${barColor} transition-all`}
            style={{ left: `calc(${clampedPct * 100}% - 6px)` }}
          />
        </div>

        {/* Tick labels below the bar */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-gray-600 leading-tight">
            {formatPriceLabel(priceLower, token1PriceUSD, token1Symbol ?? '')}
          </span>
          <span className={`text-[10px] font-semibold leading-tight ${statusColor}`}>
            {formatPriceLabel(priceCurrent, token1PriceUSD, token1Symbol ?? '')}
          </span>
          <span className="text-[10px] text-gray-600 leading-tight text-right">
            {formatPriceLabel(priceUpper, token1PriceUSD, token1Symbol ?? '')}
          </span>
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-700">Lower</span>
          <span className="text-[9px] text-gray-700">Current ({token0Symbol}/{token1Symbol})</span>
          <span className="text-[9px] text-gray-700 text-right">Upper</span>
        </div>
      </div>

      {/* Token composition */}
      {hasAmounts && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="font-mono">
            <span className="text-white font-semibold">
              {(token0Amount ?? 0) < 0.0001 ? (token0Amount ?? 0).toExponential(2) : (token0Amount ?? 0).toFixed(4)}
            </span>
            {' '}{token0Symbol}
          </span>
          <span className="text-gray-700">+</span>
          <span className="font-mono">
            <span className="text-white font-semibold">
              {(token1Amount ?? 0) < 0.0001 ? (token1Amount ?? 0).toExponential(2) : (token1Amount ?? 0).toFixed(4)}
            </span>
            {' '}{token1Symbol}
          </span>
        </div>
      )}
    </div>
  );
}

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
  dataUpdatedAt?: number; // unix ms from React Query — drives the live indicator
}

export function PositionCard({ position, isMock, livePoolAPY, dataUpdatedAt }: Props) {
  const protocolColor =
    PROTOCOL_COLORS[position.protocol] ?? 'bg-accent/10 border-accent/30 text-accent';
  const positionLabel = POSITION_TYPE_LABEL[position.positionType] ?? position.positionType;
  const tokenEmoji = TOKEN_EMOJI[position.asset] ?? '🪙';
  const ageDays = formatPositionAge(position.entryTimestamp);
  const isLP = position.positionType === 'lp';

  // APY bar (non-LP only)
  const apyBarWidth = Math.min((position.currentAPY / 25) * 100, 100);
  const apyBarColor =
    position.currentAPY >= 10
      ? 'bg-accent'
      : position.currentAPY >= 5
      ? 'bg-yellow-400'
      : 'bg-blue-400';

  // How long since last data refresh
  const secsAgo = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <div className="card-hover group relative overflow-hidden">
      {/* Top-right badges */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {isLP && secsAgo !== null && (
          <div className="flex items-center gap-1 text-[10px] text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
            {secsAgo < 5 ? 'live' : `${secsAgo}s ago`}
          </div>
        )}
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
              <span className={`text-xs px-2 py-0.5 rounded-full border ${protocolColor}`}>
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
        <div className="group/fees cursor-default">
          <p className="text-xs text-gray-500 mb-0.5">
            {isLP ? (
              <>Uncollected Fees <span className="text-gray-700 text-[10px]">hover</span></>
            ) : 'Yield Earned'}
          </p>
          <p className="font-semibold text-green-400">+{formatUSD(position.yieldEarned)}</p>
          {position.depositedUSD > 0 && position.yieldEarned > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">
              {((position.yieldEarned / position.depositedUSD) * 100).toFixed(2)}% of position
            </p>
          )}
          {/* Per-token fee breakdown — shown on hover for LP positions */}
          {isLP && (position.feeToken0Amount !== undefined || position.feeToken1Amount !== undefined) && (
            <div className="hidden group-hover/fees:block mt-2 space-y-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-gray-500 mb-1 font-medium">Claimable breakdown</p>
              {position.feeToken0Amount !== undefined && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-white">
                    {position.feeToken0Amount < 0.000001
                      ? position.feeToken0Amount.toExponential(3)
                      : position.feeToken0Amount < 0.001
                      ? position.feeToken0Amount.toFixed(7)
                      : position.feeToken0Amount.toFixed(6)}
                  </span>
                  <span className="text-[11px] text-gray-400">{position.token0Symbol}</span>
                </div>
              )}
              {position.feeToken1Amount !== undefined && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-white">
                    {position.feeToken1Amount < 0.000001
                      ? position.feeToken1Amount.toExponential(3)
                      : position.feeToken1Amount < 0.001
                      ? position.feeToken1Amount.toFixed(7)
                      : position.feeToken1Amount.toFixed(6)}
                  </span>
                  <span className="text-[11px] text-gray-400">{position.token1Symbol}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* LP: show live Pool APY in the third cell; non-LP: show Current APY with bar */}
        {isLP ? (
          <div>
            <p className="text-xs text-gray-500 mb-0.5">
              Pool APY
              {livePoolAPY !== undefined && (
                <span className="ml-1 text-[10px] text-accent/60">↻ 5m</span>
              )}
            </p>
            {livePoolAPY !== undefined ? (
              <p className="font-bold text-accent">{formatAPY(livePoolAPY)}</p>
            ) : (
              <p className="font-bold text-gray-500 text-sm">—</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-1">Current APY</p>
            <p className="font-bold text-accent">{formatAPY(position.currentAPY)}</p>
            <div className="h-1 bg-border rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${apyBarColor}`}
                style={{ width: `${apyBarWidth}%` }}
              />
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-500 mb-0.5">Position Age</p>
          <p className="font-semibold text-white">{ageDays}</p>
          <p className="text-xs text-gray-600 mt-0.5 capitalize">{position.positionType}</p>
        </div>
      </div>

      {/* LP range gauge */}
      {position.positionType === 'lp' && <LPRangeGauge position={position} />}

      {/* Bottom accent line on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}
