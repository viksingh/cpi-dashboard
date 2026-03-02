import ExcelJS from 'exceljs';
import { downloadFile } from '@/components/shared/export-toolbar';

interface SheetData {
  name: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

export async function exportExcel(sheets: SheetData[], filename: string) {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.substring(0, 31));

    // Header row
    const headerRow = ws.addRow(sheet.headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Data rows
    for (const row of sheet.rows) {
      ws.addRow(row);
    }

    // Auto-fit column widths (approximate)
    ws.columns.forEach((col, i) => {
      let maxLen = sheet.headers[i]?.length || 10;
      for (const row of sheet.rows) {
        const val = row[i];
        if (val !== null && val !== undefined) {
          maxLen = Math.max(maxLen, String(val).length);
        }
      }
      col.width = Math.min(maxLen + 2, 50);
    });

    // Freeze header row
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(buffer as ArrayBuffer, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
