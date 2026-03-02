// ── Normalized Flow Mapper types ──────────────────────────────

export type FlowLinkType = 'JMS' | 'PROCESS_DIRECT';

export interface FlowLinkage {
  sourceFlowId: string;
  sourceFlowName: string;
  targetFlowId: string;
  targetFlowName: string;
  linkType: FlowLinkType;
  address: string;
}

export interface FlowStep {
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
}

export interface NormalizedFlow {
  normalizedName: string;
  steps: FlowStep[];
  linkages: FlowLinkage[];
  entryFlowId: string;
  entryFlowName: string;
  length: number;
}

export interface BrokenLink {
  address: string;
  linkType: FlowLinkType;
  producerFlowId: string | null;
  producerFlowName: string | null;
  consumerFlowId: string | null;
  consumerFlowName: string | null;
  reason: string;
}

export interface NormalizedFlowResult {
  chains: NormalizedFlow[];
  standalone: FlowStep[];
  broken: BrokenLink[];
  circular: string[];
  totalFlows: number;
  flowsParsed: number;
  avgChainLength: number;
}
