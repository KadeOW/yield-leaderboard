'use client';

import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { useAccount } from 'wagmi';

const FEATURES = [
  {
    icon: '📊',
    title: 'Track Your Positions',
    description:
      'See all your yield-earning positions across DeFi protocols in one place — APY, deposited amounts, and yield earned.',
  },
  {
    icon: '🏆',
    title: 'Compete on the Leaderboard',
    description:
      'Get ranked against other yield farmers by your Yield Score — a composite metric of APY, diversification, and consistency.',
  },
  {
    icon: '🔍',
    title: 'Learn Top Strategies',
    description:
      "Browse the highest earners' strategies, see their protocol allocations, and understand how they maximize returns.",
  },
  {
    icon: '🔒',
    title: '100% Read-Only',
    description:
      'YieldBoard never requests signing, never sends transactions, and never stores private keys. Your assets are always safe.',
  },
];

const STATS = [
  { label: 'Protocols Tracked', value: '6+' },
  { label: 'Chain', value: 'MegaETH' },
  { label: 'Read-Only', value: '100%' },
];

export default function LandingPage() {
  const { isConnected } = useAccount();

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Built on MegaETH
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Your DeFi Yield,{' '}
            <span className="text-gradient">Ranked and Transparent</span>
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Connect your wallet to see your yield-earning positions, get a Yield Score, and compete
            on the public leaderboard. 100% read-only — your assets are always safe.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isConnected ? (
              <>
                <Link href="/dashboard" className="btn-primary">
                  View My Dashboard
                </Link>
                <Link href="/leaderboard" className="btn-secondary">
                  Browse Leaderboard
                </Link>
              </>
            ) : (
              <>
                <ConnectButton />
                <Link href="/leaderboard" className="btn-secondary">
                  Browse Leaderboard →
                </Link>
              </>
            )}
          </div>

          {/* Stats bar */}
          <div className="flex items-center justify-center gap-8 mt-16 pt-8 border-t border-border">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">
            Everything you need to{' '}
            <span className="text-accent">maximize yield</span>
          </h2>
          <p className="text-gray-400">
            A unified view of your DeFi positions with rankings and strategy insights.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="card-hover"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="font-semibold text-white text-lg mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Yield Score explainer */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="card border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-3">
                The <span className="text-accent">Yield Score</span>
              </h2>
              <p className="text-gray-400 mb-6">
                Your score (0–100) captures how effectively you&apos;re deploying capital in DeFi.
                It rewards high APY, protocol diversification, position consistency, and capital efficiency.
              </p>
              <Link href="/leaderboard" className="btn-primary inline-block">
                See Top Scores
              </Link>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3 w-full">
              {[
                { label: 'Weighted APY', weight: '35%', description: 'Your returns vs 25% APY benchmark' },
                { label: 'Diversification', weight: '25%', description: 'Unique protocols (5 = max)' },
                { label: 'Consistency', weight: '20%', description: 'Average position age (90 days = max)' },
                { label: 'Capital Efficiency', weight: '20%', description: 'Total yield earned vs deposited' },
              ].map((item) => (
                <div key={item.label} className="bg-background/50 rounded-lg p-3 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-white">{item.label}</p>
                    <span className="text-xs font-bold text-accent">{item.weight}</span>
                  </div>
                  <p className="text-xs text-gray-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Ready to see where you rank?
        </h2>
        <p className="text-gray-400 mb-8">
          Connect your wallet and discover your Yield Score in seconds.
        </p>
        {!isConnected && <ConnectButton />}
        {isConnected && (
          <Link href="/dashboard" className="btn-primary inline-block">
            Go to Dashboard
          </Link>
        )}
      </section>
    </div>
  );
}
