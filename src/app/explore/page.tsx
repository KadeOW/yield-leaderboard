'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { usePositions } from '@/hooks/usePositions';
import { detectStrategy, type DetectedStrategy, type StrategyStep } from '@/lib/strategyDetector';
import { scanForLoopStrategists, type DiscoveredWalletStrategy } from '@/lib/strategyScanner';
import { truncateAddress, formatUSD, formatAPY } from '@/lib/utils';
import { ConnectButton } from '@/components/wallet/ConnectButton';

// ─── Opportunities data ───────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  protocol: string;
  chain: string;
  asset: string;
  type: 'lending' | 'dex' | 'staking';
  apyMin: number;
  apyMax: number;
  tvlNote: string;
  risk: 'low' | 'medium' | 'high';
  description: string;
  url: string;
  logoEmoji: string;
  color: string;
  activeGlow: string;
  tags: string[];
}

const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'avon-usdm',
    protocol: 'Avon',
    chain: 'MegaETH',
    asset: 'USDM',
    type: 'lending',
    apyMin: 7,
    apyMax: 10,
    tvlNote: 'Stablecoin vault',
    risk: 'low',
    description: 'ERC-4626 yield vault accepting USDM stablecoin. Auto-compounding with no lock-up.',
    url: 'https://www.avon.xyz/',
    logoEmoji: '🌿',
    color: 'border-emerald-500/30 bg-emerald-500/5',
    activeGlow: '0 0 0 1px rgba(16,185,129,0.5), 0 0 24px rgba(16,185,129,0.2)',
    tags: ['Stablecoin', 'Auto-compound', 'ERC-4626'],
  },
  {
    id: 'prism-weth',
    protocol: 'Prism',
    chain: 'MegaETH',
    asset: 'Token/WETH pairs',
    type: 'dex',
    apyMin: 15,
    apyMax: 60,
    tvlNote: 'Concentrated liquidity',
    risk: 'low',
    description: "Uniswap V3 fork on MegaETH. Concentrated liquidity pools with high fee capture from MegaETH's fast block throughput.",
    url: 'https://prismfi.cc/',
    logoEmoji: '💎',
    color: 'border-violet-500/30 bg-violet-500/5',
    activeGlow: '0 0 0 1px rgba(139,92,246,0.5), 0 0 24px rgba(139,92,246,0.2)',
    tags: ['Concentrated LP', 'Active management', 'UniV3 fork'],
  },
  {
    id: 'kumbaya-weth',
    protocol: 'Kumbaya',
    chain: 'MegaETH',
    asset: 'Token/WETH pairs',
    type: 'dex',
    apyMin: 20,
    apyMax: 200,
    tvlNote: 'Concentrated liquidity',
    risk: 'low',
    description: 'High-throughput AMM on MegaETH. Emerging token pairs with deep liquidity incentives and real-time fee generation.',
    url: 'https://www.kumbaya.xyz/',
    logoEmoji: '🌊',
    color: 'border-cyan-500/30 bg-cyan-500/5',
    activeGlow: '0 0 0 1px rgba(6,182,212,0.5), 0 0 24px rgba(6,182,212,0.2)',
    tags: ['High APY', 'New pairs', 'UniV3 fork'],
  },
];

const RISK_COLORS = {
  low:    'text-accent bg-accent/10 border-accent/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  high:   'text-red-400 bg-red-400/10 border-red-400/20',
};
const TYPE_LABELS = { lending: 'Lending', dex: 'DEX', staking: 'Staking' };
const TYPE_COLORS = {
  lending: 'text-purple-400 bg-purple-400/10',
  dex:     'text-cyan-400 bg-cyan-400/10',
  staking: 'text-blue-400 bg-blue-400/10',
};

// ─── Strategy data ────────────────────────────────────────────────────────────

