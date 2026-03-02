// ── Number Range Usage Scanner types ─────────────────────────

export type NumberRangeSource = 'SCRIPT' | 'MAPPING' | 'CONFIGURATION' | 'ADAPTER_PROPERTY';

export interface NumberRangeReference {
  referenceId: string;
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  source: NumberRangeSource;
  sourceFile: string;
  lineNumber: number;
  matchedText: string;
  numberRangeObject: string;
  context: string;
  runtimeStatus: string;
}

export interface NumberRangeScanResult {
  references: NumberRangeReference[];
  totalReferences: number;
  uniqueObjects: number;
  flowsWithReferences: number;
  flowsScanned: number;
  objectCounts: Record<string, number>;
}
