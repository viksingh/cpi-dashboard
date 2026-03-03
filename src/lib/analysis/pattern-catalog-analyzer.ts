/**
 * PatternCatalogAnalyzer — classifies iFlow integration patterns with
 * S/4HANA migration recommendations. Extended pattern set including
 * point-to-point, saga, scatter-gather, event-driven.
 */

import type { ExtractionResult, RuntimeArtifact } from '@/types/cpi';
import type { CatalogEntry, PatternCatalogResult, CatalogPatternType } from '@/types/pattern-catalog';

const S4_RECOMMENDATIONS: Record<CatalogPatternType, string> = {
  POINT_TO_POINT: 'Consider Event Mesh or direct S/4 API integration. Evaluate if intermediary is still needed.',
  REQUEST_REPLY: 'Migrate to S/4 OData V4 or SOAP APIs. Update endpoint URLs and authentication.',
  PUBLISH_SUBSCRIBE: 'Migrate to SAP Event Mesh or S/4 Event-Driven Architecture. Evaluate topic structure.',
  STORE_FORWARD: 'Keep JMS queues; update backend endpoints to S/4. Consider AEM for cloud-native.',
  CONTENT_ROUTING: 'Review routing conditions for S/4 message format changes. Update XPath/conditions.',
  SCATTER_GATHER: 'Validate all target systems for S/4 compatibility. Update parallel branch endpoints.',
  SAGA: 'Review compensation logic for S/4 API compatibility. Update rollback endpoints.',
  ORCHESTRATION: 'Map subprocess calls to S/4 equivalents. Update all downstream endpoint references.',
  POLLING: 'Update polling endpoints to S/4 APIs. Consider S/4 push-based alternatives.',
  BATCH: 'Review file formats and mappings for S/4 compatibility. Update IDoc/BAPI structures.',
  EVENT_DRIVEN: 'Migrate to S/4 Business Events. Map event types to S/4 event catalog.',
  UNKNOWN: 'Manual review required to determine migration path.',
};

export function analyzeFromSnapshot(result: ExtractionResult): PatternCatalogResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) packageNames.set(pkg.id, pkg.name);

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) runtimeMap.set(rt.id, rt);

  const patternCounts: Record<CatalogPatternType, number> = {
    POINT_TO_POINT: 0, REQUEST_REPLY: 0, PUBLISH_SUBSCRIBE: 0, STORE_FORWARD: 0,
    CONTENT_ROUTING: 0, SCATTER_GATHER: 0, SAGA: 0, ORCHESTRATION: 0,
    POLLING: 0, BATCH: 0, EVENT_DRIVEN: 0, UNKNOWN: 0,
  };
  const entries: CatalogEntry[] = [];

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;

    const adapters = content.adapters || [];
    const routes = content.routes || [];
    const types = adapters.map((a) => (a.adapterType ?? '').toLowerCase());
    const senders = adapters.filter((a) => a.direction?.toLowerCase() === 'sender');
    const receivers = adapters.filter((a) => a.direction?.toLowerCase() === 'receiver');

    const hasJms = types.some((t) => t === 'jms' || t.startsWith('jms_'));
    const hasAmqp = types.some((t) => t === 'amqp' || t.startsWith('amqp_'));
    const hasKafka = types.some((t) => t === 'kafka' || t.startsWith('kafka_'));
    const hasPD = types.some((t) => t === 'processdirect' || t === 'process_direct');
    const hasTimer = senders.some((a) => (a.adapterType ?? '').toLowerCase() === 'timer');
    const hasSftp = types.some((t) => t === 'sftp' || t.startsWith('sftp_'));

    const hasRouter = routes.some((r) =>
      r.activityType?.toLowerCase().includes('router') || r.componentType?.toLowerCase().includes('router'));
    const hasMulticast = routes.some((r) =>
      r.activityType?.toLowerCase().includes('multicast') || r.componentType?.toLowerCase().includes('multicast'));
    const hasSplitter = routes.some((r) =>
      r.activityType?.toLowerCase().includes('splitter') || r.componentType?.toLowerCase().includes('splitter'));
    const hasAggregator = routes.some((r) =>
      r.activityType?.toLowerCase().includes('aggregat') || r.componentType?.toLowerCase().includes('aggregat'));
    const hasExceptionSubprocess = routes.some((r) =>
      r.type?.toLowerCase().includes('exception') || r.componentType?.toLowerCase().includes('exception'));

    const reasons: string[] = [];
    let pattern: CatalogPatternType = 'UNKNOWN';
    let confidence = 50;

    // Priority classification
    if (hasTimer && (hasSftp || hasSplitter || hasAggregator)) {
      pattern = 'BATCH'; confidence = 90;
      reasons.push('Timer-triggered with file/split processing');
    } else if (hasTimer) {
      pattern = 'POLLING'; confidence = 85;
      reasons.push('Timer/scheduler-triggered');
    } else if (hasMulticast && hasSplitter && hasAggregator) {
      pattern = 'SCATTER_GATHER'; confidence = 85;
      reasons.push('Multicast with splitter and aggregator (scatter-gather)');
    } else if (hasExceptionSubprocess && hasPD && receivers.length >= 2) {
      pattern = 'SAGA'; confidence = 70;
      reasons.push('Orchestration with exception/compensation subprocess');
    } else if ((hasJms || hasAmqp || hasKafka) && hasMulticast) {
      pattern = 'PUBLISH_SUBSCRIBE'; confidence = 85;
      reasons.push('Message broker with multicast');
    } else if (hasJms || hasAmqp) {
      pattern = 'STORE_FORWARD'; confidence = 80;
      reasons.push('JMS/AMQP message queue');
    } else if (hasKafka) {
      pattern = 'EVENT_DRIVEN'; confidence = 80;
      reasons.push('Kafka event streaming');
    } else if (hasRouter) {
      pattern = 'CONTENT_ROUTING'; confidence = 80;
      reasons.push('Content-based router');
    } else if (hasPD && receivers.length >= 2) {
      pattern = 'ORCHESTRATION'; confidence = 75;
      reasons.push('ProcessDirect orchestration with multiple receivers');
    } else if (senders.length === 1 && receivers.length === 1 && !hasPD && !hasJms) {
      pattern = 'POINT_TO_POINT'; confidence = 80;
      reasons.push('Single sender to single receiver (point-to-point)');
    } else if (senders.length > 0 && receivers.length > 0) {
      pattern = 'REQUEST_REPLY'; confidence = 65;
      reasons.push('Request-reply pattern');
    } else {
      pattern = 'UNKNOWN'; confidence = 30;
      reasons.push('Unable to classify');
    }

    patternCounts[pattern]++;
    entries.push({
      flowId: flow.id,
      flowName: flow.name,
      packageId: flow.packageId ?? '',
      packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
      pattern,
      confidence,
      reasons,
      s4Recommendation: S4_RECOMMENDATIONS[pattern],
      adapterTypes: [...new Set(adapters.map((a) => a.adapterType ?? ''))],
      runtimeStatus: runtimeMap.get(flow.id)?.status ?? 'NOT_DEPLOYED',
    });
  }

  const s4Recommendations = Object.entries(patternCounts)
    .filter(([, count]) => count > 0)
    .map(([pattern, count]) => ({
      pattern: pattern as CatalogPatternType,
      recommendation: S4_RECOMMENDATIONS[pattern as CatalogPatternType],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    entries,
    totalCataloged: entries.length,
    patternCounts,
    uniquePatterns: Object.values(patternCounts).filter((c) => c > 0).length,
    s4Recommendations,
  };
}
