import {
  FieldKind,
  MergeStrategyKind,
  validateDescriptors,
  assertValidDescriptors,
  type TableDescriptor,
  type FieldDescriptor,
} from '@gammaray/core'
import { rolodexDescriptors } from '@gammaray/rolodex-schema'
import { musicDescriptors } from '@gammaray/music-schema'

// Framework regression: the build-time descriptor validator (referential
// integrity for a TableDescriptor set). Pure — no DB, no server — so it runs as a
// fast static check. The same `assertValidDescriptors` runs at API engine startup
// (RowRegistry), so the live example schemas are validated there too.
const id: FieldDescriptor = { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true }
const name: FieldDescriptor = { name: 'name', label: 'Name', kind: FieldKind.String }

function mk(collection: string, fields: FieldDescriptor[], over: Partial<TableDescriptor> = {}): TableDescriptor {
  return {
    table: collection,
    collection,
    listField: `${collection}s`,
    identity: { field: 'id', clientGenerated: true },
    mergeStrategy: MergeStrategyKind.WholeRow,
    display: { titleFields: ['name'] },
    fields: [id, name, ...fields],
    ...over,
  }
}

describe('validateDescriptors', () => {
  it('accepts a well-formed set (reference + m2m via a join table)', () => {
    const company = mk('company', [])
    const tag = mk('tag', [])
    const contactTag = mk('contact_tag', [
      { name: 'contactId', label: 'Contact', kind: FieldKind.Reference, references: { collection: 'contact', titleField: 'name' } },
      { name: 'tagId', label: 'Tag', kind: FieldKind.Reference, references: { collection: 'tag', titleField: 'name' } },
    ])
    const contact = mk('contact', [
      { name: 'companyId', label: 'Company', kind: FieldKind.Reference, references: { collection: 'company', titleField: 'name' } },
      { name: 'tagIds', label: 'Tags', kind: FieldKind.MultiReference, via: { joinCollection: 'contact_tag', localField: 'contactId', remoteField: 'tagId', targetCollection: 'tag', titleField: 'name' } },
    ])
    expect(validateDescriptors([company, tag, contactTag, contact])).toEqual([])
  })

  it('flags a Reference to an unknown collection', () => {
    const contact = mk('contact', [
      { name: 'companyId', label: 'Company', kind: FieldKind.Reference, references: { collection: 'compnay', titleField: 'name' } },
    ])
    const errors = validateDescriptors([contact])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ collection: 'contact', field: 'companyId' })
    expect(errors[0].message).toMatch(/unknown collection "compnay"/)
  })

  it('flags a Reference titleField that is not on the target', () => {
    const company = mk('company', []) // has id, name
    const contact = mk('contact', [
      { name: 'companyId', label: 'Company', kind: FieldKind.Reference, references: { collection: 'company', titleField: 'label' } },
    ])
    const errors = validateDescriptors([company, contact])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/titleField "label" is not a field on "company"/)
  })

  it('flags a MultiReference via.localField typo on the join table', () => {
    const tag = mk('tag', [])
    const contactTag = mk('contact_tag', [
      { name: 'contactId', label: 'Contact', kind: FieldKind.Reference, references: { collection: 'contact', titleField: 'name' } },
      { name: 'tagId', label: 'Tag', kind: FieldKind.Reference, references: { collection: 'tag', titleField: 'name' } },
    ])
    const contact = mk('contact', [
      { name: 'tagIds', label: 'Tags', kind: FieldKind.MultiReference, via: { joinCollection: 'contact_tag', localField: 'contctId', remoteField: 'tagId', targetCollection: 'tag', titleField: 'name' } },
    ])
    const errors = validateDescriptors([tag, contactTag, contact])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/via.localField "contctId" is not a field on join "contact_tag"/)
  })

  it('flags identity/title fields that are not real columns, and duplicate collections', () => {
    const bad = mk('thing', [], { identity: { field: 'pk', clientGenerated: true }, display: { titleFields: ['title'] } })
    const dupA = mk('dup', [])
    const dupB = mk('dup', [])
    const errors = validateDescriptors([bad, dupA, dupB])
    const messages = errors.map((e) => e.message)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/identity.field "pk" is not a field on "thing"/),
        expect.stringMatching(/display.titleFields entry "title" is not a field on "thing"/),
        expect.stringMatching(/duplicate collection "dup"/),
      ]),
    )
  })

  it('assertValidDescriptors throws a combined message on an invalid set, and is quiet on a valid one', () => {
    const bad = mk('contact', [
      { name: 'companyId', label: 'Company', kind: FieldKind.Reference, references: { collection: 'nope', titleField: 'name' } },
    ])
    expect(() => assertValidDescriptors([bad])).toThrow(/Invalid TableDescriptor set \(1 error\)/)
    expect(() => assertValidDescriptors([mk('company', [])])).not.toThrow()
  })

  it('the real example schemas are valid (the same check runs at API startup)', () => {
    expect(validateDescriptors(rolodexDescriptors)).toEqual([])
    expect(validateDescriptors(musicDescriptors)).toEqual([])
  })
})
