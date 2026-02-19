import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import { Footer } from '@/components/layout/Footer';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

// Web3Providers and Header (which uses usePathname) must be client-side only
// because wagmi connectors access localStorage during initialization
const Web3Providers = dynamic(
  () => import('@/components/providers/Web3Providers').then((m) => m.Web3Providers),
  { ssr: false }
);

const Header = dynamic(
  () => import('@/components/layout/Header').then((m) => m.Header),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'YieldBoard — DeFi Yield Leaderboard on MegaETH',
  description:
    "Track your DeFi yield-earning positions, get ranked on a public leaderboard, and browse top earners' strategies on MegaETH.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background text-white min-h-screen flex flex-col`}>
        <Web3Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Web3Providers>
      </body>
    </html>
  );
}
