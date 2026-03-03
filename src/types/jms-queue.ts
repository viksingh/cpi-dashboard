export type JmsQueueStatus = 'healthy' | 'orphan_producer' | 'orphan_consumer' | 'multi_producer';

export const JmsQueueStatusLabels: Record<JmsQueueStatus, string> = {
  healthy: 'Healthy',
  orphan_producer: 'Orphan Producer',
  orphan_consumer: 'Orphan Consumer',
  multi_producer: 'Multi-Producer',
};

export interface JmsQueueFlow {
  flowId: string;
  flowName: string;
  packageName: string;
}

export interface JmsQueueRecord {
  queueName: string;
  producers: JmsQueueFlow[];
  consumers: JmsQueueFlow[];
  producerCount: number;
  consumerCount: number;
  status: JmsQueueStatus;
}

export interface JmsQueueInventory {
  queues: JmsQueueRecord[];
  totalQueues: number;
  healthyQueues: number;
  orphanProducers: number;
  orphanConsumers: number;
  multiProducerQueues: number;
}
