/**
 * PatternAnalyzer — classifies iFlows by integration pattern
 * (sync, async, store-forward, polling, batch, etc.)
 * using adapter combo + route structure + JMS/Timer/ProcessDirect presence.
 */

import type {
  ExtractionResult,
  IntegrationFlow,
  IFlowContent,
  RuntimeArtifact,
} from '@/types/cpi';
import type {
  PatternClassification,
  PatternResult,
  PatternType,
} from '@/types/pattern';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeFromSnapshot(
  result: ExtractionResult,
): PatternResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const runtimeMap = new Map<string, RuntimeArtifact>();
  for (const rt of result.runtimeArtifacts) {
    runtimeMap.set(rt.id, rt);
  }

  const classifications: PatternClassification[] = [];
  const patternCounts: Record<PatternType, number> = {
    SYNC_REQUEST_REPLY: 0,
    ASYNC_FIRE_FORGET: 0,
    STORE_FORWARD: 0,
    PUBLISH_SUBSCRIBE: 0,
    CONTENT_ROUTING: 0,
    ORCHESTRATION: 0,
    POLLING: 0,
    BATCH: 0,
    UNKNOWN: 0,
  };

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;

    const c = classifyFlow(flow, content, packageNames, runtimeMap);
    classifications.push(c);
    patternCounts[c.pattern]++;
  }

  let mostCommon: PatternType = 'UNKNOWN';
  let maxCount = 0;
  for (const [p, count] of Object.entries(patternCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = p as PatternType;
    }
  }

  const uniquePatterns = Object.values(patternCounts).filter((c) => c > 0).length;
  const lowConfidenceCount = classifications.filter((c) => c.confidence < 60).length;

  return {
    classifications,
    totalClassified: classifications.length,
    uniquePatterns,
    mostCommon,
    lowConfidenceCount,
    patternCounts,
  };
}

// ---------------------------------------------------------------------------
// Classification logic (priority ordered)
// ---------------------------------------------------------------------------

