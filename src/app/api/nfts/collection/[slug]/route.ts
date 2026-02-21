import { NextResponse } from 'next/server';
import type {
  NFTCollection,
  CollectionListing,
  CollectionDetailResponse,
} from '../../collections/route';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

const slugCache = new Map<string, { data: CollectionDetailResponse; ts: number }>();

function osHeaders(): Record<string, string> {
  const key = process.env.OPENSEA_API_KEY;
  return key ? { 'X-API-KEY': key } : {};
}

function weiToEth(weiStr: unknown): number {
  try {
    return Number(BigInt(String(weiStr))) / 1e18;
  } catch {
    return 0;
  }
}

function formatExpiry(ts: unknown): string {
  const n = Number(ts ?? 0);
  if (!n) return 'No expiry';
  const d = new Date(n * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Single-item parsers ───────────────────────────────────────────────────────

function parseListing(o: Record<string, unknown>): CollectionListing {
  const price = o.price as Record<string, unknown> | null;
  const current = price?.current as Record<string, unknown> | null;
  const protocolData = o.protocol_data as Record<string, unknown> | null;
  const params = protocolData?.parameters as Record<string, unknown> | null;
  const offerArr = (params?.offer ?? []) as Record<string, unknown>[];

  const priceETH = weiToEth(current?.value ?? '0');
  const nft = o.nft as Record<string, unknown> | null;
  const tokenId = String(nft?.identifier ?? offerArr[0]?.identifierOrCriteria ?? '');
  const maker = String(params?.offerer ?? '');
  const expiresAt = formatExpiry(params?.endTime ?? 0);

  return {
    orderHash: String(o.order_hash ?? ''),
    tokenId,
    nftName: String(nft?.name ?? `#${tokenId}`),
    nftImageUrl: nft?.image_url ? String(nft.image_url) : undefined,
    priceETH,
    priceUSD: 0,
    maker,
    expiresAt,
  } satisfies CollectionListing;
}

// ─── Paginated listing fetch ───────────────────────────────────────────────────
//
// OpenSea does NOT return a total listing count from its stats endpoint.
// We must paginate through all active listings to get an accurate count.
// Cap at 5 pages × 100 = 500 listings to avoid runaway for large collections.

async function fetchAllListings(
  slug: string,
  headers: Record<string, string>,
): Promise<{ listings: CollectionListing[]; totalCount: number; nearFloorCount: number }> {
  const all: CollectionListing[] = [];
  let nextCursor: string | null = null;

  for (let page = 0; page < 5; page++) {
    const url: string = nextCursor
      ? `${OPENSEA_BASE}/listings/collection/${slug}/all?limit=100&next=${encodeURIComponent(nextCursor)}`
      : `${OPENSEA_BASE}/listings/collection/${slug}/all?limit=100`;

    const res: Response = await fetch(url, { headers });
    if (!res.ok) break;
    const data: Record<string, unknown> = await res.json();
    const batch = (data?.listings ?? []) as Record<string, unknown>[];
    all.push(...batch.map(parseListing));
    nextCursor = data.next ? String(data.next) : null;
    if (!nextCursor) break;
  }

  // Sort cheapest first (API returns sorted, but ensure consistency)
  all.sort((a, b) => a.priceETH - b.priceETH);

  const totalCount = all.length;
  const floorPrice = all[0]?.priceETH ?? 0;
  const nearFloorCount =
    floorPrice > 0 ? all.filter((l) => l.priceETH <= floorPrice * 1.1).length : 0;

  return {
    listings: all.slice(0, 10), // only first 10 shown in the modal
    totalCount,
    nearFloorCount,
  };
}

// ─── Collection metadata / stats builder ─────────────────────────────────────

function buildCollection(
  meta: Record<string, unknown>,
  stats: Record<string, unknown> | null,
  listedCount: number,
): NFTCollection {
  const total = (stats?.total ?? null) as Record<string, unknown> | null;
  const intervals = ((stats?.intervals ?? []) as Record<string, unknown>[]);

  const d1 = intervals.find((x) => x.interval === 'one_day');
  const d7 = intervals.find((x) => x.interval === 'seven_day');
  const d30 = intervals.find((x) => x.interval === 'thirty_day');

  const vol24h: number = Number(d1?.volume ?? 0);
  const vol7d: number = Number(d7?.volume ?? 0);
  const change24h = vol7d > 0 ? ((vol24h / (vol7d / 7)) - 1) * 100 : 0;

  const contracts = ((meta.contracts ?? []) as Record<string, unknown>[]);
  const slug = String(meta.collection ?? meta.slug ?? '');

  return {
    slug,
    name: String(meta.name ?? ''),
    description: String(meta.description ?? ''),
    imageUrl: meta.image_url ? String(meta.image_url) : undefined,
    bannerUrl: meta.banner_image_url ? String(meta.banner_image_url) : undefined,
    openseaUrl: `https://opensea.io/collection/${slug}`,
    contractAddress: String(contracts[0]?.address ?? ''),
    safelistStatus: String(meta.safelist_status ?? 'not_requested'),
    floorPriceETH: Number(total?.floor_price ?? 0),
    floorPriceUSD: 0,
    ethPriceUSD: 0,
    volume24h: vol24h,
    volume24hUSD: 0,
    volume7d: vol7d,
    volume7dUSD: 0,
    volume30d: Number(d30?.volume ?? 0),
    volumeTotal: Number(total?.volume ?? 0),
    sales24h: Number(d1?.sales ?? 0),
    change24h,
    ownersCount: Number(total?.num_owners ?? 0),
    itemsCount: Number(meta.total_supply ?? 0),
    listedCount, // from paginated listing fetch — accurate count
    fetchedAt: Date.now(),
  };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

async function fetchDetail(slug: string): Promise<CollectionDetailResponse> {
  const headers = osHeaders();

  // Run meta and stats in parallel; listings are paginated separately
  const [metaRes, statsRes] = await Promise.allSettled([
    fetch(`${OPENSEA_BASE}/collections/${slug}`, { headers }),
    fetch(`${OPENSEA_BASE}/collections/${slug}/stats`, { headers }),
  ]);

  const meta: Record<string, unknown> =
    metaRes.status === 'fulfilled' && metaRes.value.ok
      ? await metaRes.value.json()
      : { collection: slug, name: slug };

  const statsData: Record<string, unknown> | null =
    statsRes.status === 'fulfilled' && statsRes.value.ok
      ? await statsRes.value.json()
      : null;

  // Paginate all listings to get accurate listedCount and nearFloorCount
  const { listings, totalCount, nearFloorCount } = await fetchAllListings(slug, headers);

  return {
    collection: buildCollection(meta, statsData, totalCount),
    listings,
    nearFloorCount,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  const { slug } = params;
  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const data = await fetchDetail(slug);
    slugCache.set(slug, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    console.error(`[nfts/collection/${slug}]`, e);
    const fallback = slugCache.get(slug);
    if (fallback) return NextResponse.json(fallback.data);
    return NextResponse.json({ error: 'Failed to fetch collection' }, { status: 500 });
  }
}
