'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { usePositions } from '@/hooks/usePositions';

interface Opportunity {
  id: string;
  protocol: string;
  chain: string;
  asset: string;
  type: 'lending' | 'lp' | 'staking';
  apyMin: number;
  apyMax: number;
  tvlNote: string;
  risk: 'low' | 'medium' | 'high';
  description: string;
  url: string;
  logoEmoji: string;
  color: string;
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
    tags: ['Stablecoin', 'Auto-compound', 'ERC-4626'],
  },
  {
    id: 'prism-weth',
    protocol: 'Prism',
    chain: 'MegaETH',
    asset: 'Token/WETH pairs',
    type: 'lp',
    apyMin: 15,
    apyMax: 60,
    tvlNote: 'Concentrated liquidity',
    risk: 'medium',
    description: 'Uniswap V3 fork on MegaETH. Concentrated liquidity pools with high fee capture from MegaETH\'s fast block throughput.',
    url: 'https://prismfi.cc/',
    logoEmoji: '💎',
    color: 'border-violet-500/30 bg-violet-500/5',
    tags: ['Concentrated LP', 'Active management', 'UniV3 fork'],
  },
  {
    id: 'kumbaya-weth',
    protocol: 'Kumbaya',
    chain: 'MegaETH',
    asset: 'Token/WETH pairs',
    type: 'lp',
    apyMin: 20,
    apyMax: 200,
    tvlNote: 'Concentrated liquidity',
    risk: 'high',
    description: 'High-throughput AMM on MegaETH. Emerging token pairs with deep liquidity incentives and real-time fee generation.',
    url: 'https://kumbaya.xyz',
    logoEmoji: '🌊',
    color: 'border-cyan-500/30 bg-cyan-500/5',
    tags: ['High APY', 'New pairs', 'UniV3 fork'],
  },
];

const RISK_COLORS = {
  low:    'text-accent bg-accent/10 border-accent/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  high:   'text-red-400 bg-red-400/10 border-red-400/20',
};

const TYPE_LABELS = { lending: 'Lending', lp: 'LP', staking: 'Staking' };
const TYPE_COLORS = {
  lending: 'text-purple-400 bg-purple-400/10',
  lp:      'text-cyan-400 bg-cyan-400/10',
  staking: 'text-blue-400 bg-blue-400/10',
};

type Filter = 'all' | 'lending' | 'lp' | 'staking';

export default function OpportunitiesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const { isConnected } = useAccount();
  const { data: positions } = usePositions();

  const activeProtocols = new Set(positions?.map((p) => p.protocol) ?? []);

  const visible = OPPORTUNITIES.filter(
    (o) => filter === 'all' || o.type === filter,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Yield Opportunities</h1>
        <p className="text-sm text-gray-500 mt-1">
          Curated yield-generating protocols across MegaETH and Ethereum.
          {isConnected && (
            <span className="text-accent ml-1">Positions you&apos;re already in are highlighted.</span>
          )}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'lending', 'lp', 'staking'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {f === 'all' ? 'All' : TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((opp) => {
          const alreadyIn = activeProtocols.has(opp.protocol);
          return (
            <div
              key={opp.id}
              className={`relative card-hover border ${opp.color} ${alreadyIn ? 'ring-1 ring-accent/30' : ''}`}
            >
              {alreadyIn && (
                <div className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent">
                  Active
                </div>
              )}

              {/* Protocol header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="text-2xl">{opp.logoEmoji}</div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{opp.protocol}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[opp.type]}`}>
                      {TYPE_LABELS[opp.type]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{opp.chain} · {opp.tvlNote}</p>
                </div>
              </div>

              {/* Asset */}
              <p className="text-xs text-gray-400 mb-3 font-mono">{opp.asset}</p>

              {/* APY range */}
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Est. APY Range</p>
                <p className="text-xl font-bold text-accent">
                  {opp.apyMin}% – {opp.apyMax}%
                </p>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">{opp.description}</p>

              {/* Tags + risk */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {opp.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-500">{tag}</span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${RISK_COLORS[opp.risk]}`}>
                  {opp.risk} risk
                </span>
                <a
                  href={opp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors border border-white/10"
                >
                  Open app →
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-600 text-center mt-8">
        APY estimates are indicative only and change with market conditions. Always DYOR before depositing.
      </p>
    </div>
  );
}
