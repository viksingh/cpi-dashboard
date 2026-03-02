"use client";

import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileJson, FileText } from "lucide-react";
import { toast } from "sonner";

interface ExportToolbarProps {
  onExportExcel?: () => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  disabled?: boolean;
}

export function ExportToolbar({ onExportExcel, onExportCsv, onExportJson, disabled }: ExportToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Export:</span>
      {onExportExcel && (
        <Button variant="outline" size="sm" disabled={disabled} onClick={onExportExcel}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel
        </Button>
      )}
      {onExportCsv && (
        <Button variant="outline" size="sm" disabled={disabled} onClick={onExportCsv}>
          <FileText className="h-3.5 w-3.5" />
          CSV
        </Button>
      )}
      {onExportJson && (
        <Button variant="outline" size="sm" disabled={disabled} onClick={onExportJson}>
          <FileJson className="h-3.5 w-3.5" />
          JSON
        </Button>
      )}
    </div>
  );
}

// Utility to trigger file download in browser
export function downloadFile(content: string | Blob | ArrayBuffer, filename: string, mimeType: string = "application/octet-stream") {
  const blob = content instanceof Blob
    ? content
    : content instanceof ArrayBuffer
      ? new Blob([content], { type: mimeType })
      : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported: ${filename}`);
}
