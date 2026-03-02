/**
 * NormalizedFlowAnalyzer — concatenates JMS/ProcessDirect-chained
 * iFlows into end-to-end logical flows separated by " ___ ".
 *
 * Steps:
 * 1. Scan adapters: JMS receiver = producer, JMS sender = consumer
 * 2. Extract queue/address names from adapter properties
 * 3. Same for ProcessDirect: receiver address = caller, sender address = target
 * 4. Build adjacency: outgoing[flowId] → [{targetFlowId, linkType, address}]
 * 5. Find entry points: flows with no inbound JMS/ProcessDirect
 * 6. Walk chains via DFS, detect circular chains
 * 7. Standalone = flows in neither incoming nor outgoing maps
 * 8. Broken = queue with producer but no consumer (or vice versa)
 */

import type {
  ExtractionResult,
  IntegrationFlow,
  IFlowContent,
  IFlowAdapter,
} from '@/types/cpi';
import type {
  NormalizedFlow,
  NormalizedFlowResult,
  FlowStep,
  FlowLinkage,
  FlowLinkType,
  BrokenLink,
} from '@/types/normalized-flow';

// ---------------------------------------------------------------------------
// Queue / address property keys
// ---------------------------------------------------------------------------

const JMS_QUEUE_KEYS = [
  'QueueName', 'queueName', 'Destination', 'destination', 'queue',
  'Queue', 'jms.queue', 'JMSQueue',
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeFromSnapshot(
  result: ExtractionResult,
): NormalizedFlowResult {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  const flowsById = new Map<string, IntegrationFlow>();
  const contentMap = new Map<string, IFlowContent>();
  let flowsParsed = 0;

  for (const flow of result.allFlows) {
    flowsById.set(flow.id, flow);
    if (flow.iflowContent) {
      contentMap.set(flow.id, flow.iflowContent);
      flowsParsed++;
    }
  }

  // Step 1-2: Build producer/consumer maps for JMS queues
  // JMS receiver adapter = producer (flow sends TO queue)
  // JMS sender adapter = consumer (flow reads FROM queue)
  const jmsProducers = new Map<string, { flowId: string; flowName: string }[]>();
  const jmsConsumers = new Map<string, { flowId: string; flowName: string }[]>();

  // Step 3: Build ProcessDirect maps
  // PD receiver adapter = caller (flow calls another)
  // PD sender adapter = target (flow exposes endpoint)
  const pdSenders = new Map<string, { flowId: string; flowName: string }>();

  for (const flow of result.allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const adapter of content.adapters) {
      const type = (adapter.adapterType ?? '').toLowerCase();
      const direction = (adapter.direction ?? '').toLowerCase();

      if (type === 'jms' || type.startsWith('jms_')) {
        const queueName = extractQueueName(adapter);
        if (!queueName) continue;

        if (direction === 'receiver') {
          // Producer: this flow writes to the queue
          if (!jmsProducers.has(queueName)) jmsProducers.set(queueName, []);
          jmsProducers.get(queueName)!.push({ flowId: flow.id, flowName: flow.name });
        } else if (direction === 'sender') {
          // Consumer: this flow reads from the queue
          if (!jmsConsumers.has(queueName)) jmsConsumers.set(queueName, []);
          jmsConsumers.get(queueName)!.push({ flowId: flow.id, flowName: flow.name });
        }
      }

      if (type === 'processdirect' || type === 'process_direct') {
        const address = normalizeAddress(adapter.address);
        if (!address) continue;

        if (direction === 'sender') {
          // Target: this flow exposes the PD endpoint
          pdSenders.set(address, { flowId: flow.id, flowName: flow.name });
        }
      }
    }
  }

  // Step 4: Build adjacency map
  const outgoing = new Map<string, FlowLinkage[]>();
  const incoming = new Set<string>();

  // JMS linkages: producer -> consumer (via queue)
  for (const [queueName, producers] of jmsProducers) {
    const consumers = jmsConsumers.get(queueName);
    if (!consumers) continue;
    for (const producer of producers) {
      for (const consumer of consumers) {
        if (producer.flowId === consumer.flowId) continue;
        const linkage: FlowLinkage = {
          sourceFlowId: producer.flowId,
          sourceFlowName: producer.flowName,
          targetFlowId: consumer.flowId,
          targetFlowName: consumer.flowName,
          linkType: 'JMS',
          address: queueName,
        };
        if (!outgoing.has(producer.flowId)) outgoing.set(producer.flowId, []);
        outgoing.get(producer.flowId)!.push(linkage);
        incoming.add(consumer.flowId);
      }
    }
  }

  // ProcessDirect linkages: caller -> target
  for (const flow of result.allFlows) {
    const content = contentMap.get(flow.id);
    if (!content) continue;

    for (const adapter of content.adapters) {
      const type = (adapter.adapterType ?? '').toLowerCase();
      const direction = (adapter.direction ?? '').toLowerCase();

      if ((type === 'processdirect' || type === 'process_direct') && direction === 'receiver') {
        const address = normalizeAddress(adapter.address);
        if (!address) continue;
        const target = pdSenders.get(address);
        if (!target || target.flowId === flow.id) continue;

        const linkage: FlowLinkage = {
          sourceFlowId: flow.id,
          sourceFlowName: flow.name,
          targetFlowId: target.flowId,
          targetFlowName: target.flowName,
          linkType: 'PROCESS_DIRECT',
          address,
        };
        if (!outgoing.has(flow.id)) outgoing.set(flow.id, []);
        outgoing.get(flow.id)!.push(linkage);
        incoming.add(target.flowId);
      }
    }
  }

  // Step 5: Find entry points (flows that produce/call but are not consumed/called)
  const connectedFlows = new Set<string>();
  for (const [flowId] of outgoing) connectedFlows.add(flowId);
  for (const flowId of incoming) connectedFlows.add(flowId);

  const entryPoints = new Set<string>();
  for (const [flowId] of outgoing) {
    if (!incoming.has(flowId)) {
      entryPoints.add(flowId);
    }
  }

  // Step 6: Walk chains via DFS
  const chains: NormalizedFlow[] = [];
  const circular: string[] = [];
  const visited = new Set<string>();

  for (const entryId of entryPoints) {
    const path: string[] = [];
    const pathSet = new Set<string>();
    const linkages: FlowLinkage[] = [];

    dfsWalk(entryId, outgoing, path, pathSet, linkages, circular, flowsById, packageNames);

    if (path.length > 0) {
      visited.add(entryId);
      for (const fid of path) visited.add(fid);

      const steps: FlowStep[] = path.map((fid) => {
        const f = flowsById.get(fid);
        return {
          flowId: fid,
          flowName: f?.name ?? fid,
          packageId: f?.packageId ?? '',
          packageName: packageNames.get(f?.packageId ?? '') ?? f?.packageId ?? '',
        };
      });

      const normalizedName = steps.map((s) => s.flowName).join(' ___ ');
      chains.push({
        normalizedName,
        steps,
        linkages,
        entryFlowId: entryId,
        entryFlowName: flowsById.get(entryId)?.name ?? entryId,
        length: steps.length,
      });
    }
  }

  // Step 7: Standalone = flows not part of any chain
  const standalone: FlowStep[] = [];
  for (const flow of result.allFlows) {
    if (!connectedFlows.has(flow.id)) {
      standalone.push({
        flowId: flow.id,
        flowName: flow.name,
        packageId: flow.packageId ?? '',
        packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
      });
    }
  }

  // Step 8: Broken links
  const broken: BrokenLink[] = [];
  for (const [queueName, producers] of jmsProducers) {
    if (!jmsConsumers.has(queueName)) {
      for (const p of producers) {
        broken.push({
          address: queueName,
          linkType: 'JMS' as FlowLinkType,
          producerFlowId: p.flowId,
          producerFlowName: p.flowName,
          consumerFlowId: null,
          consumerFlowName: null,
          reason: 'Queue has producer but no consumer',
        });
      }
    }
  }
  for (const [queueName, consumers] of jmsConsumers) {
    if (!jmsProducers.has(queueName)) {
      for (const c of consumers) {
        broken.push({
          address: queueName,
          linkType: 'JMS' as FlowLinkType,
          producerFlowId: null,
          producerFlowName: null,
          consumerFlowId: c.flowId,
          consumerFlowName: c.flowName,
          reason: 'Queue has consumer but no producer',
        });
      }
    }
  }

  const avgChainLength = chains.length > 0
    ? chains.reduce((sum, c) => sum + c.length, 0) / chains.length
    : 0;

  return {
    chains,
    standalone,
    broken,
    circular,
    totalFlows: result.allFlows.length,
    flowsParsed,
    avgChainLength: Math.round(avgChainLength * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// DFS chain walker
// ---------------------------------------------------------------------------

function dfsWalk(
  flowId: string,
  outgoing: Map<string, FlowLinkage[]>,
  path: string[],
  pathSet: Set<string>,
  linkages: FlowLinkage[],
  circular: string[],
  flowsById: Map<string, IntegrationFlow>,
  packageNames: Map<string, string>,
): void {
  if (pathSet.has(flowId)) {
    const flowName = flowsById.get(flowId)?.name ?? flowId;
    circular.push(`Circular: chain loops back to ${flowName}`);
    return;
  }

  path.push(flowId);
  pathSet.add(flowId);

  const links = outgoing.get(flowId);
  if (links && links.length > 0) {
    // Follow the first link (primary chain), record rest as additional linkages
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      linkages.push(link);
      if (i === 0) {
        dfsWalk(link.targetFlowId, outgoing, path, pathSet, linkages, circular, flowsById, packageNames);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractQueueName(adapter: IFlowAdapter): string | null {
  const props = adapter.properties;
  if (!props) return null;
  for (const key of JMS_QUEUE_KEYS) {
    const val = props[key];
    if (val && val.trim().length > 0) return val.trim();
  }
  return null;
}

function normalizeAddress(address: string | undefined | null): string | null {
  if (!address || address.trim().length === 0) return null;
  let normalized = address.trim().toLowerCase();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized;
}