function classifyFlow(
  flow: IntegrationFlow,
  content: IFlowContent,
  packageNames: Map<string, string>,
  runtimeMap: Map<string, RuntimeArtifact>,
): PatternClassification {
  const adapterTypes = content.adapters.map((a) => (a.adapterType ?? '').toLowerCase());
  const senderAdapters = content.adapters.filter((a) => a.direction?.toLowerCase() === 'sender');
  const receiverAdapters = content.adapters.filter((a) => a.direction?.toLowerCase() === 'receiver');

  const hasJms = adapterTypes.some((t) => t === 'jms' || t.startsWith('jms_'));
  const hasPD = adapterTypes.some((t) => t === 'processdirect' || t === 'process_direct');
  const hasTimer = senderAdapters.some(
    (a) => (a.adapterType ?? '').toLowerCase() === 'timer',
  );
  const hasSftp = adapterTypes.some((t) => t === 'sftp' || t.startsWith('sftp_'));
  const hasMail = adapterTypes.some((t) => t === 'mail' || t === 'imap' || t === 'smtp' || t === 'pop3');

  const hasSplitter = content.routes.some(
    (r) => r.activityType?.toLowerCase().includes('splitter') ||
           r.componentType?.toLowerCase().includes('splitter'),
  );
  const hasAggregator = content.routes.some(
    (r) => r.activityType?.toLowerCase().includes('aggregat') ||
           r.componentType?.toLowerCase().includes('aggregat'),
  );
  const hasRouter = content.routes.some(
    (r) => r.activityType?.toLowerCase().includes('router') ||
           r.componentType?.toLowerCase().includes('router') ||
           r.type?.toLowerCase().includes('router'),
  );
  const hasMulticast = content.routes.some(
    (r) => r.activityType?.toLowerCase().includes('multicast') ||
           r.componentType?.toLowerCase().includes('multicast'),
  );

  const reasons: string[] = [];
  let pattern: PatternType = 'UNKNOWN';
  let confidence = 50;

  // Priority 1: BATCH — Timer sender + SFTP/JDBC + Splitter/Aggregator
  if (hasTimer && (hasSftp || hasMail) && (hasSplitter || hasAggregator)) {
    pattern = 'BATCH';
    confidence = 90;
    reasons.push('Timer-triggered with file/mail processing and splitter/aggregator');
  }
  // Priority 2: POLLING — Timer sender
  else if (hasTimer) {
    pattern = 'POLLING';
    confidence = 85;
    reasons.push('Timer-triggered sender adapter');
    if (hasSftp) { reasons.push('SFTP polling'); confidence = 90; }
    if (hasMail) { reasons.push('Mail polling'); confidence = 90; }
  }
  // Priority 3: STORE_FORWARD — JMS with persistence
  else if (hasJms && !hasMulticast) {
    pattern = 'STORE_FORWARD';
    confidence = 80;
    reasons.push('JMS adapter for store-and-forward messaging');
    if (hasSplitter) { reasons.push('With splitter for message decomposition'); }
  }
  // Priority 4: PUBLISH_SUBSCRIBE — JMS/AMQP with multicast
  else if (hasJms && hasMulticast) {
    pattern = 'PUBLISH_SUBSCRIBE';
    confidence = 85;
    reasons.push('JMS with multicast for publish/subscribe');
  }
  // Priority 5: ORCHESTRATION — ProcessDirect with multiple receivers
  else if (hasPD && receiverAdapters.length >= 2) {
    pattern = 'ORCHESTRATION';
    confidence = 75;
    reasons.push('ProcessDirect with multiple receiver adapters (orchestration)');
  }
  // Priority 6: CONTENT_ROUTING — Router steps
  else if (hasRouter) {
    pattern = 'CONTENT_ROUTING';
    confidence = 80;
    reasons.push('Content-based router detected');
    if (receiverAdapters.length >= 2) {
      reasons.push(`${receiverAdapters.length} receiver adapters`);
      confidence = 85;
    }
  }
  // Priority 7: ASYNC_FIRE_FORGET — One-way patterns (IDoc, JMS sender only)
  else if (
    senderAdapters.some((a) => {
      const t = (a.adapterType ?? '').toLowerCase();
      return t === 'idoc' || t.startsWith('idoc_');
    }) ||
    (senderAdapters.length > 0 && receiverAdapters.length === 0)
  ) {
    pattern = 'ASYNC_FIRE_FORGET';
    confidence = 70;
    reasons.push('One-way / async pattern (IDoc or no receiver)');
  }
  // Priority 8: SYNC_REQUEST_REPLY — HTTP/SOAP/OData sender + receiver
  else if (senderAdapters.length > 0 && receiverAdapters.length > 0) {
    pattern = 'SYNC_REQUEST_REPLY';
    confidence = 65;
    reasons.push('Sender + receiver adapters (request-reply pattern)');
    const hasSoap = adapterTypes.some((t) => t === 'soap' || t.startsWith('soap_'));
    const hasOdata = adapterTypes.some((t) => t.includes('odata'));
    const hasHttp = adapterTypes.some((t) => t === 'http' || t === 'https' || t.includes('rest'));
    if (hasSoap) { reasons.push('SOAP adapter'); confidence = 75; }
    if (hasOdata) { reasons.push('OData adapter'); confidence = 75; }
    if (hasHttp) { reasons.push('HTTP/REST adapter'); confidence = 70; }
  }
  // Priority 9: UNKNOWN
  else {
    pattern = 'UNKNOWN';
    confidence = 30;
    reasons.push('Unable to determine pattern from available metadata');
  }

  const rt = runtimeMap.get(flow.id);

  return {
    flowId: flow.id,
    flowName: flow.name,
    packageId: flow.packageId ?? '',
    packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
    pattern,
    confidence,
    reasons,
    adapterTypes: [...new Set(content.adapters.map((a) => a.adapterType ?? ''))],
    hasJms,
    hasProcessDirect: hasPD,
    hasTimer,
    hasSplitter,
    hasAggregator,
    routeCount: content.routes.length,
    runtimeStatus: rt?.status ?? 'NOT_DEPLOYED',
  };
}
