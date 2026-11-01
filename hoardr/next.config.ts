import type { NextConfig } from 'next'

// Sent with every response. The CSP only sets what can't break the app (no
// framing, no plugins, no <base> hijack); scripts/styles stay unrestricted
// because of the inline theme/greeting boot scripts and Google Maps.
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  // Location is the calendar's weather; nothing else is used
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
  { key: 'Content-Security-Policy',   value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
]

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
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default nextConfig
