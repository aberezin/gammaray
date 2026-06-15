import type { GraphQLClient } from 'graphql-request'
import { FieldKind, contactDescriptor, type RowRecord } from '@gammaray/core'

// Conflict resolution for contacts. (Create/update/delete now flow through the
// generic batch coordinator in batch-sync.ts; this is the one remaining
// contact-specific mutation.)
const FIELDS = contactDescriptor.fields
  .filter((f) => f.kind !== FieldKind.MultiReference) // virtual, not on the wire
  .map((f) => f.name)
  .join(' ')
const RESOLVE_CONTACT = `
  mutation ResolveContact($input: ContactInput!, $clientId: String!) {
    resolveContactConflict(input: $input, clientId: $clientId) { ${FIELDS} deleted }
  }
`

export async function resolveContact(
  gqlClient: GraphQLClient,
  input: Record<string, unknown>,
  clientId: string,
): Promise<RowRecord> {
  const data = await gqlClient.request<{ resolveContactConflict: RowRecord }>(RESOLVE_CONTACT, {
    input,
    clientId,
  })
  return data.resolveContactConflict
}
