import type { NextConfig } from 'next'
import path from 'path'

// The Colima VM IP rotates across claudebox restarts — read it from the
// harness-provided env at server startup rather than baking in a stale literal.
const claudeboxVmIp = process.env.CLAUDEBOX_VM_IP

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui', '@gammaray/client'],
  // Allow the cb-net container hostname + (when set) the current Colima VM IP,
  // so Next.js dev mode streams RSC flight data to non-localhost origins.
  allowedDevOrigins: [...(claudeboxVmIp ? [claudeboxVmIp] : []), 'gammaray-frontend-1'],
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
