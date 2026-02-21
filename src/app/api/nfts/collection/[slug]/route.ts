import { NextResponse } from 'next/server';
import type {
  NFTCollection,
  CollectionListing,
  CollectionOffer,
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

// OpenSea API v2 listing shape:
//   price.current.value  — wei string
//   protocol_data.parameters.offerer  — seller address
//   protocol_data.parameters.offer[0].identifierOrCriteria  — token id
//   protocol_data.parameters.endTime  — unix expiry (seconds)
//   nft.name / nft.image_url / nft.identifier  — NFT metadata (top-level field)
function parseListings(raw: Record<string, unknown>): CollectionListing[] {
  const orders = (raw?.listings ?? []) as Record<string, unknown>[];
  return orders.slice(0, 10).map((o) => {
    const price = o.price as Record<string, unknown> | null;
    const current = price?.current as Record<string, unknown> | null;
    const protocolData = o.protocol_data as Record<string, unknown> | null;
    const params = protocolData?.parameters as Record<string, unknown> | null;
    const offerArr = (params?.offer ?? []) as Record<string, unknown>[];

    const priceETH = weiToEth(current?.value ?? '0');

    // v2: NFT details live in the top-level "nft" field (not maker_asset_bundle)
    const nft = o.nft as Record<string, unknown> | null;
    const tokenId = String(
      nft?.identifier ?? offerArr[0]?.identifierOrCriteria ?? '',
    );

    // v2: seller is protocol_data.parameters.offerer (not o.maker.address)
    const maker = String(params?.offerer ?? '');

    // v2: expiry is protocol_data.parameters.endTime (not o.expiration_time)
    const expiresAt = formatExpiry(params?.endTime ?? 0);

    return {
      orderHash: String(o.order_hash ?? ''),
      tokenId,
      nftName: String(nft?.name ?? `#${tokenId}`),
      nftImageUrl: nft?.image_url ? String(nft.image_url) : undefined,
      priceETH,
      priceUSD: 0, // modal uses ethPriceUSD from the preview collection
      maker,
      expiresAt,
    } satisfies CollectionListing;
  });
}

// OpenSea API v2 offer shape:
//   price.current.value  — wei string
//   protocol_data.parameters.offerer  — buyer address
//   protocol_data.parameters.endTime  — unix expiry
function parseOffers(raw: Record<string, unknown>): CollectionOffer[] {
  const orders = (raw?.offers ?? []) as Record<string, unknown>[];
  return orders.slice(0, 10).map((o) => {
    const price = o.price as Record<string, unknown> | null;
    const current = price?.current as Record<string, unknown> | null;
    const protocolData = o.protocol_data as Record<string, unknown> | null;
    const params = protocolData?.parameters as Record<string, unknown> | null;

    const priceETH = weiToEth(current?.value ?? '0');
    const maker = String(params?.offerer ?? '');
    const expiresAt = formatExpiry(params?.endTime ?? 0);
    const quantity = Number(o.quantity_remaining ?? o.quantity ?? 1);

    return {
      orderHash: String(o.order_hash ?? ''),
      priceETH,
      priceUSD: 0,
      maker,
      expiresAt,
      quantity: Math.max(1, quantity),
    } satisfies CollectionOffer;
  });
}

function buildCollection(
  meta: Record<string, unknown>,
  stats: Record<string, unknown> | null,
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
    fetchedAt: Date.now(),
  };
}

async function fetchDetail(slug: string): Promise<CollectionDetailResponse> {
  const headers = osHeaders();

  // Correct OpenSea API v2 paths:
  //   /listings/collection/{slug}/all   — cheapest active listings
  //   /offers/collection/{slug}/best    — highest collection-level offers
  const [metaRes, statsRes, listingsRes, offersRes] = await Promise.allSettled([
    fetch(`${OPENSEA_BASE}/collections/${slug}`, { headers }),
    fetch(`${OPENSEA_BASE}/collections/${slug}/stats`, { headers }),
    fetch(`${OPENSEA_BASE}/listings/collection/${slug}/all?limit=10`, { headers }),
    fetch(`${OPENSEA_BASE}/offers/collection/${slug}/best?limit=10`, { headers }),
  ]);

  const meta: Record<string, unknown> =
    metaRes.status === 'fulfilled' && metaRes.value.ok
      ? await metaRes.value.json()
      : { collection: slug, name: slug };

  const statsData: Record<string, unknown> | null =
    statsRes.status === 'fulfilled' && statsRes.value.ok
      ? await statsRes.value.json()
      : null;

  const listingsData: Record<string, unknown> | null =
    listingsRes.status === 'fulfilled' && listingsRes.value.ok
      ? await listingsRes.value.json()
      : null;

  const offersData: Record<string, unknown> | null =
    offersRes.status === 'fulfilled' && offersRes.value.ok
      ? await offersRes.value.json()
      : null;

  return {
    collection: buildCollection(meta, statsData),
    listings: listingsData ? parseListings(listingsData) : [],
    offers: offersData ? parseOffers(offersData) : [],
  };
}

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
