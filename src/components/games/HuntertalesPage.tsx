'use client';

import { useHuntertales } from '@/hooks/useHuntertales';
import type { HunterListing, RarityFloor, PackArb } from '@/app/api/games/huntertales/route';

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
  floorETH,
  ethPriceUSD,
}: {
  mintCostUSD: number | null;
  floorETH: number;
  ethPriceUSD: number;
}) {
  if (mintCostUSD == null || floorETH === 0) {
    return <span className="text-[10px] text-gray-600">—</span>;
  }
  const floorUSD = floorETH * ethPriceUSD;
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
  collectionFloorETH,
  ethPriceUSD,
  rarityFloors,
}: {
  packs: PackArb[];
  collectionFloorETH: number;
  ethPriceUSD: number;
  rarityFloors: RarityFloor[];
}) {
  const floorUSD = collectionFloorETH * ethPriceUSD;

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e1e]">
        <h3 className="text-sm font-semibold text-white">Mint vs Buy — Pack Cost in USD</h3>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Compared against the current OpenSea floor ({floorUSD > 0 ? fmtUSD(floorUSD) : '—'} · {fmtETH(collectionFloorETH)})
        </p>
      </div>

      <table className="w-full">
        <thead className="bg-white/[0.02]">
          <tr>
            <th className="px-4 py-2.5 text-left text-[10px] text-gray-600 uppercase tracking-wider">Pack</th>
            <th className="px-4 py-2.5 text-right text-[10px] text-gray-600 uppercase tracking-wider">Crown cost</th>
            <th className="px-4 py-2.5 text-right text-[10px] text-gray-600 uppercase tracking-wider">Mint cost (USD)</th>
            <th className="px-4 py-2.5 text-right text-[10px] text-gray-600 uppercase tracking-wider">vs Floor</th>
          </tr>
        </thead>
        <tbody>
          {packs.map((pack) => (
            <tr key={pack.name} className="border-t border-[#1a1a1a] hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <p className="text-sm font-semibold text-white">{pack.name}</p>
              </td>
              <td className="px-4 py-3 text-right">
                <p className="text-sm text-yellow-300">{fmtCrown(pack.crown)}</p>
              </td>
              <td className="px-4 py-3 text-right">
                <p className="text-sm font-semibold text-white">
                  {pack.mintCostUSD != null ? fmtUSD(pack.mintCostUSD) : '—'}
                </p>
              </td>
              <td className="px-4 py-3 text-right">
                <ArbVerdict
                  mintCostUSD={pack.mintCostUSD}
                  floorETH={collectionFloorETH}
                  ethPriceUSD={ethPriceUSD}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Per-rarity floors if available */}
      {rarityFloors.length > 0 && (
        <div className="border-t border-[#1e1e1e] px-4 py-3">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
            OpenSea Floor by Rarity (from live listings)
          </p>
          <div className="flex flex-wrap gap-2">
            {rarityFloors.map((rf) => (
              <div
                key={rf.rarity}
                className="bg-white/[0.04] rounded-lg px-3 py-2 text-center min-w-[90px]"
              >
                <RarityBadge rarity={rf.rarity} />
                <p className="text-sm font-bold text-white mt-1">{fmtETH(rf.floorETH)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {fmtUSD(rf.floorETH * ethPriceUSD)}
                </p>
                <p className="text-[10px] text-gray-700 mt-0.5">{rf.count} listed</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live listings ─────────────────────────────────────────────────────────────

function LiveListings({
  listings,
  ethPriceUSD,
}: {
  listings: HunterListing[];
  ethPriceUSD: number;
}) {
  if (listings.length === 0) return null;

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e1e]">
        <h3 className="text-sm font-semibold text-white">Cheapest Hunters on OpenSea</h3>
        <p className="text-[11px] text-gray-600 mt-0.5">Live listings · sorted by price</p>
      </div>
      <div className="divide-y divide-[#1a1a1a]">
        {listings.map((l, i) => (
          <a
            key={i}
            href={l.openseaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
          >
            {l.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.imageUrl} alt={l.name} className="w-9 h-9 rounded-lg object-cover shrink-0 bg-white/5" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-gray-600 text-xs">
                ?
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate">{l.name}</p>
              {l.rarity && <RarityBadge rarity={l.rarity} />}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[#00FF94]">{fmtETH(l.priceETH)}</p>
              <p className="text-[10px] text-gray-500">{fmtUSD(l.priceETH * ethPriceUSD)}</p>
            </div>
            <span className="text-gray-700 text-xs shrink-0">↗</span>
          </a>
        ))}
      </div>
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
        collectionFloorETH={data.collectionFloorETH}
        ethPriceUSD={data.ethPriceUSD}
        rarityFloors={data.rarityFloors}
      />

      {/* Pack info callout */}
      <div className="card bg-white/[0.02] border border-[#1e1e1e]">
        <p className="text-[11px] text-gray-500 font-semibold mb-2 uppercase tracking-wider">How Packs Work</p>
        <div className="space-y-1.5 text-xs text-gray-500">
          <p><span className="text-yellow-300 font-semibold">Starter (300 ♛)</span> — Entry pack, higher chance of Common hunters</p>
          <p><span className="text-blue-300 font-semibold">Pristine (1,000 ♛)</span> — Better odds for Rare &amp; Epic hunters</p>
          <p><span className="text-purple-300 font-semibold">Ultimate (4,000 ♛)</span> — Best shot at Legendary &amp; Transcendent hunters</p>
          <p className="text-gray-600 pt-1">
            Minting is a gacha — you get a random rarity. Buying on OpenSea lets you target a specific rarity at a fixed price.
            The arb opportunity is best when the Crown price is low relative to OpenSea floors.
          </p>
        </div>
      </div>

      {/* Live listings */}
      <LiveListings listings={data.listings} ethPriceUSD={data.ethPriceUSD} />

      {/* Last updated */}
      <p className="text-[10px] text-gray-700 text-center">
        Updated {new Date(data.fetchedAt).toLocaleTimeString()} · refreshes every 60s
      </p>
    </div>
  );
}
