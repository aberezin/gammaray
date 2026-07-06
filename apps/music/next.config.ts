import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui', '@gammaray/client'],
  // Allow the Colima VM IP so Next.js dev mode streams RSC flight data to it.
  // Without this, accessing via the VM IP shows SSR HTML but React never hydrates.
  allowedDevOrigins: ['192.168.64.13'],
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
