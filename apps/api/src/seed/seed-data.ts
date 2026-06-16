// The core seed fixture — the deterministic baseline the e2e suite asserts on
// (e.g. "Lovelace") and a minimal browsable dataset for local dev.
//
// This is the SAME data the old in-migration seeds produced (ADR 0011), now with
// STABLE ids so the seed is idempotent (create-if-absent by id) instead of using
// gen_random_uuid(). Tests key off visible text, not ids, so fixed ids are safe.
//
// Rows are written through the generic engine (GenericRowService.applyRow) in
// dependency order, so each gets version 1 and — for revisioned tables — a v1
// revision snapshot with client_id 'seed', exactly as before.

export interface SeedRow {
  table: string
  data: Record<string, unknown>
}

// Stable UUIDs (valid v4-shaped hex). Grouped by table for readability.
const COMPANY = {
  acme: '22222222-2222-2222-2222-222222220001',
  globex: '22222222-2222-2222-2222-222222220002',
  initech: '22222222-2222-2222-2222-222222220003',
}
const CONTACT = {
  ada: '11111111-1111-1111-1111-111111110001',
  alan: '11111111-1111-1111-1111-111111110002',
  grace: '11111111-1111-1111-1111-111111110003',
}

// The core fixture. Contacts are intentionally NOT linked to companies, matching
// the historical baseline (companyId null). Keep this identical unless a test is
// updated in lockstep — it is the e2e regression baseline.
export const coreSeed: SeedRow[] = [
  { table: 'company', data: { id: COMPANY.acme, name: 'Acme Inc' } },
  { table: 'company', data: { id: COMPANY.globex, name: 'Globex' } },
  { table: 'company', data: { id: COMPANY.initech, name: 'Initech' } },
  { table: 'contact', data: { id: CONTACT.ada, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '555-0001' } },
  { table: 'contact', data: { id: CONTACT.alan, firstName: 'Alan', lastName: 'Turing', email: 'alan@example.com', phone: '555-0002' } },
  { table: 'contact', data: { id: CONTACT.grace, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', phone: '555-0003' } },
]
