// The NoteSync example app's data model: the TableDescriptors for its type-A
// tables. These are *example* definitions built on the @gammaray/core framework
// (FieldKind / TableDescriptor / merge strategies) — swap this package out to
// drive a different app from the same engine.
export * from './descriptors.contact'
export * from './descriptors.company'
export * from './descriptors.category'
export * from './descriptors.tag'

import type { TableDescriptor } from '@gammaray/core'
import { contactDescriptor } from './descriptors.contact'
import { companyDescriptor } from './descriptors.company'
import { categoryDescriptor } from './descriptors.category'
import { tagDescriptor, contactTagDescriptor } from './descriptors.tag'

// Every type-A TableDescriptor this example app defines, ordered referenced-table
// -first (companies/tags before the contacts that reference them, contact_tag
// last). Consumers build their registries from this one list, so adding a table
// touches only its descriptor file + this array — the client-side analog of the
// server's RowRegistry.
export const notesyncDescriptors: TableDescriptor[] = [
  companyDescriptor,
  tagDescriptor,
  categoryDescriptor,
  contactDescriptor,
  contactTagDescriptor,
]
