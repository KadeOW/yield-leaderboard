'use client';

import { useState } from 'react';
import type { ProtocolConfig, ProtocolTemplate } from '@/lib/registry';
import { testERC4626Connection } from '@/lib/protocols/templates/erc4626';
import { testUniV3Connection } from '@/lib/protocols/templates/univ3';

interface AddProtocolModalProps {
  onSave: (config: Omit<ProtocolConfig, 'id' | 'addedAt'>) => void;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['🏦', '💎', '🦄', '🐋', '⚡', '🌊', '🔥', '🚀', '💰', '🏗️'];

const defaultForm = {
  name: '',
  logoEmoji: '🏦',
  template: 'erc4626' as ProtocolTemplate,
  chain: 'megaeth' as 'megaeth' | 'sepolia',
  enabled: true,
  // ERC-4626
  vault: '',
  tokenAddress: '',
  tokenSymbol: '',
  tokenDecimals: '18',
  priceUSD: '1.0',
  // UniV3
  positionManager: '',
  factory: '',
  // Shared
  apyEstimate: '8',
  positionType: 'lending' as ProtocolConfig['positionType'],
};

export function AddProtocolModal({ onSave, onClose }: AddProtocolModalProps) {
  const [form, setForm] = useState(defaultForm);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testError, setTestError] = useState('');

  function set<K extends keyof typeof defaultForm>(key: K, value: typeof defaultForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setTestResult(null);
    setTestError('');
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    setTestError('');

    const config = buildConfig();
    try {
      let ok = false;
      if (form.template === 'erc4626') {
        ok = await testERC4626Connection(config);
      } else {
        ok = await testUniV3Connection(config);
      }
      setTestResult(ok);
      if (!ok) setTestError('Contract did not respond. Check the address and chain.');
    } catch {
      setTestResult(false);
      setTestError('Connection failed. Check the address and chain.');
    } finally {
      setTesting(false);
    }
  }

  function buildConfig(): Omit<ProtocolConfig, 'id' | 'addedAt'> {
    const base = {
      name: form.name.trim() || 'Unnamed Protocol',
      logoEmoji: form.logoEmoji,
      template: form.template,
      enabled: form.enabled,
      chain: form.chain,
      apyEstimate: parseFloat(form.apyEstimate) || 0,
      positionType: form.positionType,
    };

    if (form.template === 'erc4626') {
      return {
        ...base,
        contracts: { vault: form.vault.trim() },
        underlyingToken: {
          address: form.tokenAddress.trim(),
          symbol: form.tokenSymbol.trim() || 'TOKEN',
          decimals: parseInt(form.tokenDecimals) || 18,
          priceUSD: parseFloat(form.priceUSD) || 1,
        },
      };
    }

    return {
      ...base,
      contracts: {
        positionManager: form.positionManager.trim(),
        factory: form.factory.trim(),
      },
    };
  }

  function handleSave() {
    onSave(buildConfig());
    onClose();
  }

  const isValid =
    form.name.trim() &&
    (form.template === 'erc4626'
      ? form.vault.trim().startsWith('0x')
      : form.positionManager.trim().startsWith('0x') && form.factory.trim().startsWith('0x'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a]">
          <h2 className="text-lg font-semibold text-white">Add Protocol</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Name + Emoji */}
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Icon</label>
              <div className="flex flex-wrap gap-1 w-32">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => set('logoEmoji', e)}
                    className={`w-8 h-8 rounded-lg text-base transition-colors ${
                      form.logoEmoji === e
                        ? 'bg-[#00FF94]/20 border border-[#00FF94]/50'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1.5">Protocol Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. My Vault"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF94]/50"
              />
            </div>
          </div>

          {/* Template */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Template</label>
            <div className="flex gap-2">
              {(['erc4626', 'univ3'] as ProtocolTemplate[]).map((t) => (
                <button
                  key={t}
                  onClick={() => set('template', t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.template === t
                      ? 'bg-[#00FF94]/10 border-[#00FF94]/40 text-[#00FF94]'
                      : 'bg-white/5 border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {t === 'erc4626' ? 'ERC-4626' : 'Uniswap V3'}
                </button>
              ))}
            </div>
          </div>

          {/* Chain */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Chain</label>
            <div className="flex gap-2">
              {(['megaeth', 'sepolia'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => set('chain', c)}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors capitalize ${
                    form.chain === c
                      ? 'bg-[#00FF94]/10 border-[#00FF94]/40 text-[#00FF94]'
                      : 'bg-white/5 border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {c === 'megaeth' ? 'MegaETH' : 'Sepolia'}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic fields */}
          {form.template === 'erc4626' ? (
            <>
              <Field
                label="Vault Address"
                value={form.vault}
                onChange={(v) => set('vault', v)}
                placeholder="0x..."
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Token Symbol"
                  value={form.tokenSymbol}
                  onChange={(v) => set('tokenSymbol', v)}
                  placeholder="USDC"
                />
                <Field
                  label="Token Decimals"
                  value={form.tokenDecimals}
                  onChange={(v) => set('tokenDecimals', v)}
                  placeholder="18"
                  type="number"
                />
              </div>
              <Field
                label="Token Address"
                value={form.tokenAddress}
                onChange={(v) => set('tokenAddress', v)}
                placeholder="0x..."
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Price USD"
                  value={form.priceUSD}
                  onChange={(v) => set('priceUSD', v)}
                  placeholder="1.00"
                  type="number"
                />
                <Field
                  label="APY Estimate %"
                  value={form.apyEstimate}
                  onChange={(v) => set('apyEstimate', v)}
                  placeholder="8"
                  type="number"
                />
              </div>
            </>
          ) : (
            <>
              <Field
                label="Position Manager Address"
                value={form.positionManager}
                onChange={(v) => set('positionManager', v)}
                placeholder="0x..."
              />
              <Field
                label="Factory Address"
                value={form.factory}
                onChange={(v) => set('factory', v)}
                placeholder="0x..."
              />
              <Field
                label="APY Estimate %"
                value={form.apyEstimate}
                onChange={(v) => set('apyEstimate', v)}
                placeholder="10"
                type="number"
              />
            </>
          )}

          {/* Position type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Position Type</label>
            <div className="flex gap-2 flex-wrap">
              {(['lending', 'lp', 'staking', 'bond'] as const).map((pt) => (
                <button
                  key={pt}
                  onClick={() => set('positionType', pt)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize ${
                    form.positionType === pt
                      ? 'bg-[#00FF94]/10 border-[#00FF94]/40 text-[#00FF94]'
                      : 'bg-white/5 border-[#2a2a2a] text-gray-400 hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {pt}
                </button>
              ))}
            </div>
          </div>

          {/* Test connection */}
          {testResult !== null && (
            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                testResult
                  ? 'bg-[#00FF94]/10 text-[#00FF94] border border-[#00FF94]/20'
                  : 'bg-red-900/20 text-red-400 border border-red-900/50'
              }`}
            >
              {testResult ? 'Contract reachable — connection OK.' : testError || 'Connection failed.'}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={testing || !isValid}
              className="flex-1 py-2 rounded-lg border border-[#2a2a2a] text-sm text-gray-400 hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="flex-1 py-2 rounded-lg bg-[#00FF94] text-black text-sm font-semibold hover:bg-[#00FF94]/90 transition-colors disabled:opacity-40"
            >
              Save Protocol
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF94]/50"
      />
    </div>
  );
}
