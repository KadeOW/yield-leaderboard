import { NextResponse } from 'next/server';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const CHAIN = 'megaeth';
// 15-min cache: we fetch many pages so want to amortise the cost
const CACHE_TTL_MS = 15 * 60 * 1000;
// Paginate until OpenSea says there are no more results (safety cap: 20 pages = 2000 cols)
const MAX_PAGES = 20;

// ─── Exported types ────────────────────────────────────────────────────────────

export interface NFTCollection {
  slug: string;
  name: string;
  description: string;
  imageUrl?: string;
  bannerUrl?: string;
  openseaUrl: string;
  contractAddress: string;
  safelistStatus: string;
  floorPriceETH: number;
  floorPriceUSD: number;
  volume24h: number;
  volume24hUSD: number;
  volume7d: number;
  volume7dUSD: number;
  volume30d: number;
  volumeTotal: number;
  sales24h: number;
  /** % derived: (vol24h / (vol7d/7) - 1) * 100 */
  change24h: number;
  ownersCount: number;
  itemsCount: number;
  ethPriceUSD: number;
  fetchedAt: number;
}

export interface CollectionListing {
  orderHash: string;
  tokenId: string;
  nftName: string;
  nftImageUrl?: string;
  priceETH: number;
  priceUSD: number;
  maker: string;
  expiresAt: string;
}

export interface CollectionOffer {
  orderHash: string;
  priceETH: number;
  priceUSD: number;
  maker: string;
  expiresAt: string;
  quantity: number;
}

export interface CollectionDetailResponse {
  collection: NFTCollection;
  listings: CollectionListing[];
  offers: CollectionOffer[];
}

export interface WalletNFT {
  identifier: string;
  collection: string;
  contract: string;
  name: string;
  imageUrl?: string;
  openseaUrl?: string;
  collectionName?: string;
  floorPriceETH?: number;
}

// ─── ETH price cache ──────────────────────────────────────────────────────────

let ethPriceCache: { price: number; ts: number } | null = null;

async function getEthPriceUSD(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.ts < CACHE_TTL_MS) {
    return ethPriceCache.price;
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error('CoinGecko error');
    const data = await res.json();
    const price = Number(data?.ethereum?.usd ?? 2000);
    ethPriceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return ethPriceCache?.price ?? 2000;
  }
}

// ─── Collection cache ─────────────────────────────────────────────────────────

let cache: { data: NFTCollection[]; ts: number } | null = null;

function osHeaders(): Record<string, string> {
  const key = process.env.OPENSEA_API_KEY;
  return key ? { 'X-API-KEY': key } : {};
}

const SAFELIST_RANK: Record<string, number> = {
  verified: 0,
  approved: 1,
  requested: 2,
  not_requested: 3,
};

function safelistRank(status: string): number {
  return SAFELIST_RANK[status] ?? 4;
}

// Only these token standards are NFTs we want to display
const ALLOWED_STANDARDS = new Set(['erc721', 'erc721c', 'erc1155']);

function isNFTCollection(c: Record<string, unknown>): boolean {
  const contracts = (c.contracts ?? []) as Record<string, unknown>[];
  if (contracts.length === 0) return true; // no contract info — include
  return contracts.some((contract) => {
    const std = String(contract.token_standard ?? '').toLowerCase();
    return !std || ALLOWED_STANDARDS.has(std); // include if unknown or NFT standard
  });
}

