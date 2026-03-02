// ── Cutover Runbook Executor types ───────────────────────────

export type RunbookStepType =
  | 'STOP_IFLOW'
  | 'START_IFLOW'
  | 'DEPLOY_IFLOW'
  | 'UNDEPLOY_IFLOW'
  | 'UPDATE_CREDENTIAL'
  | 'HEALTH_CHECK'
  | 'WAIT'
  | 'CUSTOM';

export const RunbookStepLabels: Record<RunbookStepType, string> = {
  STOP_IFLOW: 'Stop iFlow',
  START_IFLOW: 'Start iFlow',
  DEPLOY_IFLOW: 'Deploy iFlow',
  UNDEPLOY_IFLOW: 'Undeploy iFlow',
  UPDATE_CREDENTIAL: 'Update Credential',
  HEALTH_CHECK: 'Health Check',
  WAIT: 'Wait',
  CUSTOM: 'Custom Step',
};

export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ROLLED_BACK';

export interface RunbookStep {
  id: string;
  order: number;
  type: RunbookStepType;
  name: string;
  description: string;
  params: Record<string, string>;
  rollbackStepId: string | null;
  status: StepStatus;
  result: string;
  startedAt: string;
  completedAt: string;
}

export interface Runbook {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  steps: RunbookStep[];
  status: 'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  currentStepIndex: number;
}
