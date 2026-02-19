'use client';

import { useLeaderboard } from '@/hooks/useLeaderboard';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';

export default function LeaderboardPage() {
  const { data: entries, isLoading } = useLeaderboard();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Yield Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Top yield earners on MegaETH ranked by Yield Score
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 skeleton rounded-lg" />
          ))}
        </div>
      ) : entries ? (
        <LeaderboardTable entries={entries} />
      ) : null}
    </div>
  );
}
