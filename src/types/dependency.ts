import type { IntegrationFlow } from './cpi';

export type DependencyType =
  | 'PROCESS_DIRECT'
  | 'HTTP_LOOPBACK'
  | 'SHARED_VALUE_MAPPING'
  | 'SHARED_SCRIPT'
  | 'DATA_STORE'
  | 'CONFIGURATION_REF';

export const DependencyTypeLabels: Record<DependencyType, string> = {
  PROCESS_DIRECT: 'ProcessDirect',
  HTTP_LOOPBACK: 'HTTP Loopback',
  SHARED_VALUE_MAPPING: 'Shared Value Mapping',
  SHARED_SCRIPT: 'Shared Script',
  DATA_STORE: 'DataStore',
  CONFIGURATION_REF: 'Configuration Ref',
};

export interface Dependency {
  sourceFlowId: string;
  sourceFlowName: string;
  sourcePackageId: string | null;
  targetFlowId: string;
  targetFlowName: string;
  targetPackageId: string | null;
  type: DependencyType;
  details: string;
}

export interface DependencyGraph {
  flowsById: Record<string, IntegrationFlow>;
  dependencies: Dependency[];
  unresolvedReferences: string[];
}
