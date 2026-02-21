'use client';

import { useState, useMemo } from 'react';
import { useNFTCollections } from '@/hooks/useNFTCollections';
import { CollectionModal } from '@/components/assets/CollectionModal';
import { EcosystemOverview } from '@/components/assets/EcosystemOverview';
import { HuntertalesPage } from '@/components/games/HuntertalesPage';
import type { NFTCollection } from '@/app/api/nfts/collections/route';
import { type Currency, fmtETH, fmtNFTUSD } from '@/lib/nftCurrency';

type AssetTab = 'nfts' | 'games';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Chooses between precomputed ETH and USD values stored on the collection */
function fmtPrice(ethVal: number, usdVal: number, currency: Currency): string {
  return currency === 'usd' ? fmtNFTUSD(usdVal) : fmtETH(ethVal);
}

function fmtChange(v: number): { text: string; positive: boolean } {
  if (!isFinite(v) || v === 0) return { text: '—', positive: true };
  const positive = v >= 0;
  return { text: `${positive ? '+' : ''}${v.toFixed(1)}%`, positive };
}

type SortKey = 'gainers' | 'volume' | 'floor';

const SAFELIST_RANK: Record<string, number> = { verified: 0, approved: 1, requested: 2, not_requested: 3 };
const safelistRank = (s: string) => SAFELIST_RANK[s] ?? 4;

/**
 * Returns true if a collection belongs on the front-page list.
 *
 * Rules:
 *  - Verified or approved on OpenSea → always show, regardless of activity
 *  - Everything else → must have real community adoption (holders + floor or volume)
 *    to avoid name-squatters, 1-of-1 dev mints with no community, and dead projects
 */
function isActive(c: NFTCollection): boolean {
  if (c.safelistStatus === 'verified' || c.safelistStatus === 'approved') return true;
  const hasOwners = c.ownersCount >= 5;
  return (
    c.volume24h > 0 ||
    (c.volumeTotal > 0 && hasOwners) ||
    (c.floorPriceETH > 0 && hasOwners)
  );
}

function sortCollections(list: NFTCollection[], key: SortKey): NFTCollection[] {
  // On the Gainers tab hide collections with fewer than 15 owners — low-holder
  // collections with big % swings are almost always wash-traded or scam projects.
  const base = key === 'gainers'
    ? list.filter((c) => c.ownersCount >= 15 && c.sales24h >= 1)
    : list;
  return [...base].sort((a, b) => {
    if (key === 'gainers') return b.change24h - a.change24h;
    if (key === 'volume') return b.volume24h - a.volume24h;
    return b.floorPriceETH - a.floorPriceETH;
  });
}

/** Sort search results: verified first, then highest volume, then highest floor */
function sortByRelevance(list: NFTCollection[]): NFTCollection[] {
  return [...list].sort((a, b) => {
    const rankDiff = safelistRank(a.safelistStatus) - safelistRank(b.safelistStatus);
    if (rankDiff !== 0) return rankDiff;
    if (b.volume24h !== a.volume24h) return b.volume24h - a.volume24h;
    return b.floorPriceETH - a.floorPriceETH;
  });
}

