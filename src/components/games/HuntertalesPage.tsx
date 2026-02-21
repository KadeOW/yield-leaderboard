'use client';

import { useHuntertales } from '@/hooks/useHuntertales';
import type { RarityFloor, PackArb } from '@/app/api/games/huntertales/route';

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtUSD(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(5)}`;
}

function fmtETH(v: number): string {
  if (v === 0) return '—';
  if (v >= 1) return `${v.toFixed(3)} ETH`;
  return `${v.toFixed(4)} ETH`;
}

function fmtCrown(v: number): string {
  return v.toLocaleString() + ' ♛';
}

// ─── Rarity badge ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  Common:       'bg-gray-500/20 text-gray-300',
  Uncommon:     'bg-green-500/20 text-green-300',
  Rare:         'bg-blue-500/20 text-blue-300',
  Epic:         'bg-purple-500/20 text-purple-300',
  Legendary:    'bg-yellow-500/20 text-yellow-300',
  Transcendent: 'bg-pink-500/20 text-pink-300',
};

function RarityBadge({ rarity }: { rarity: string }) {
  const cls = RARITY_COLORS[rarity] ?? 'bg-white/10 text-gray-400';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rarity}
    </span>
  );
}

// ─── Arb verdict ──────────────────────────────────────────────────────────────

function ArbVerdict({
  mintCostUSD,
  targetFloorETH,
  ethPriceUSD,
}: {
  mintCostUSD: number | null;
  targetFloorETH: number | null;
  ethPriceUSD: number;
}) {
  if (mintCostUSD == null || targetFloorETH == null || targetFloorETH === 0) {
    return <span className="text-[10px] text-gray-600">No listings</span>;
  }
  const floorUSD = targetFloorETH * ethPriceUSD;
  const savings = floorUSD - mintCostUSD;
  const pct = ((Math.abs(savings) / Math.max(mintCostUSD, floorUSD)) * 100).toFixed(0);

  if (savings > 0.5) {
    return (
      <span className="text-[10px] font-bold text-[#00FF94]">
        MINT {pct}% cheaper
      </span>
    );
  }
  if (savings < -0.5) {
    return (
      <span className="text-[10px] font-bold text-blue-400">
        BUY ON OS {pct}% cheaper
      </span>
    );
  }
  return <span className="text-[10px] text-gray-500">≈ same price</span>;
}

// ─── Crown price card ─────────────────────────────────────────────────────────

function CrownCard({
  crownPriceUSD,
  crownPriceSource,
}: {
  crownPriceUSD: number | null;
  crownPriceSource: string;
}) {
  return (
    <div className="card flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-xl">
          ♛
        </div>
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Crown Token</p>
          <p className="text-2xl font-bold text-white">
            {crownPriceUSD != null ? fmtUSD(crownPriceUSD) : '—'}
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {crownPriceUSD != null
              ? `via ${crownPriceSource} · updates every 60s`
              : `Price unavailable via ${crownPriceSource}`}
          </p>
        </div>
      </div>
      <a
        href={`https://dexscreener.com/megaeth/${process.env.NEXT_PUBLIC_CROWN_CONTRACT ?? '0xf7d2F0d0b0517CBDbf87C86910ce10FaAab3589D'}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent hover:underline shrink-0"
      >
        DexScreener ↗
      </a>
    </div>
  );
}

// ─── Pack arb table ───────────────────────────────────────────────────────────

