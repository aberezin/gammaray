import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui', '@gammaray/client'],
  // Allow the Colima VM IP + cb-net container hostname so Next.js dev mode
  // streams RSC flight data to non-localhost origins (VM access + cb-browser).
  allowedDevOrigins: ['192.168.64.13', 'gammaray-frontend-1'],
  // Silence the per-request "GET / 307" dev-server logs; real errors still print.
  logging: {
    incomingRequests: false,
  },
  turbopack: {
    // Absolute path to the monorepo root; Turbopack warns on a relative root.
    root: path.resolve(__dirname, '../../'),
  },
}

export default config
