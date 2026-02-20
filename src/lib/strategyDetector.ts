import type { Position } from '@/types';

// ─── Token / Protocol Knowledge Base ─────────────────────────────────────────

// Known yield-bearing tokens and their origin protocol
export const YIELD_TOKENS: Record<string, { protocol: string; underlyingSymbol: string }> = {
  // Avon vault share token address (ERC-4626 vault = the ERC-20 share token)
  '0x2ea493384f42d7ea78564f3ef4c86986eab4a890': { protocol: 'Avon', underlyingSymbol: 'USDM' },
};

// Token symbols that are Avon output (the vault share ERC-20 symbol may vary)
const AVON_OUTPUT_SYMBOLS = new Set(['usdmy', 'avon-usdm', 'ausm']);

const PROTOCOL_META: Record<string, { url: string; emoji: string; color: string }> = {
  Avon:    { url: 'https://www.avon.xyz/',    emoji: '🌿', color: '#10b981' },
  Prism:   { url: 'https://prismfi.cc/',      emoji: '💎', color: '#8b5cf6' },
  Kumbaya: { url: 'https://www.kumbaya.xyz/', emoji: '🌊', color: '#06b6d4' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyStep {
  stepNumber: number;
  protocol: string;
  emoji: string;
  color: string;
  action: string;
  inputToken: string;
  outputToken: string;
  apy: number;
  url: string;
  positionValue: number;
}

export interface DetectedStrategy {
  name: string;
  description: string;
  steps: StrategyStep[];
  baseAPY: number;      // first step (vault) APY
  bonusAPY: number;     // additional APY from subsequent steps
  totalAPY: number;
  complexity: 'Simple' | 'Intermediate' | 'Advanced';
  tags: string[];
  isLoop: boolean;      // true when a yield-bearing output is re-deployed
  totalValue: number;
}

// ─── Detection logic ──────────────────────────────────────────────────────────

/**
 * Checks if an LP asset string contains USDM or known Avon output tokens —
 * indicating the Avon vault output is being re-deployed into an LP pool.
 */
function lpContainsAvonOutput(assetStr: string): boolean {
  const lower = assetStr.toLowerCase();
  // Direct USDM in LP pair
  if (lower.includes('usdm')) return true;
  // Avon share token symbol variations
  for (const sym of AVON_OUTPUT_SYMBOLS) {
    if (lower.includes(sym)) return true;
  }
  return false;
}

/**
 * Analyses a wallet's positions and builds a multi-step strategy descriptor.
 * Returns null if there are no meaningful yield-generating positions.
 */
export function detectStrategy(positions: Position[]): DetectedStrategy | null {
  if (!positions || positions.length === 0) return null;

  const avonPositions    = positions.filter((p) => p.protocol === 'Avon');
  const prismPositions   = positions.filter((p) => p.protocol === 'Prism');
  const kumbayaPositions = positions.filter((p) => p.protocol === 'Kumbaya');
  const lpPositions      = [...prismPositions, ...kumbayaPositions];
  const otherPositions   = positions.filter(
    (p) => !['Avon', 'Prism', 'Kumbaya'].includes(p.protocol)
  );

  const hasAvon = avonPositions.length > 0;

  // LP positions that actually use Avon output (USDM/USDMy) — these form the loop
  const loopLP      = lpPositions.filter((p) => lpContainsAvonOutput(p.asset));
  // LP positions unrelated to the Avon loop (e.g. KPI/WETH, ETH/USDC, etc.)
  const standaloneLP = lpPositions.filter((p) => !lpContainsAvonOutput(p.asset));

  const isLoop = hasAvon && loopLP.length > 0;

  const steps: StrategyStep[] = [];

  // Step 1 — Avon vault (loop chain entry)
  if (hasAvon) {
    const pos = avonPositions[0];
    steps.push({
      stepNumber: 1,
      protocol: 'Avon',
      emoji: '🌿',
      color: '#10b981',
      action: 'Deposit USDM, receive USDMy',
      inputToken: 'USDM',
      outputToken: 'USDMy',
      apy: pos.currentAPY,
      url: 'https://www.avon.xyz/',
      positionValue: pos.depositedUSD,
    });
  }

  // Loop LP steps — only LPs whose pair contains USDMy/USDM
  for (const pos of loopLP) {
    const meta = PROTOCOL_META[pos.protocol] ?? { url: '#', emoji: '🏦', color: '#6b7280' };
    steps.push({
      stepNumber: steps.length + 1,
      protocol: pos.protocol,
      emoji: meta.emoji,
      color: meta.color,
      action: `Provide ${pos.asset} liquidity`,
      inputToken: 'USDMy',
      outputToken: 'LP Fees',
      apy: pos.currentAPY,
      url: meta.url,
      positionValue: pos.depositedUSD,
    });
  }

  // Standalone LP steps — unrelated to the Avon loop
  for (const pos of standaloneLP) {
    const meta = PROTOCOL_META[pos.protocol] ?? { url: '#', emoji: '🏦', color: '#6b7280' };
    const [token0] = pos.asset.split('/');
    steps.push({
      stepNumber: steps.length + 1,
      protocol: pos.protocol,
      emoji: meta.emoji,
      color: meta.color,
      action: `Provide ${pos.asset} liquidity`,
      inputToken: token0,
      outputToken: 'LP Fees',
      apy: pos.currentAPY,
      url: meta.url,
      positionValue: pos.depositedUSD,
    });
  }

  // Other protocols (Aave, etc.)
  for (const pos of otherPositions) {
    const meta = PROTOCOL_META[pos.protocol] ?? { url: '#', emoji: '🏦', color: '#6b7280' };
    steps.push({
      stepNumber: steps.length + 1,
      protocol: pos.protocol,
      emoji: meta.emoji,
      color: meta.color,
      action: `Deposit ${pos.asset}`,
      inputToken: pos.asset,
      outputToken: `a${pos.asset}`,
      apy: pos.currentAPY,
      url: meta.url,
      positionValue: pos.depositedUSD,
    });
  }

  if (steps.length === 0) return null;

  const baseAPY  = steps[0]?.apy ?? 0;
  const bonusAPY = steps.slice(1).reduce((s, st) => s + st.apy, 0);
  const totalAPY = baseAPY + bonusAPY;
  const totalValue = steps.reduce((s, st) => s + st.positionValue, 0);

  const complexity: DetectedStrategy['complexity'] =
    steps.length >= 3 ? 'Advanced' : steps.length === 2 ? 'Intermediate' : 'Simple';

  // Name generation — based only on the loop chain, not standalone LPs
  const loopProtocols = [
    ...(hasAvon ? ['Avon'] : []),
    ...loopLP.map((p) => p.protocol),
  ];
  const allProtocols = [...new Set(steps.map((s) => s.protocol))];
  const name = isLoop
    ? `Yield Loop: ${loopProtocols.join(' → ')}`
    : steps.length > 1
    ? `Multi-Protocol: ${allProtocols.join(' → ')}`
    : `${steps[0].protocol} Vault`;

  const standaloneDesc = standaloneLP.length > 0
    ? ` Also providing independent liquidity in ${standaloneLP.map((p) => p.asset).join(', ')}.`
    : '';

  const description = isLoop
    ? `Deposits USDM into Avon to earn vault yield and receive USDMy, then re-deploys USDMy as liquidity in ${loopLP.map((p) => p.protocol).join(' and ')} to stack LP fees on top.${standaloneDesc}`
    : lpPositions.length > 0
    ? `Provides concentrated liquidity across ${lpPositions.map((p) => p.protocol).join(' and ')} to capture trading fees.`
    : `Earns stable yield via the Avon USDM vault.`;

  const tags: string[] = [];
  if (isLoop) tags.push('Yield Loop');
  if (hasAvon) tags.push('Stablecoin');
  if (lpPositions.length > 0) tags.push('LP');
  if (prismPositions.length > 0) tags.push('Prism');
  if (kumbayaPositions.length > 0) tags.push('Kumbaya');

  return { name, description, steps, baseAPY, bonusAPY, totalAPY, complexity, tags, isLoop, totalValue };
}
