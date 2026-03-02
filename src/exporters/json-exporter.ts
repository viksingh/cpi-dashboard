import type { ExtractionResult } from '@/types/cpi';
import { downloadFile } from '@/components/shared/export-toolbar';

export function exportJson(data: ExtractionResult, prefix: string = 'cpi-snapshot') {
  const json = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(json, `${prefix}_${timestamp}.json`, 'application/json');
}

export function exportGenericJson(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, filename, 'application/json');
}
