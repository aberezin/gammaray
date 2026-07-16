import type { NextConfig } from 'next'
import path from 'path'

// The browser-facing plane rotates: the Colima VM IP changes across claudebox
// restarts, so read it (and the optional stable hostname alias) fresh from the
// harness env at startup rather than baking either into the file. See the
// claudebox N-tier networking standard: docs/design/n-tier-networking.md.
const claudeboxVmIp = process.env.CLAUDEBOX_VM_IP
const claudeboxHostname = process.env.CLAUDEBOX_HOSTNAME

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui', '@gammaray/client'],
  // Allow the cb-net container hostname + (when set) the current Colima VM IP
  // and/or the stable claudebox hostname alias, so Next.js dev mode streams RSC
  // flight data to the browser regardless of which browser-plane address is used.
  allowedDevOrigins: [
    ...(claudeboxVmIp ? [claudeboxVmIp] : []),
    ...(claudeboxHostname ? [claudeboxHostname] : []),
    'gammaray-music-1',
  ],
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
