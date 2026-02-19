'use client';

import type { ProtocolConfig } from '@/lib/registry';

interface ProtocolCardProps {
  config: ProtocolConfig;
  builtIn?: boolean;
  onToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
  onTest?: (id: string) => void;
  testing?: boolean;
  testResult?: boolean | null;
}

const templateLabel: Record<string, string> = {
  erc4626: 'ERC-4626',
  univ3: 'Uniswap V3',
};

const positionTypeColors: Record<string, string> = {
  lending: 'text-blue-400 bg-blue-400/10',
  lp: 'text-purple-400 bg-purple-400/10',
  staking: 'text-yellow-400 bg-yellow-400/10',
  bond: 'text-orange-400 bg-orange-400/10',
};

export function ProtocolCard({
  config,
  builtIn = false,
  onToggle,
  onDelete,
  onTest,
  testing = false,
  testResult = null,
}: ProtocolCardProps) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 flex flex-col gap-3 hover:border-[#3a3a3a] transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{config.logoEmoji}</span>
          <div>
            <div className="font-semibold text-white text-sm">{config.name}</div>
            <div className="text-xs text-gray-500 capitalize">{config.chain}</div>
          </div>
        </div>

        {/* Status badge */}
        {builtIn ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#00FF94]/10 text-[#00FF94] border border-[#00FF94]/20 shrink-0">
            Built-in
          </span>
        ) : (
          <button
            onClick={() => onToggle?.(config.id)}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
              config.enabled ? 'bg-[#00FF94]' : 'bg-[#2a2a2a]'
            }`}
            aria-label={config.enabled ? 'Disable' : 'Enable'}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
          {templateLabel[config.template] ?? config.template}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded ${positionTypeColors[config.positionType] ?? 'text-gray-400 bg-white/5'}`}
        >
          {config.positionType}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
          {config.apyEstimate}% APY
        </span>
      </div>

      {/* Active indicator */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${config.enabled ? 'bg-[#00FF94]' : 'bg-gray-600'}`}
        />
        <span className={`text-xs ${config.enabled ? 'text-[#00FF94]' : 'text-gray-600'}`}>
          {config.enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Actions (custom only) */}
      {!builtIn && (
        <div className="flex gap-2 pt-1 border-t border-[#2a2a2a]">
          <button
            onClick={() => onTest?.(config.id)}
            disabled={testing}
            className="flex-1 text-xs py-1.5 rounded-lg border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing…' : testResult === true ? '✓ OK' : testResult === false ? '✗ Failed' : 'Test'}
          </button>
          <button
            onClick={() => onDelete?.(config.id)}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50 text-red-500 hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
