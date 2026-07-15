import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strip debug logging from the production bundle (keep error/warn).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Tree-shake icon/library barrel imports so only used symbols ship.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