function PackArbTable({
  packs,
  ethPriceUSD,
  rarityFloors,
}: {
  packs: PackArb[];
  ethPriceUSD: number;
  rarityFloors: RarityFloor[];
}) {
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e1e]">
        <h3 className="text-sm font-semibold text-white">Mint vs Buy — Pack Cost in USD</h3>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Mint cost compared against the cheapest hunter of each matching rarity on OpenSea
        </p>
      </div>

      <table className="w-full">
        <thead className="bg-white/[0.02]">
          <tr>
            <th className="px-4 py-2.5 text-left text-[10px] text-gray-600 uppercase tracking-wider">Pack</th>
            <th className="px-4 py-2.5 text-right text-[10px] text-gray-600 uppercase tracking-wider">Crown</th>
            <th className="px-4 py-2.5 text-right text-[10px] text-gray-600 uppercase tracking-wider">Mint (USD)</th>
            <th className="px-4 py-2.5 text-left text-[10px] text-gray-600 uppercase tracking-wider pl-6">vs OpenSea by rarity</th>
          </tr>
        </thead>
        <tbody>
          {packs.map((pack) => {
            const mintUSD = pack.mintCostUSD;
            return (
              <tr key={pack.name} className="border-t border-[#1a1a1a] align-top">
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-white">{pack.name}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm text-yellow-300">{fmtCrown(pack.crown)}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-semibold text-white">
                    {mintUSD != null ? fmtUSD(mintUSD) : '—'}
                  </p>
                </td>
                <td className="px-4 py-3 pl-6">
                  <div className="space-y-2">
                    {pack.targetRarities.map((rarity) => {
                      const rf = rarityFloors.find((r) => r.rarity === rarity);
                      return (
                        <div key={rarity} className="flex items-center gap-2 flex-wrap">
                          <RarityBadge rarity={rarity} />
                          {rf ? (
                            <span className="text-xs text-gray-400">
                              {fmtETH(rf.floorETH)}
                              <span className="text-gray-600 ml-1">({fmtUSD(rf.floorETH * ethPriceUSD)})</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-600">no listings</span>
                          )}
                          <ArbVerdict
                            mintCostUSD={mintUSD}
                            targetFloorETH={rf?.floorETH ?? null}
                            ethPriceUSD={ethPriceUSD}
                          />
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 bg-white/5 rounded-2xl" />
      <div className="h-48 bg-white/5 rounded-2xl" />
      <div className="h-64 bg-white/5 rounded-2xl" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function HuntertalesPage() {
  const { data, isLoading, isError } = useHuntertales();

  if (isLoading) return <Skeleton />;

  if (isError || !data) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400 text-sm">Failed to load Huntertales data.</p>
        <p className="text-gray-600 text-xs mt-1">Check your OpenSea API key and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Game header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/30 to-orange-500/20 border border-yellow-500/20 flex items-center justify-center text-lg">
          ⚔️
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Huntertales</h2>
          <p className="text-xs text-gray-500">Idle RPG on MegaETH · Season 1</p>
        </div>
        <a
          href="https://huntertales.gitbook.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-gray-600 hover:text-accent transition-colors"
        >
          Docs ↗
        </a>
        <a
          href="https://opensea.io/collection/huntertaleshunters"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:text-accent transition-colors"
        >
          OpenSea ↗
        </a>
      </div>

      {/* Crown price */}
      <CrownCard
        crownPriceUSD={data.crownPriceUSD}
        crownPriceSource={data.crownPriceSource}
      />

      {/* Pack arb table */}
      <PackArbTable
        packs={data.packs}
        ethPriceUSD={data.ethPriceUSD}
        rarityFloors={data.rarityFloors}
      />

      {/* Pack info callout */}
      <div className="card bg-white/[0.02] border border-[#1e1e1e]">
        <p className="text-[11px] text-gray-500 font-semibold mb-2 uppercase tracking-wider">How Packs Work</p>
        <div className="space-y-1.5 text-xs text-gray-500">
          <p><span className="text-yellow-300 font-semibold">Starter (300 ♛)</span> — Entry pack, Common hunters</p>
          <p><span className="text-blue-300 font-semibold">Pristine (1,000 ♛)</span> — Rare &amp; Legendary hunters</p>
          <p><span className="text-purple-300 font-semibold">Ultimate (4,000 ♛)</span> — Legendary &amp; Transcendent hunters</p>
          <p className="text-gray-600 pt-1">
            Minting is a gacha — you get a random rarity. Buying on OpenSea lets you target a specific rarity at a fixed price.
            The arb opportunity is best when the Crown price is low relative to OpenSea floors.
          </p>
        </div>
      </div>

      {/* Last updated */}
      <p className="text-[10px] text-gray-700 text-center">
        Updated {new Date(data.fetchedAt).toLocaleTimeString()} · refreshes every 60s
      </p>
    </div>
  );
}
