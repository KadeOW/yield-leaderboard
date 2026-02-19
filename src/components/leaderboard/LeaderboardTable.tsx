'use client';

import { useState, useMemo } from 'react';
import type { LeaderboardEntry } from '@/types';
import { LeaderboardRow } from './LeaderboardRow';

type SortKey = 'yieldScore' | 'weightedAPY' | 'totalDeposited';

interface Props {
  entries: LeaderboardEntry[];
  watchedAddresses?: Set<string>;
  onFollowToggle?: (address: string) => void;
}

export function LeaderboardTable({ entries, watchedAddresses, onFollowToggle }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('yieldScore');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.address.toLowerCase().includes(q) ||
        (e.ensName?.toLowerCase().includes(q) ?? false)
    );
  }, [entries, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b[sortKey] - a[sortKey]),
    [filtered, sortKey]
  );

  const page_entries = sorted.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className={`px-4 py-3 text-sm font-medium cursor-pointer select-none hover:text-white transition-colors ${
        sortKey === k ? 'text-accent' : 'text-gray-400'
      }`}
      onClick={() => setSortKey(k)}
    >
      {label} {sortKey === k && '↓'}
    </th>
  );

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by address or ENS..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm px-4 py-2 bg-card border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full">
          <thead className="bg-card/50">
            <tr>
              <th className="px-4 py-3 text-sm font-medium text-gray-400 text-center">Rank</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-400 text-left">Address</th>
              <SortHeader label="Score" k="yieldScore" />
              <SortHeader label="APY" k="weightedAPY" />
              <SortHeader label="TVL" k="totalDeposited" />
              <th className="px-4 py-3 text-sm font-medium text-gray-400 text-left hidden md:table-cell">
                Top Protocol
              </th>
              <th className="px-4 py-3 text-sm font-medium text-gray-400 text-left hidden lg:table-cell">
                Strategy
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {page_entries.map((entry) => (
              <LeaderboardRow
                key={entry.address}
                entry={entry}
                isFollowing={watchedAddresses?.has(entry.address.toLowerCase())}
                onFollowToggle={onFollowToggle ? () => onFollowToggle(entry.address) : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-border rounded hover:border-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ←
          </button>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm border border-border rounded hover:border-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
