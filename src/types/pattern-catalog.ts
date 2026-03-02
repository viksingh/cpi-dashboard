// ── Integration Pattern Cataloger types ──────────────────────

export type CatalogPatternType =
  | 'POINT_TO_POINT'
  | 'REQUEST_REPLY'
  | 'PUBLISH_SUBSCRIBE'
  | 'STORE_FORWARD'
  | 'CONTENT_ROUTING'
  | 'SCATTER_GATHER'
  | 'SAGA'
  | 'ORCHESTRATION'
  | 'POLLING'
  | 'BATCH'
  | 'EVENT_DRIVEN'
  | 'UNKNOWN';

export const CatalogPatternLabels: Record<CatalogPatternType, string> = {
  POINT_TO_POINT: 'Point-to-Point',
  REQUEST_REPLY: 'Request-Reply',
  PUBLISH_SUBSCRIBE: 'Publish/Subscribe',
  STORE_FORWARD: 'Store & Forward',
  CONTENT_ROUTING: 'Content-Based Routing',
  SCATTER_GATHER: 'Scatter-Gather',
  SAGA: 'Saga / Compensation',
  ORCHESTRATION: 'Orchestration',
  POLLING: 'Polling / Scheduler',
  BATCH: 'Batch Processing',
  EVENT_DRIVEN: 'Event-Driven',
  UNKNOWN: 'Unknown',
};

export interface CatalogEntry {
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  pattern: CatalogPatternType;
  confidence: number;
  reasons: string[];
  s4Recommendation: string;
  adapterTypes: string[];
  runtimeStatus: string;
}

export interface PatternCatalogResult {
  entries: CatalogEntry[];
  totalCataloged: number;
  patternCounts: Record<CatalogPatternType, number>;
  uniquePatterns: number;
  s4Recommendations: { pattern: CatalogPatternType; recommendation: string; count: number }[];
}
