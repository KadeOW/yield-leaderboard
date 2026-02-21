import { NextResponse } from 'next/server';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const HUNTER_SLUG = 'huntertaleshunters';
const HUNTER_CONTRACT = '0x7716418a6bb9f136423cc9aeba7d1e20a9a1c31f';
const CROWN_CONTRACT = '0xf7d2F0d0b0517CBDbf87C86910ce10FaAab3589D';

const CACHE_TTL_MS = 60 * 1000; // 1-minute cache for live arb data

// Pack mint costs in Crown
const PACKS = [
  { name: 'Starter',  crown: 300  },
  { name: 'Pristine', crown: 1000 },
  { name: 'Ultimate', crown: 4000 },
] as const;

// Which rarities each pack targets for the arb comparison
const PACK_TARGETS: Record<string, string[]> = {
  Starter:  ['Common'],
  Pristine: ['Rare', 'Legendary'],
  Ultimate: ['Legendary', 'Transcendent'],
};

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Transcendent'];

export interface RarityFloor {
  rarity: string;
  floorETH: number;
  count: number;
}

export interface PackArb {
  name: string;
  crown: number;
  mintCostUSD: number | null;
  targetRarities: string[];
  targetFloorETH: number | null; // cheapest floor among target rarities from live listings
}

export interface HuntertalesData {
  crownPriceUSD: number | null;
  crownPriceSource: string;
  ethPriceUSD: number;
  packs: PackArb[];
  collectionFloorETH: number;
  collectionVolume24h: number;
  rarityFloors: RarityFloor[];
  fetchedAt: number;
}

let cache: { data: HuntertalesData; ts: number } | null = null;

function osHeaders(): Record<string, string> {
  const key = process.env.OPENSEA_API_KEY;
  return key ? { 'X-API-KEY': key } : {};
}

// ─── Crown price via DexScreener ──────────────────────────────────────────────

async function fetchCrownPrice(): Promise<{ price: number | null; source: string }> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${CROWN_CONTRACT}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return { price: null, source: 'unavailable' };
    const data = await res.json();
    const pairs = (data?.pairs ?? []) as Record<string, unknown>[];
    if (!pairs.length) return { price: null, source: 'no pairs found' };
    // Pick pair with highest liquidity for most accurate price
    const best = [...pairs].sort(
      (a, b) =>
        Number((b.liquidity as Record<string, number> | null)?.usd ?? 0) -
        Number((a.liquidity as Record<string, number> | null)?.usd ?? 0),
    )[0];
    const price = best?.priceUsd ? Number(best.priceUsd) : null;
    return { price, source: 'DexScreener' };
  } catch {
    return { price: null, source: 'unavailable' };
  }
}

// ─── ETH price ────────────────────────────────────────────────────────────────

async function fetchEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    );
    if (!res.ok) return 2000;
    const data = await res.json();
    return Number(data?.ethereum?.usd ?? 2000);
  } catch {
    return 2000;
  }
}

// ─── OpenSea: collection floor ────────────────────────────────────────────────

async function fetchCollectionStats(): Promise<{ floorETH: number; volume24h: number }> {
  try {
    const res = await fetch(`${OPENSEA_BASE}/collections/${HUNTER_SLUG}/stats`, {
      headers: osHeaders(),
    });
    if (!res.ok) return { floorETH: 0, volume24h: 0 };
    const data = await res.json();
    const total = data?.total as Record<string, unknown> | null;
    const intervals = (data?.intervals ?? []) as Record<string, unknown>[];
    const d1 = intervals.find((x) => x.interval === 'one_day');
    return {
      floorETH: Number(total?.floor_price ?? 0),
      volume24h: Number(d1?.volume ?? 0),
    };
  } catch {
    return { floorETH: 0, volume24h: 0 };
  }
}

// ─── OpenSea: per-rarity floors via batch listing + individual trait lookups ───
//
// OpenSea's MegaETH indexing ignores trait filter params on the listings
// endpoint, returning the same cheapest listings regardless of rarity.
// Instead: fetch the cheapest 50 listings, look up each token's traits in
// parallel, then group by the rarity trait to build accurate per-rarity floors.
// Rarities not found in the batch show as null (displayed as "—" in the UI).

