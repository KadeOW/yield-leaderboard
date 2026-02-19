'use client';

import Link from 'next/link';
import type { LeaderboardEntry } from '@/types';
import { truncateAddress, formatUSDCompact, formatAPY, scoreColor } from '@/lib/utils';

interface Props {
  entry: LeaderboardEntry;
  isFollowing?: boolean;
  onFollowToggle?: () => void;
}

export function LeaderboardRow({ entry, isFollowing, onFollowToggle }: Props) {
  const displayName = entry.ensName ?? truncateAddress(entry.address);

  return (
    <tr className="border-b border-border hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-center">
        <span className={`font-bold ${entry.rank <= 3 ? 'text-accent' : 'text-gray-400'}`}>
          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link href={`/profile/${entry.address}`} className="text-accent-blue hover:underline font-medium">
          {displayName}
        </Link>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`font-bold ${scoreColor(entry.yieldScore)}`}>{entry.yieldScore}</span>
      </td>
      <td className="px-4 py-3 text-center text-accent">{formatAPY(entry.weightedAPY)}</td>
      <td className="px-4 py-3 text-right text-gray-300">{formatUSDCompact(entry.totalDeposited)}</td>
      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{entry.topProtocol}</td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {entry.strategyTags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full border border-border text-gray-400">
              {tag}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {onFollowToggle && (
          <button
            onClick={onFollowToggle}
            title={isFollowing ? 'Unfollow' : 'Follow'}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              isFollowing
                ? 'border-accent/40 text-accent bg-accent/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/40'
                : 'border-border text-gray-500 hover:border-accent/40 hover:text-accent hover:bg-accent/5'
            }`}
          >
            {isFollowing ? '✓ Following' : '+ Follow'}
          </button>
        )}
      </td>
    </tr>
  );
}
