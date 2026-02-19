export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-background font-bold text-xs">
              Y
            </div>
            <span className="text-sm text-gray-400">
              YieldBoard — Read-only DeFi leaderboard on{' '}
              <span className="text-accent">MegaETH</span>
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm text-gray-500">
            <a
              href="https://megaeth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              MegaETH
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
            <span className="text-gray-600">Read-only · No transactions</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
