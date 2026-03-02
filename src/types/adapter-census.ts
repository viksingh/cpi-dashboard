// ── Adapter Type Census types ────────────────────────────────

export interface AdapterTypeStat {
  adapterType: string;
  count: number;
  senderCount: number;
  receiverCount: number;
  flowCount: number;
  flowNames: string[];
  eccRelated: boolean;
  migrationEffort: 'LOW' | 'MEDIUM' | 'HIGH';
  migrationNotes: string;
}

export interface AdapterCensusResult {
  stats: AdapterTypeStat[];
  totalAdapters: number;
  uniqueTypes: number;
  eccAdapterCount: number;
  flowsScanned: number;
}
