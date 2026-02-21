'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@/components/wallet/ConnectButton';

const publicLinks = [
  { href: '/leaderboard', label: 'Live Feed' },
  { href: '/explore', label: 'Yield' },
  { href: '/assets', label: 'Assets' },
];

export function Header() {
  const pathname = usePathname();
  const { address } = useAccount();
  const adminAddr = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
  const isAdmin = Boolean(
    adminAddr && address && address.toLowerCase() === adminAddr.toLowerCase(),
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-background font-bold text-sm group-hover:bg-accent/90 transition-colors">
              Y
            </div>
            <span className="font-semibold text-white">
              Yield<span className="text-accent">Board</span>
            </span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {address && (
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Dashboard
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'text-[#00FF94] bg-[#00FF94]/10'
                    : 'text-gray-400 hover:text-[#00FF94] hover:bg-[#00FF94]/5'
                }`}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Wallet Connect */}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
