// ── Integration Requirement Doc Generator types ─────────────

export interface RequirementDoc {
  flowId: string;
  flowName: string;
  packageId: string;
  packageName: string;
  description: string;
  sender: string;
  receiver: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
  runtimeStatus: string;
  sourceSystem: string;
  targetSystem: string;
  protocols: string[];
  adapterTypes: string[];
  configurations: { key: string; value: string }[];
  scripts: string[];
  mappings: string[];
  eccRelated: boolean;
  eccIndicators: string[];
  errorHandling: string;
  proposedS4State: string;
}

export interface RequirementDocResult {
  documents: RequirementDoc[];
  totalFlows: number;
  eccFlows: number;
  generatedAt: string;
}
