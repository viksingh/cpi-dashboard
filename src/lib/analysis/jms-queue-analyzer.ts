import type { ExtractionResult, IFlowAdapter } from '@/types/cpi';
import type { JmsQueueRecord, JmsQueueFlow, JmsQueueStatus, JmsQueueInventory } from '@/types/jms-queue';

const JMS_QUEUE_KEYS = [
  'QueueName', 'queueName', 'Destination', 'destination', 'queue',
  'Queue', 'jms.queue', 'JMSQueue',
] as const;

function extractQueueName(adapter: IFlowAdapter): string | null {
  const props = adapter.properties;
  if (!props) return null;
  for (const key of JMS_QUEUE_KEYS) {
    const val = props[key];
    if (val && val.trim().length > 0) return val.trim();
  }
  return null;
}

export function analyzeFromSnapshot(result: ExtractionResult): JmsQueueInventory {
  const packageNames = new Map<string, string>();
  for (const pkg of result.packages) {
    packageNames.set(pkg.id, pkg.name);
  }

  // Build producer/consumer maps keyed by queue name
  const producers = new Map<string, JmsQueueFlow[]>();
  const consumers = new Map<string, JmsQueueFlow[]>();

  for (const flow of result.allFlows) {
    const content = flow.iflowContent;
    if (!content) continue;

    for (const adapter of content.adapters || []) {
      const type = (adapter.adapterType ?? '').toLowerCase();
      if (type !== 'jms' && !type.startsWith('jms_')) continue;

      const queueName = extractQueueName(adapter);
      if (!queueName) continue;

      const direction = (adapter.direction ?? '').toLowerCase();
      const flowRef: JmsQueueFlow = {
        flowId: flow.id,
        flowName: flow.name,
        packageName: packageNames.get(flow.packageId) ?? flow.packageId ?? '',
      };

      if (direction === 'receiver') {
        // Producer: flow sends TO queue
        if (!producers.has(queueName)) producers.set(queueName, []);
        producers.get(queueName)!.push(flowRef);
      } else if (direction === 'sender') {
        // Consumer: flow reads FROM queue
        if (!consumers.has(queueName)) consumers.set(queueName, []);
        consumers.get(queueName)!.push(flowRef);
      }
    }
  }

  // Collect all unique queue names
  const allQueueNames = new Set<string>();
  for (const q of producers.keys()) allQueueNames.add(q);
  for (const q of consumers.keys()) allQueueNames.add(q);

  const queues: JmsQueueRecord[] = [];

  for (const queueName of [...allQueueNames].sort()) {
    const qProducers = producers.get(queueName) ?? [];
    const qConsumers = consumers.get(queueName) ?? [];

    let status: JmsQueueStatus = 'healthy';
    if (qProducers.length > 0 && qConsumers.length === 0) {
      status = 'orphan_producer';
    } else if (qProducers.length === 0 && qConsumers.length > 0) {
      status = 'orphan_consumer';
    } else if (qProducers.length > 1) {
      status = 'multi_producer';
    }

    queues.push({
      queueName,
      producers: qProducers,
      consumers: qConsumers,
      producerCount: qProducers.length,
      consumerCount: qConsumers.length,
      status,
    });
  }

  return {
    queues,
    totalQueues: queues.length,
    healthyQueues: queues.filter((q) => q.status === 'healthy').length,
    orphanProducers: queues.filter((q) => q.status === 'orphan_producer').length,
    orphanConsumers: queues.filter((q) => q.status === 'orphan_consumer').length,
    multiProducerQueues: queues.filter((q) => q.status === 'multi_producer').length,
  };
}