function buildMergedCollection(
  c: Record<string, unknown>,
  statData: Record<string, unknown> | null,
  ethPriceUSD: number,
): NFTCollection {
  const total = (statData?.total ?? null) as Record<string, unknown> | null;
  const intervals = ((statData?.intervals ?? []) as Record<string, unknown>[]);

  const d1 = intervals.find((x) => x.interval === 'one_day');
  const d7 = intervals.find((x) => x.interval === 'seven_day');
  const d30 = intervals.find((x) => x.interval === 'thirty_day');

  const vol24h: number = Number(d1?.volume ?? 0);
  const vol7d: number = Number(d7?.volume ?? 0);
  const change24h = vol7d > 0 ? ((vol24h / (vol7d / 7)) - 1) * 100 : 0;

  const contracts = ((c.contracts ?? []) as Record<string, unknown>[]);
  const slug = String(c.collection ?? '');
  const safelist = String(c.safelist_status ?? 'not_requested');
  const floorPriceETH = Number(total?.floor_price ?? 0);

  return {
    slug,
    name: String(c.name ?? slug),
    description: String(c.description ?? ''),
    imageUrl: c.image_url ? String(c.image_url) : undefined,
    bannerUrl: c.banner_image_url ? String(c.banner_image_url) : undefined,
    openseaUrl: `https://opensea.io/collection/${slug}`,
    contractAddress: String(contracts[0]?.address ?? ''),
    safelistStatus: safelist,
    floorPriceETH,
    floorPriceUSD: floorPriceETH * ethPriceUSD,
    volume24h: vol24h,
    volume24hUSD: vol24h * ethPriceUSD,
    volume7d: vol7d,
    volume7dUSD: vol7d * ethPriceUSD,
    volume30d: Number(d30?.volume ?? 0),
    volumeTotal: Number(total?.volume ?? 0),
    sales24h: Number(d1?.sales ?? 0),
    change24h,
    ownersCount: Number(total?.num_owners ?? 0),
    itemsCount: Number(c.total_supply ?? 0),
    ethPriceUSD,
    fetchedAt: Date.now(),
  } satisfies NFTCollection;
}

async function fetchCollections(): Promise<NFTCollection[]> {
  const [headers, ethPriceUSD] = await Promise.all([
    Promise.resolve(osHeaders()),
    getEthPriceUSD(),
  ]);

  // Paginate until OpenSea has no more results (or we hit the safety cap).
  // Verified collections can appear on any page, so we must scan everything.
  const rawCollections: Record<string, unknown>[] = [];
  let nextCursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url: string = nextCursor
      ? `${OPENSEA_BASE}/collections?chain=${CHAIN}&limit=100&next=${encodeURIComponent(nextCursor)}`
      : `${OPENSEA_BASE}/collections?chain=${CHAIN}&limit=100`;

    const res: Response = await fetch(url, { headers });
    if (!res.ok) break;
    const data: Record<string, unknown> = await res.json();
    const cols = (data.collections ?? []) as Record<string, unknown>[];
    rawCollections.push(...cols);
    nextCursor = data.next ? String(data.next) : null;
    if (!nextCursor) break; // no more pages
  }

  if (rawCollections.length === 0) return [];

  // Filter to NFT token standards only (ERC-721, ERC-721c, ERC-1155)
  const nftCollections = rawCollections.filter(isNFTCollection);

  // Fetch stats for all NFT collections in parallel
  const statsResults = await Promise.allSettled(
    nftCollections.map((c) => {
      const slug = String(c.collection ?? '');
      return fetch(`${OPENSEA_BASE}/collections/${slug}/stats`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }),
  );

  const merged: NFTCollection[] = nftCollections.map((c, i) => {
    const result = statsResults[i];
    const statData = result.status === 'fulfilled'
      ? (result.value as Record<string, unknown> | null)
      : null;
    return buildMergedCollection(c, statData, ethPriceUSD);
  });

  // Sort: verified → approved → activity score → total volume
  merged.sort((a, b) => {
    const rankDiff = safelistRank(a.safelistStatus) - safelistRank(b.safelistStatus);
    if (rankDiff !== 0) return rankDiff;
    const aActivity = a.volume24h + a.floorPriceETH;
    const bActivity = b.volume24h + b.floorPriceETH;
    if (bActivity !== aActivity) return bActivity - aActivity;
    return b.volumeTotal - a.volumeTotal;
  });

  // Return all NFT-standard collections sorted by verified → activity.
  // The client applies the quality filter for the default view, but keeps
  // all entries available so search can find any collection on MegaETH.
  return merged;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchCollections();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    console.error('[nfts/collections]', e);
    return NextResponse.json(cache?.data ?? []);
  }
}
