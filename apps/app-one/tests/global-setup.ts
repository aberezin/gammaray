import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

// Runs once before the e2e suite. The local API the webServer starts does not
// migrate or seed, so we do it here: bring the schema up to date, then seed the
// deterministic baseline (idempotent — see ADR 0011) the specs assert on
// (e.g. "Lovelace"). Connects straight to Postgres, so it does not need the API
// webServer to be up — only Postgres (docker compose up -d postgres).
export default function globalSetup() {
  const root = resolve(__dirname, '../../..')
  const run = (cmd: string) => execSync(cmd, { cwd: root, stdio: 'inherit' })
  run('pnpm --filter @gammaray/api db:migrate')
  run('pnpm --filter @gammaray/api db:seed')
}
