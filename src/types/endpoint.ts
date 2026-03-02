export type EndpointType =
  | 'HTTP_REST' | 'SOAP' | 'ODATA' | 'RFC' | 'IDOC' | 'JDBC' | 'SFTP'
  | 'MAIL' | 'JMS' | 'PROCESS_DIRECT' | 'SUCCESSFACTORS' | 'ARIBA'
  | 'AMQP' | 'AS2' | 'AS4' | 'ELSTER' | 'XI' | 'KAFKA' | 'UNKNOWN';

export const EndpointTypeLabels: Record<EndpointType, string> = {
  HTTP_REST: 'HTTP/REST', SOAP: 'SOAP', ODATA: 'OData', RFC: 'RFC',
  IDOC: 'IDoc', JDBC: 'JDBC', SFTP: 'SFTP', MAIL: 'Mail', JMS: 'JMS',
  PROCESS_DIRECT: 'ProcessDirect', SUCCESSFACTORS: 'SuccessFactors',
  ARIBA: 'Ariba', AMQP: 'AMQP', AS2: 'AS2', AS4: 'AS4', ELSTER: 'ELSTER',
  XI: 'XI/PI', KAFKA: 'Kafka', UNKNOWN: 'Unknown',
};

export function classifyEndpointType(adapterType: string | null): EndpointType {
  if (!adapterType) return 'UNKNOWN';
  const lower = adapterType.toLowerCase().trim();

  if (lower === 'processdirect' || lower === 'process_direct') return 'PROCESS_DIRECT';
  if (lower === 'soap' || lower.startsWith('soap_')) return 'SOAP';
  if (lower === 'idoc' || lower.startsWith('idoc_')) return 'IDOC';
  if (lower === 'rfc' || lower.startsWith('rfc_')) return 'RFC';
  if (lower === 'sftp' || lower.startsWith('sftp_')) return 'SFTP';
  if (lower === 'jdbc' || lower.startsWith('jdbc_')) return 'JDBC';
  if (lower === 'jms' || lower.startsWith('jms_')) return 'JMS';
  if (lower === 'amqp' || lower.startsWith('amqp_')) return 'AMQP';
  if (lower === 'as2' || lower.startsWith('as2_')) return 'AS2';
  if (lower === 'as4' || lower.startsWith('as4_')) return 'AS4';
  if (lower === 'kafka' || lower.startsWith('kafka_')) return 'KAFKA';
  if (lower === 'elster') return 'ELSTER';
  if (lower === 'mail' || lower === 'imap' || lower === 'smtp' || lower === 'pop3') return 'MAIL';
  if (lower.includes('odata')) return 'ODATA';
  if (lower.includes('successfactors') || lower.includes('sfsf')) return 'SUCCESSFACTORS';
  if (lower.includes('ariba')) return 'ARIBA';
  if (lower === 'xi' || lower.startsWith('xi_')) return 'XI';
  if (lower === 'http' || lower === 'https' || lower.startsWith('http_') || lower.includes('rest') || lower.includes('http')) return 'HTTP_REST';

  return 'UNKNOWN';
}

export type MigrationStatus =
  | 'NOT_ASSESSED' | 'NO_CHANGE' | 'NEEDS_UPDATE' | 'IN_PROGRESS'
  | 'MIGRATED' | 'DEPRECATED';

export interface EndpointInfo {
  endpointId: string;
  iflowId: string;
  iflowName: string;
  packageId: string;
  packageName: string;
  adapterType: string;
  endpointType: EndpointType;
  direction: string;
  address: string;
  transportProtocol: string;
  messageProtocol: string;
  migrationStatus: MigrationStatus;
  migrationNotes: string;
  eccRelated: boolean;
  eccIndicator: string;
  runtimeStatus: string;
  sourceFile: string;
  sourceLine: number;
  fromScript: boolean;
}

export interface EndpointInventory {
  tenantUrl: string;
  totalPackages: number;
  totalFlows: number;
  flowsParsed: number;
  flowsWithEndpoints: number;
  allEndpoints: EndpointInfo[];
}
