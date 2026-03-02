// ── Integration Pattern Classifier types ─────────────────────

export type PatternType =
  | 'SYNC_REQUEST_REPLY'
  | 'ASYNC_FIRE_FORGET'
  | 'STORE_FORWARD'
  | 'PUBLISH_SUBSCRIBE'
  | 'CONTENT_ROUTING'
  | 'ORCHESTRATION'
  | 'POLLING'
  | 'BATCH'
  | 'UNKNOWN';

export const PatternTypeLabels: Record<PatternType, string> = {
  SYNC_REQUEST_REPLY: 'Sync Request-Reply',
  ASYNC_FIRE_FORGET: 'Async Fire & Forget',
  STORE_FORWARD: 'Store & Forward',
  PUBLISH_SUBSCRIBE: 'Publish/Subscribe',
  CONTENT_ROUTING: 'Content-Based Routing',
  ORCHESTRATION: 'Orchestration',
  POLLING: 'Polling',
  BATCH: 'Batch Processing',
  UNKNOWN: 'Unknown',
};

export interface PatternClassification {
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  pattern: PatternType;
  confidence: number;
  reasons: string[];
  adapterTypes: string[];
  hasJms: boolean;
  hasProcessDirect: boolean;
  hasTimer: boolean;
  hasSplitter: boolean;
  hasAggregator: boolean;
  routeCount: number;
  runtimeStatus: string;
}

export interface PatternResult {
  classifications: PatternClassification[];
  totalClassified: number;
  uniquePatterns: number;
  mostCommon: PatternType;
  lowConfidenceCount: number;
  patternCounts: Record<PatternType, number>;
}
