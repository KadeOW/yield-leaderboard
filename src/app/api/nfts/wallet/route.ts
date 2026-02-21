import { NextResponse } from 'next/server';
import type { WalletNFT } from '../collections/route';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';
const CHAIN = 'megaeth';
const CACHE_TTL_MS = 60 * 1000;

const addressCache = new Map<string, { data: WalletNFT[]; ts: number }>();

function osHeaders(): Record<string, string> {
  const key = process.env.OPENSEA_API_KEY;
  return key ? { 'X-API-KEY': key } : {};
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address')?.toLowerCase() ?? '';

  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const cached = addressCache.get(address);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(
      `${OPENSEA_BASE}/chain/${CHAIN}/account/${address}/nfts?limit=50`,
      { headers: osHeaders() },
    );

    if (!res.ok) {
      return NextResponse.json(addressCache.get(address)?.data ?? []);
    }

    const json = await res.json();
    const nfts = ((json.nfts ?? []) as Record<string, unknown>[]);

    const data: WalletNFT[] = nfts.map((n) => ({
      identifier: String(n.identifier ?? n.token_id ?? ''),
      collection: String(n.collection ?? ''),
      contract: String(n.contract ?? ''),
      name: String(n.name ?? `#${n.identifier ?? n.token_id ?? ''}`),
      imageUrl: n.image_url ? String(n.image_url) : undefined,
      openseaUrl: n.opensea_url ? String(n.opensea_url) : undefined,
      collectionName: n.collection ? String(n.collection) : undefined,
      floorPriceETH: undefined,
    }));

    addressCache.set(address, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    console.error('[nfts/wallet]', e);
    return NextResponse.json(addressCache.get(address)?.data ?? []);
  }
}
