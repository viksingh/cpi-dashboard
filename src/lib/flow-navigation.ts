export function flowLink(toolPath: string, flowId: string): string {
  return `${toolPath}?flowId=${encodeURIComponent(flowId)}`;
}
