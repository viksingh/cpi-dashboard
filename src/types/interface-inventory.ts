import { classifyEndpointType, type EndpointType } from './endpoint';

export type ProtocolType = EndpointType; // Reuse the same classification
export const classifyProtocolType = classifyEndpointType;

export interface InterfaceRecord {
  recordId: string;
  iflowId: string;
  iflowName: string;
  iflowVersion: string;
  packageId: string;
  packageName: string;
  sourceSystemName: string;
  targetSystemName: string;
  direction: string;
  adapterType: string;
  protocolType: ProtocolType;
  transportProtocol: string;
  messageProtocol: string;
  address: string;
  runtimeStatus: string;
  eccRelated: boolean;
  eccIndicator: string;
  modifiedBy: string;
  modifiedAt: string;
}

export interface InterfaceInventory {
  tenantUrl: string;
  totalPackages: number;
  totalFlows: number;
  flowsParsed: number;
  flowsWithInterfaces: number;
  allInterfaces: InterfaceRecord[];
}
