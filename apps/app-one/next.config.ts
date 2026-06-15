import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui'],
  // Silence the per-request "GET / 307" dev-server logs; real errors still print.
  logging: {
    incomingRequests: false,
  },
  turbopack: {
    root: '../../',
  },
}

export default config
