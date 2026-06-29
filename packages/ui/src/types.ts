// A Reference / MultiReference picker option.
export interface ReferenceOption {
  value: string
  label: string
}

// The data a Reference/MultiReference control needs: an async option source
// (server search for large targets, in-memory filter otherwise) and known
// id→label pairs for the current selection(s).
export interface ReferenceFieldSource {
  loadOptions: (query: string) => Promise<ReferenceOption[]>
  labels: Record<string, string>
}
