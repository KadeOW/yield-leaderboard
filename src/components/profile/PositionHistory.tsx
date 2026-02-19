'use client';

import type { Position } from '@/types';
import { PositionCard } from '@/components/dashboard/PositionCard';

interface Props {
  positions: Position[];
}

export function PositionHistory({ positions }: Props) {
  if (positions.length === 0) {
    return (
      <div className="card text-center text-gray-500 py-8">
        No positions found for this address.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {positions.map((position, i) => (
        <PositionCard key={`${position.protocol}-${position.asset}-${i}`} position={position} />
      ))}
    </div>
  );
}