function extractPriceETH(listing: Record<string, unknown>): number {
  const price = listing.price as Record<string, unknown> | null;
  const current = price?.current as Record<string, unknown> | null;
  const wei = String(current?.value ?? '0');
  try { return Number(BigInt(wei)) / 1e18; } catch { return 0; }
}

async function fetchRarityFloors(): Promise<RarityFloor[]> {
  const headers = osHeaders();

  // Fetch cheapest 50 active listings
  let rawListings: Record<string, unknown>[] = [];
  try {
    const res = await fetch(
      `${OPENSEA_BASE}/listings/collection/${HUNTER_SLUG}/all?limit=50`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      rawListings = (data?.listings ?? []) as Record<string, unknown>[];
    }
  } catch { /* fall through */ }

  if (rawListings.length === 0) return [];

  // Extract price + token ID
  const parsed = rawListings.map((o) => {
    const nft = o.nft as Record<string, unknown> | null;
    return {
      tokenId: String(nft?.identifier ?? ''),
      priceETH: extractPriceETH(o),
    };
  });

  // Parallel trait lookups for each token
  const traitResults = await Promise.allSettled(
    parsed.map(({ tokenId }) =>
      fetch(
        `${OPENSEA_BASE}/chain/megaeth/contract/${HUNTER_CONTRACT}/nfts/${tokenId}`,
        { headers },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );

  // Build per-rarity floors from results that have a recognisable rarity trait
  const byRarity: Record<string, number[]> = {};
  parsed.forEach((p, i) => {
    const result = traitResults[i];
    if (result.status !== 'fulfilled' || !result.value) return;
    const nftData = result.value?.nft as Record<string, unknown> | null;
    const traits = (nftData?.traits ?? []) as Record<string, unknown>[];
    const rarityTrait = traits.find((t) =>
      ['rarity', 'tier', 'class', 'grade'].includes(
        String(t.trait_type ?? '').toLowerCase(),
      ),
    );
    if (!rarityTrait) return;
    const rarity = String(rarityTrait.value);
    if (!byRarity[rarity]) byRarity[rarity] = [];
    byRarity[rarity].push(p.priceETH);
  });

  return Object.entries(byRarity)
    .map(([rarity, prices]) => ({
      rarity,
      floorETH: Math.min(...prices),
      count: prices.length,
    }))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

// ─── Main builder ─────────────────────────────────────────────────────────────

async function buildData(): Promise<HuntertalesData> {
  const [{ price: crownPriceUSD, source: crownPriceSource }, ethPriceUSD, collStats, rarityFloors] =
    await Promise.all([
      fetchCrownPrice(),
      fetchEthPrice(),
      fetchCollectionStats(),
      fetchRarityFloors(),
    ]);

  const packs: PackArb[] = PACKS.map((p) => {
    const targetRarities = PACK_TARGETS[p.name] ?? [];
    const targetPrices = rarityFloors
      .filter((rf) => targetRarities.includes(rf.rarity))
      .map((rf) => rf.floorETH);
    const targetFloorETH = targetPrices.length > 0 ? Math.min(...targetPrices) : null;
    return {
      name: p.name,
      crown: p.crown,
      mintCostUSD: crownPriceUSD != null ? crownPriceUSD * p.crown : null,
      targetRarities,
      targetFloorETH,
    };
  });

  return {
    crownPriceUSD,
    crownPriceSource,
    ethPriceUSD,
    packs,
    collectionFloorETH: collStats.floorETH,
    collectionVolume24h: collStats.volume24h,
    rarityFloors,
    fetchedAt: Date.now(),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }
  try {
    const data = await buildData();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    console.error('[games/huntertales]', e);
    if (cache) return NextResponse.json(cache.data);
    return NextResponse.json({ error: 'Failed to fetch Huntertales data' }, { status: 500 });
  }
}
