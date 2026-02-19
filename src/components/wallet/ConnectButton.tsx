'use client';

import { ConnectButton as RainbowConnectButton } from '@rainbow-me/rainbowkit';
import Image from 'next/image';
import { truncateAddress } from '@/lib/utils';

export function ConnectButton() {
  return (
    <RainbowConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {!connected ? (
              <button onClick={openConnectModal} type="button" className="btn-primary">
                Connect Wallet
              </button>
            ) : chain.unsupported ? (
              <button onClick={openChainModal} type="button" className="btn-primary bg-red-500 hover:bg-red-400">
                Wrong Network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={openChainModal}
                  type="button"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent/30 transition-colors text-sm text-gray-400"
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <Image
                      alt={chain.name ?? 'Chain icon'}
                      src={chain.iconUrl}
                      width={16}
                      height={16}
                      className="rounded-full"
                    />
                  )}
                  {chain.name}
                </button>
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors text-sm font-medium text-accent"
                >
                  {account.displayName
                    ? account.displayName
                    : truncateAddress(account.address)}
                  {account.displayBalance && (
                    <span className="text-gray-400 font-normal">{account.displayBalance}</span>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </RainbowConnectButton.Custom>
  );
}