function VerifiedBadge() {
  return (
    <span
      title="Verified on OpenSea"
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 shrink-0 text-white"
      style={{ fontSize: 9 }}
    >
      ✓
    </span>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CollectionRow({
  collection,
  rank,
  currency,
  onClick,
}: {
  collection: NFTCollection;
  rank: number;
  currency: Currency;
  onClick: () => void;
}) {
  const { text: changeText, positive } = fmtChange(collection.change24h);
  const isVerified = collection.safelistStatus === 'verified';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors border-b border-[#1e1e1e] last:border-0 text-left"
    >
      <span className="text-xs text-gray-600 w-5 shrink-0 text-center">{rank}</span>

      {collection.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={collection.imageUrl}
          alt={collection.name}
          className="w-10 h-10 rounded-xl object-cover shrink-0 bg-white/5"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-sm font-bold text-gray-400 shrink-0">
          {collection.name[0] ?? '?'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-semibold text-white truncate">{collection.name}</p>
          {isVerified && <VerifiedBadge />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Floor:{' '}
            <span className="text-gray-300">
              {fmtPrice(collection.floorPriceETH, collection.floorPriceUSD, currency)}
            </span>
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-500">
            Vol 24h:{' '}
            <span className="text-gray-300">
              {fmtPrice(collection.volume24h, collection.volume24hUSD, currency)}
            </span>
          </span>
          {collection.itemsCount > 0 && (
            <>
              <span className="text-gray-700 hidden sm:inline">·</span>
              <span className="text-xs text-gray-500 hidden sm:inline">
                {collection.itemsCount.toLocaleString()} items
              </span>
            </>
          )}
        </div>
      </div>

      {collection.volume24h > 0 && collection.volume7d > 0 && changeText !== '—' ? (
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            positive ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
          }`}
        >
          {changeText}
        </span>
      ) : (
        <span className="w-[52px] shrink-0" />
      )}

      <span className="text-gray-600 text-xs shrink-0">›</span>
    </button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="space-y-0">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[#1e1e1e] animate-pulse">
          <div className="w-5 h-3 bg-white/5 rounded" />
          <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/10 rounded w-32" />
            <div className="h-2.5 bg-white/5 rounded w-56" />
          </div>
          <div className="w-12 h-5 bg-white/5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

export default function AssetsPage() {
  const { data: collections, isLoading, isError } = useNFTCollections();
  const [activeTab, setActiveTab] = useState<AssetTab>('nfts');
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('eth');

  const filtered = useMemo(() => {
    const list = collections ?? [];
    const q = search.trim().toLowerCase();

    if (q) {
      // Search mode: show ALL matches (including inactive), smart-sorted so
      // verified + high-volume collections surface first for ambiguous queries
      const matches = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.slug.includes(q),
      );
      return sortByRelevance(matches);
    }

    // Default mode: only show active collections, then sort by the selected tab
    return sortCollections(list.filter(isActive), sortKey);
  }, [collections, sortKey, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const selectedCollection = useMemo(
    () => collections?.find((c) => c.slug === selectedSlug),
    [collections, selectedSlug],
  );

  const verifiedCount = collections?.filter((c) => c.safelistStatus === 'verified').length ?? 0;

  const SORT_TABS: { key: SortKey; label: string }[] = [
    { key: 'volume', label: 'Volume 24h' },
    { key: 'floor', label: 'Floor Price' },
    { key: 'gainers', label: 'Gainers' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Assets</h1>
          <p className="text-sm text-gray-500 mt-1">
            MegaETH NFT collections
            {verifiedCount > 0 && (
              <span className="ml-2 text-blue-400">· {verifiedCount} verified</span>
            )}
          </p>
        </div>

        {/* ETH / USD toggle */}
        <div className="flex items-center bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-1">
          {(['eth', 'usd'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors uppercase ${
                currency === c
                  ? 'bg-accent text-black'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {([['nfts', 'NFTs'], ['games', 'Games']] as [AssetTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Games tab */}
      {activeTab === 'games' && (
        <div className="max-w-2xl">
          <HuntertalesPage />
        </div>
      )}

      {/* Ecosystem overview (NFTs tab only) */}
      {activeTab === 'nfts' && !isLoading && !isError && collections && collections.length > 0 && (
        <EcosystemOverview collections={collections} currency={currency} />
      )}

      {/* NFTs tab content */}
      {activeTab === 'nfts' && <>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search collections…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent/50 transition-colors"
        />
        <div className="flex gap-1">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setSortKey(tab.key); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                sortKey === tab.key
                  ? 'bg-accent text-black'
                  : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Collection list */}
      <div className="card !p-0 overflow-hidden">
        {isLoading && <SkeletonRows />}

        {isError && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-2xl mb-3">🖼</p>
            <p className="font-medium text-gray-400">Unable to load collections</p>
            <p className="text-sm mt-1">OpenSea API may not yet index MegaETH collections.</p>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-2xl mb-3">🔍</p>
            <p className="font-medium text-gray-400">
              {search ? 'No collections match your search' : 'No active collections found'}
            </p>
            {search && (
              <p className="text-xs mt-1 text-gray-600">Try a shorter name or the OpenSea slug</p>
            )}
          </div>
        )}

        {!isLoading && paginated.length > 0 &&
          paginated.map((c, i) => (
            <CollectionRow
              key={c.slug}
              collection={c}
              rank={page * PAGE_SIZE + i + 1}
              currency={currency}
              onClick={() => setSelectedSlug(c.slug)}
            />
          ))}
      </div>

      {/* Pagination controls */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-600">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} collections
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500 px-1">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex items-center gap-1.5 mt-3 px-1">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px]">✓</span>
          <span className="text-xs text-gray-600">
            ERC-721 / ERC-1155 only · Active collections shown by default · Search finds all
          </span>
        </div>
      )}

      {selectedSlug && (
        <CollectionModal
          slug={selectedSlug}
          preview={selectedCollection}
          currency={currency}
          onClose={() => setSelectedSlug(null)}
        />
      )}

      </> /* end NFTs tab */}
    </div>
  );
}
