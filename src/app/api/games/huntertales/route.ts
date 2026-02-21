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

export interface HunterListing {
  tokenId: string;
  name: string;
  imageUrl?: string;
  rarity: string | null;
  priceETH: number;
  openseaUrl: string;
}

export interface RarityFloor {
  rarity: string;
  floorETH: number;
  count: number;
}

export interface PackArb {
  name: string;
  crown: number;
  mintCostUSD: number | null;
}

export interface HuntertalesData {
  crownPriceUSD: number | null;
  crownPriceSource: string;
  ethPriceUSD: number;
  packs: PackArb[];
  collectionFloorETH: number;
  collectionVolume24h: number;
  rarityFloors: RarityFloor[];
  listings: HunterListing[];
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

// ─── OpenSea: cheapest listings + rarity via NFT trait lookup ─────────────────

async function fetchHunterListings(): Promise<{
  listings: HunterListing[];
  rarityFloors: RarityFloor[];
}> {
  const headers = osHeaders();

  // Fetch cheapest 20 active listings
  let rawListings: Record<string, unknown>[] = [];
  try {
    const res = await fetch(
      `${OPENSEA_BASE}/listings/collection/${HUNTER_SLUG}/all?limit=20`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      rawListings = (data?.listings ?? []) as Record<string, unknown>[];
    }
  } catch { /* fall through */ }

  if (rawListings.length === 0) return { listings: [], rarityFloors: [] };

  // Extract price + token ID from each listing
  const parsed = rawListings.map((o) => {
    const price = o.price as Record<string, unknown> | null;
    const current = price?.current as Record<string, unknown> | null;
    const priceWei = String(current?.value ?? '0');
    const priceETH = Number(BigInt(priceWei)) / 1e18;
    const nft = o.nft as Record<string, unknown> | null;
    const tokenId = String(nft?.identifier ?? '');
    const name = String(nft?.name ?? `#${tokenId}`);
    const imageUrl = nft?.image_url ? String(nft.image_url) : undefined;
    const openseaUrl = nft?.opensea_url
      ? String(nft.opensea_url)
      : `https://opensea.io/assets/megaeth/${HUNTER_CONTRACT}/${tokenId}`;
    return { tokenId, name, imageUrl, priceETH, openseaUrl };
  });

  // Batch-fetch NFT traits in parallel to get rarity for each listing
  const traitResults = await Promise.allSettled(
    parsed.map(({ tokenId }) =>
      fetch(`${OPENSEA_BASE}/chain/megaeth/contract/${HUNTER_CONTRACT}/nfts/${tokenId}`, {
        headers,
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );

  const listings: HunterListing[] = parsed.map((p, i) => {
    const result = traitResults[i];
    let rarity: string | null = null;
    if (result.status === 'fulfilled' && result.value) {
      const nftData = result.value?.nft as Record<string, unknown> | null;
      const traits = (nftData?.traits ?? []) as Record<string, unknown>[];
      // Try common trait names for rarity
      const rarityTrait = traits.find((t) =>
        ['rarity', 'tier', 'class', 'grade', 'rank', 'type'].includes(
          String(t.trait_type ?? '').toLowerCase(),
        ),
      );
      rarity = rarityTrait ? String(rarityTrait.value) : null;
    }
    return { ...p, rarity };
  });

  // Build per-rarity floors
  const byRarity: Record<string, number[]> = {};
  for (const l of listings) {
    if (!l.rarity) continue;
    if (!byRarity[l.rarity]) byRarity[l.rarity] = [];
    byRarity[l.rarity].push(l.priceETH);
  }

  const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Transcendent'];
  const rarityFloors: RarityFloor[] = Object.entries(byRarity)
    .map(([rarity, prices]) => ({
      rarity,
      floorETH: Math.min(...prices),
      count: prices.length,
    }))
    .sort((a, b) => {
      const ai = RARITY_ORDER.indexOf(a.rarity);
      const bi = RARITY_ORDER.indexOf(b.rarity);
      if (ai !== -1 && bi !== -1) return ai - bi;
      return a.floorETH - b.floorETH;
    });

  return { listings, rarityFloors };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

async function buildData(): Promise<HuntertalesData> {
  const [{ price: crownPriceUSD, source: crownPriceSource }, ethPriceUSD, collStats, hunterData] =
    await Promise.all([
      fetchCrownPrice(),
      fetchEthPrice(),
      fetchCollectionStats(),
      fetchHunterListings(),
    ]);

  const packs: PackArb[] = PACKS.map((p) => ({
    name: p.name,
    crown: p.crown,
    mintCostUSD: crownPriceUSD != null ? crownPriceUSD * p.crown : null,
  }));

  return {
    crownPriceUSD,
    crownPriceSource,
    ethPriceUSD,
    packs,
    collectionFloorETH: collStats.floorETH,
    collectionVolume24h: collStats.volume24h,
    rarityFloors: hunterData.rarityFloors,
    listings: hunterData.listings,
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
