import { FieldKind, type TableDescriptor } from './descriptors'

// Topologically order tables from their descriptor-declared FK references, so a
// referenced (parent) table comes before the table that references it. Used to
// sequence batch apply (parents before children) and, reversed, deletes.
// Cycles are skipped rather than failing — deferred constraints handle those.
export function dependencyOrder(descriptors: TableDescriptor[]): string[] {
  const byTable = new Map(descriptors.map((d) => [d.table, d]))
  const deps = new Map<string, Set<string>>()
  for (const d of descriptors) {
    const set = new Set<string>()
    for (const f of d.fields) {
      if (f.kind === FieldKind.Reference && f.references) set.add(f.references.collection)
    }
    deps.set(d.table, set)
  }

  const order: string[] = []
  const done = new Set<string>()
  const onStack = new Set<string>()
  const visit = (t: string) => {
    if (done.has(t) || onStack.has(t)) return
    onStack.add(t)
    for (const dep of deps.get(t) ?? []) {
      if (byTable.has(dep)) visit(dep)
    }
    onStack.delete(t)
    done.add(t)
    order.push(t)
  }
  for (const d of descriptors) visit(d.table)
  return order
}
