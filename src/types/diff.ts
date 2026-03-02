export type DiffStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';

export interface FieldChange {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface DiffEntry<T> {
  id: string;
  name: string;
  status: DiffStatus;
  itemA: T | null;
  itemB: T | null;
  changes: FieldChange[];
}

export interface DiffResult {
  snapshotALabel: string;
  snapshotBLabel: string;
  snapshotADate: string;
  snapshotBDate: string;
  packageDiffs: DiffEntry<Record<string, unknown>>[];
  flowDiffs: DiffEntry<Record<string, unknown>>[];
  valueMappingDiffs: DiffEntry<Record<string, unknown>>[];
  configurationDiffs: DiffEntry<Record<string, unknown>>[];
  runtimeDiffs: DiffEntry<Record<string, unknown>>[];
}
