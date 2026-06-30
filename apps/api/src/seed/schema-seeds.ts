import { enabledSchemaNames } from '../engine/schema-tables'
import { coreSeed, type SeedRow } from './seed-data'
import { musicSeed } from './seed-data.music'

// Seed fixtures grouped by schema, mirroring engine/schema-tables.ts. The seeder
// applies only the fixtures for the schemas this api instance serves
// (GAMMARAY_SCHEMAS), so a per-app backend (Phase 2) seeds only its own tables.
const SCHEMA_SEEDS: Record<string, SeedRow[]> = {
  rolodex: coreSeed,
  music: musicSeed,
}

export function enabledSeed(): SeedRow[] {
  return enabledSchemaNames().flatMap((name) => SCHEMA_SEEDS[name] ?? [])
}