const CURATED: DetectedStrategy[] = [
  {
    name: 'Yield Loop: Avon → Kumbaya',
    description: 'Deposit USDM into Avon to earn vault yield and receive USDMy. Re-deploy USDMy as liquidity in a Kumbaya pool to stack LP fees on top.',
    isLoop: true, complexity: 'Intermediate', baseAPY: 8, bonusAPY: 60, totalAPY: 68, totalValue: 0,
    tags: ['Yield Loop', 'Stablecoin', 'Kumbaya'],
    steps: [
      { stepNumber: 1, protocol: 'Avon',    emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy',  inputToken: 'USDM',  outputToken: 'USDMy',   apy: 8,  url: 'https://www.avon.xyz/',    positionValue: 0 },
      { stepNumber: 2, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: 'Provide USDMy/WETH liquidity', inputToken: 'USDMy', outputToken: 'LP Fees', apy: 60, url: 'https://www.kumbaya.xyz/', positionValue: 0 },
    ],
  },
  {
    name: 'Yield Loop: Avon → Prism',
    description: 'Deposit USDM into Avon, then use USDMy shares as one side of a concentrated LP on Prism — earning vault yield and swap fees simultaneously.',
    isLoop: true, complexity: 'Intermediate', baseAPY: 8, bonusAPY: 25, totalAPY: 33, totalValue: 0,
    tags: ['Yield Loop', 'Stablecoin', 'Prism'],
    steps: [
      { stepNumber: 1, protocol: 'Avon',  emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy',  inputToken: 'USDM',  outputToken: 'USDMy',   apy: 8,  url: 'https://www.avon.xyz/', positionValue: 0 },
      { stepNumber: 2, protocol: 'Prism', emoji: '💎', color: '#8b5cf6', action: 'Provide USDMy/WETH liquidity', inputToken: 'USDMy', outputToken: 'LP Fees', apy: 25, url: 'https://prismfi.cc/',   positionValue: 0 },
    ],
  },
  {
    name: 'Double Loop: Avon → Kumbaya + Prism',
    description: 'Split USDMy across both Kumbaya and Prism to diversify LP risk while maximising fee capture. Vault yield compounds underneath both positions.',
    isLoop: true, complexity: 'Advanced', baseAPY: 8, bonusAPY: 85, totalAPY: 93, totalValue: 0,
    tags: ['Yield Loop', 'Stablecoin', 'Kumbaya', 'Prism', 'Diversified'],
    steps: [
      { stepNumber: 1, protocol: 'Avon',    emoji: '🌿', color: '#10b981', action: 'Deposit USDM, receive USDMy',  inputToken: 'USDM',  outputToken: 'USDMy',   apy: 8,  url: 'https://www.avon.xyz/',    positionValue: 0 },
      { stepNumber: 2, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: 'Provide USDMy/WETH liquidity', inputToken: 'USDMy', outputToken: 'LP Fees', apy: 60, url: 'https://www.kumbaya.xyz/', positionValue: 0 },
      { stepNumber: 3, protocol: 'Prism',   emoji: '💎', color: '#8b5cf6', action: 'Provide USDMy/WETH liquidity', inputToken: 'USDMy', outputToken: 'LP Fees', apy: 25, url: 'https://prismfi.cc/',       positionValue: 0 },
    ],
  },
  {
    name: 'Pure Kumbaya LP',
    description: 'Provide WETH-paired liquidity directly on Kumbaya. Higher capital efficiency if you want direct ETH exposure without the vault layer.',
    isLoop: false, complexity: 'Simple', baseAPY: 80, bonusAPY: 0, totalAPY: 80, totalValue: 0,
    tags: ['LP', 'Kumbaya', 'ETH'],
    steps: [
      { stepNumber: 1, protocol: 'Kumbaya', emoji: '🌊', color: '#06b6d4', action: 'Provide Token/WETH liquidity', inputToken: 'WETH', outputToken: 'LP Fees', apy: 80, url: 'https://www.kumbaya.xyz/', positionValue: 0 },
    ],
  },
];

// ─── Strategy sub-components ──────────────────────────────────────────────────

function StepFlow({ steps }: { steps: StrategyStep[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-300 font-mono">{step.inputToken}</div>
          <span className="text-gray-600">→</span>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
            style={{ borderColor: `${step.color}40`, backgroundColor: `${step.color}10`, color: step.color }}
          >
            <span>{step.emoji}</span>
            <span>{step.protocol}</span>
            <span className="opacity-70">· {formatAPY(step.apy)}</span>
          </div>
          <span className="text-gray-600">→</span>
          {i === steps.length - 1 && (
            <div className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-mono border border-accent/20">{step.outputToken}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CopyRecipe({ strategy }: { strategy: DetectedStrategy }) {
  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Step-by-step</p>
      {strategy.steps.map((step) => (
        <div key={step.stepNumber} className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: `${step.color}20`, color: step.color }}>
            {step.stepNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white"><span className="font-medium">{step.protocol}</span> — {step.action}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Earn <span className="text-accent">{formatAPY(step.apy)}</span> · {step.inputToken} → {step.outputToken}
            </p>
          </div>
          <a href={step.url} target="_blank" rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors shrink-0">
            Open →
          </a>
        </div>
      ))}
    </div>
  );
}

const COMPLEXITY_COLORS = {
  Simple:       'text-accent bg-accent/10 border-accent/20',
  Intermediate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  Advanced:     'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

function StrategyCard({ strategy, walletAddress, isOwn }: { strategy: DetectedStrategy; walletAddress?: string; isOwn?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`card relative ${isOwn ? 'ring-1 ring-accent/30' : ''}`}
      style={isOwn ? { boxShadow: '0 0 24px rgba(0,255,148,0.08)' } : undefined}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {isOwn && <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent">Your Strategy</span>}
        {strategy.isLoop && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400">⟲ Yield Loop</span>}
        <span className={`text-xs px-2 py-0.5 rounded-full border ${COMPLEXITY_COLORS[strategy.complexity]}`}>{strategy.complexity}</span>
        {walletAddress && <span className="text-xs font-mono text-gray-600 ml-auto">{truncateAddress(walletAddress)}</span>}
      </div>
      <h3 className="font-bold text-white mb-1">{strategy.name}</h3>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">{strategy.description}</p>
      <div className="mb-4 overflow-x-auto"><StepFlow steps={strategy.steps} /></div>
      <div className="flex items-center gap-4 mb-4">
        <div><p className="text-xs text-gray-500">Base APY</p><p className="text-lg font-bold text-white">{formatAPY(strategy.baseAPY)}</p></div>
        {strategy.bonusAPY > 0 && (
          <><div className="text-gray-600 text-lg">+</div>
          <div><p className="text-xs text-gray-500">LP Bonus</p><p className="text-lg font-bold text-accent">{formatAPY(strategy.bonusAPY)}</p></div>
          <div className="text-gray-600 text-lg">=</div></>
        )}
        <div><p className="text-xs text-gray-500">Combined</p><p className="text-xl font-bold text-accent">{formatAPY(strategy.totalAPY)}</p></div>
        {strategy.totalValue > 0 && (
          <div className="ml-auto text-right"><p className="text-xs text-gray-500">Value</p><p className="text-sm font-semibold text-white">{formatUSD(strategy.totalValue)}</p></div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {strategy.tags.map((tag) => <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-500">{tag}</span>)}
      </div>
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full py-2 rounded-lg border border-accent/20 text-accent text-sm font-medium hover:bg-accent/5 transition-colors">
        {expanded ? '↑ Hide recipe' : '↓ Copy this strategy'}
      </button>
      {expanded && <CopyRecipe strategy={strategy} />}
    </div>
  );
}

// ─── Opportunities sub-components ─────────────────────────────────────────────

function OpportunityCard({ opp, alreadyIn }: { opp: Opportunity; alreadyIn: boolean }) {
  return (
    <div
      className={`relative card-hover border ${opp.color} transition-shadow duration-300`}
      style={alreadyIn ? { boxShadow: opp.activeGlow } : undefined}
    >
      {alreadyIn && (
        <div className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">Active</div>
      )}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-2xl">{opp.logoEmoji}</div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white">{opp.protocol}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[opp.type]}`}>{TYPE_LABELS[opp.type]}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{opp.chain} · {opp.tvlNote}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3 font-mono">{opp.asset}</p>
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-1">Est. APY Range</p>
        <p className="text-xl font-bold text-accent">{opp.apyMin}% – {opp.apyMax}%</p>
      </div>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">{opp.description}</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {opp.tags.map((tag) => <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-500">{tag}</span>)}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${RISK_COLORS[opp.risk]}`}>{opp.risk} risk</span>
        <a href={opp.url} target="_blank" rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors border border-white/10">
          Open app →
        </a>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'strategies' | 'protocols';

export default function ExplorePage() {
  const [tab, setTab] = useState<Tab>('strategies');
  const [oppFilter, setOppFilter] = useState<'all' | 'lending' | 'dex' | 'staking'>('all');
  const { isConnected } = useAccount();
  const { data: myPositions, isLoading: myLoading } = usePositions();

  const myStrategy = myPositions ? detectStrategy(myPositions) : null;
  const activeProtocols = new Set(myPositions?.map((p) => p.protocol) ?? []);

  const { data: discovered = [], isLoading: scanLoading } = useQuery<DiscoveredWalletStrategy[]>({
    queryKey: ['strategy-scan'],
    queryFn: () => scanForLoopStrategists(6),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: tab === 'strategies',
  });

  const communityStrategies = discovered.length > 0 ? discovered : null;
  const visibleOpps = OPPORTUNITIES.filter((o) => oppFilter === 'all' || o.type === oppFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Explore</h1>
        <p className="text-sm text-gray-500 mt-1">Discover yield strategies and protocols on MegaETH.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-border">
        <button onClick={() => setTab('strategies')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'strategies' ? 'border-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
          Strategies
        </button>
        <button onClick={() => setTab('protocols')}
          className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'protocols' ? 'border-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
          Protocols
        </button>
      </div>

      {/* ── Strategies tab ── */}
      {tab === 'strategies' && (
        <div className="space-y-8">
          {/* How it works */}
          <div className="card border-accent/10 bg-accent/[0.02]">
            <h2 className="font-bold text-white mb-4">How yield looping works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { n: '1️⃣', title: 'Deposit into a vault', body: 'Put USDM into Avon. You receive USDMy — a yield-bearing token that grows in value as the vault earns.' },
                { n: '2️⃣', title: 'Re-deploy the receipt token', body: 'Use USDMy as liquidity on Prism or Kumbaya. Your LP earns swap fees on top of Avon vault yield compounding underneath.' },
                { n: '3️⃣', title: 'Stack the yields', body: 'Both layers pay simultaneously. The vault yield increases USDMy value, so your LP position value also grows — compounding returns.' },
              ].map((item) => (
                <div key={item.n}>
                  <div className="text-2xl mb-2">{item.n}</div>
                  <p className="text-sm font-medium text-white mb-1">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Your strategy */}
          <div>
            <h2 className="font-semibold text-white mb-4">Your Strategy</h2>
            {!isConnected && (
              <div className="card text-center py-10">
                <p className="text-2xl mb-3">🔗</p>
                <p className="font-medium text-white mb-2">Connect your wallet</p>
                <p className="text-sm text-gray-500 mb-4">We&apos;ll analyse your on-chain positions and show your current strategy.</p>
                <ConnectButton />
              </div>
            )}
            {isConnected && myLoading && <div className="h-40 bg-white/5 rounded-xl animate-pulse" />}
            {isConnected && !myLoading && myStrategy && <StrategyCard strategy={myStrategy} isOwn />}
            {isConnected && !myLoading && !myStrategy && (
              <div className="card border-dashed border-border text-center py-10">
                <p className="text-2xl mb-3">🌱</p>
                <p className="font-medium text-white mb-2">No looping strategy detected yet</p>
                <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
                  Start by depositing USDM into Avon, then use the USDMy you receive as LP liquidity on Kumbaya or Prism.
                </p>
                <a href="https://www.avon.xyz/" target="_blank" rel="noopener noreferrer" className="btn-primary inline-block px-5 py-2 text-sm">
                  Start on Avon →
                </a>
              </div>
            )}
          </div>

          {/* Community / curated strategies */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-semibold text-white">
                {communityStrategies ? 'On-chain Discovered Loops' : 'Example Strategies'}
              </h2>
              {scanLoading && <span className="text-xs text-gray-500 animate-pulse">Scanning chain…</span>}
              {!scanLoading && communityStrategies && <span className="text-xs text-gray-500">{communityStrategies.length} wallets found</span>}
              {!scanLoading && !communityStrategies && <span className="text-xs text-gray-600">No loops found on-chain yet — showing curated examples</span>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {communityStrategies
                ? communityStrategies.map((d) => <StrategyCard key={d.address} strategy={d.strategy} walletAddress={d.address} />)
                : CURATED.map((s) => <StrategyCard key={s.name} strategy={s} />)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Protocols tab ── */}
      {tab === 'protocols' && (
        <div>
          <div className="flex gap-2 mb-6">
            {(['all', 'lending', 'dex', 'staking'] as const).map((f) => (
              <button key={f} onClick={() => setOppFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${oppFilter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                {f === 'all' ? 'All' : TYPE_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleOpps.map((opp) => (
              <OpportunityCard key={opp.id} opp={opp} alreadyIn={activeProtocols.has(opp.protocol)} />
            ))}
          </div>
          {isConnected && <p className="text-xs text-gray-500 text-center mt-2">Protocols you&apos;re active in glow.</p>}
          <p className="text-xs text-gray-600 text-center mt-4">APY estimates are indicative only. Always DYOR before depositing.</p>
        </div>
      )}
    </div>
  );
}
