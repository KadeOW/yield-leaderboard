'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { useRegistry } from '@/hooks/useRegistry';
import { ProtocolCard } from '@/components/admin/ProtocolCard';
import { AddProtocolModal } from '@/components/admin/AddProtocolModal';
import type { ProtocolConfig } from '@/lib/registry';
import { testERC4626Connection } from '@/lib/protocols/templates/erc4626';
import { testUniV3Connection } from '@/lib/protocols/templates/univ3';

// Built-in protocols shown as read-only cards
const BUILT_IN_PROTOCOLS: ProtocolConfig[] = [
  {
    id: '__aave',
    name: 'Aave V3',
    logoEmoji: '👻',
    template: 'erc4626',
    enabled: true,
    chain: 'sepolia',
    contracts: { vault: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951' },
    apyEstimate: 5,
    positionType: 'lending',
    addedAt: 0,
  },
  {
    id: '__avon',
    name: 'Avon',
    logoEmoji: '🏦',
    template: 'erc4626',
    enabled: true,
    chain: 'megaeth',
    contracts: { vault: '0x2eA493384F42d7Ea78564F3EF4C86986eAB4a890' },
    underlyingToken: { address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', symbol: 'USDM', decimals: 18, priceUSD: 1 },
    apyEstimate: 8,
    positionType: 'lending',
    addedAt: 0,
  },
  {
    id: '__prism',
    name: 'Prism',
    logoEmoji: '💎',
    template: 'univ3',
    enabled: true,
    chain: 'megaeth',
    contracts: {
      positionManager: '0xcb91c75a6b29700756d4411495be696c4e9a576e',
      factory: '0x1adb8f973373505bb206e0e5d87af8fb1f5514ef',
    },
    apyEstimate: 15,
    positionType: 'lp',
    addedAt: 0,
  },
];

export default function AdminPage() {
  const { address } = useAccount();
  const adminAddr = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

  const isConnected = Boolean(address);
  const isAdmin = Boolean(
    adminAddr && address && address.toLowerCase() === adminAddr.toLowerCase(),
  );

  const { protocols, add, remove, toggle } = useRegistry();
  const [showModal, setShowModal] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});

  async function handleTest(id: string) {
    const config = protocols.find((p) => p.id === id);
    if (!config) return;
    setTestingId(id);
    try {
      const ok =
        config.template === 'erc4626'
          ? await testERC4626Connection(config)
          : await testUniV3Connection(config);
      setTestResults((r) => ({ ...r, [id]: ok }));
    } catch {
      setTestResults((r) => ({ ...r, [id]: false }));
    } finally {
      setTestingId(null);
    }
  }

  // Gate: not connected
  if (!isConnected) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-white mb-2">Admin Access Required</h1>
          <p className="text-gray-400 text-sm mb-6">
            Connect the admin wallet to access the protocol registry.
          </p>
          <ConnectButton />
        </div>
      </main>
    );
  }

  // Gate: wrong wallet
  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⛔</div>
          <h1 className="text-xl font-semibold text-white mb-2">Wrong Wallet</h1>
          <p className="text-gray-400 text-sm mb-2">
            Connected as:
          </p>
          <code className="text-xs text-gray-300 bg-white/5 px-3 py-1.5 rounded-lg block break-all mb-6">
            {address}
          </code>
          <p className="text-gray-500 text-sm">
            Switch to the designated admin wallet to manage protocols.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Protocol Registry</h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage DeFi protocol integrations for the yield leaderboard.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#00FF94] text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#00FF94]/90 transition-colors"
          >
            <span>+</span>
            Add Protocol
          </button>
        </div>

        {/* Built-in protocols */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Built-in ({BUILT_IN_PROTOCOLS.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BUILT_IN_PROTOCOLS.map((p) => (
              <ProtocolCard key={p.id} config={p} builtIn />
            ))}
          </div>
        </section>

        {/* Custom protocols */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Custom ({protocols.length})
          </h2>
          {protocols.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-[#2a2a2a] rounded-xl">
              <div className="text-3xl mb-3">🔌</div>
              <p className="text-gray-400 text-sm mb-4">No custom protocols yet.</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-sm text-[#00FF94] hover:underline"
              >
                + Add your first protocol
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {protocols.map((p) => (
                <ProtocolCard
                  key={p.id}
                  config={p}
                  onToggle={toggle}
                  onDelete={remove}
                  onTest={handleTest}
                  testing={testingId === p.id}
                  testResult={testResults[p.id] ?? null}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <AddProtocolModal
          onSave={(config) => add(config)}
          onClose={() => setShowModal(false)}
        />
      )}
    </main>
  );
}
