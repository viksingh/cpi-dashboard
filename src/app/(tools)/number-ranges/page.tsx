"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/number-range-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { NumberRangeReference } from "@/types/number-range";

const columns: ColumnDef<NumberRangeReference, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "numberRangeObject", header: "Object" },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "sourceFile", header: "File / Key" },
  { accessorKey: "lineNumber", header: "Line", cell: ({ row }) => row.original.lineNumber || "-" },
  {
    accessorKey: "matchedText", header: "Matched Text",
    cell: ({ row }) => <span className="max-w-xs truncate block text-xs font-mono" title={row.original.matchedText}>{row.original.matchedText}</span>,
  },
  {
    accessorKey: "context", header: "Context",
    cell: ({ row }) => <span className="max-w-xs truncate block text-xs" title={row.original.context}>{row.original.context}</span>,
  },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function NumberRangesPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const groupedByObject = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, NumberRangeReference[]> = {};
    for (const r of result.references) {
      if (!groups[r.numberRangeObject]) groups[r.numberRangeObject] = [];
      groups[r.numberRangeObject].push(r);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Number Ranges",
      headers: ["iFlow", "Package", "Object", "Source", "File/Key", "Line", "Matched Text", "Context", "Status"],
      rows: result.references.map((r) => [
        r.flowName, r.packageName, r.numberRangeObject, r.source, r.sourceFile,
        r.lineNumber || "", r.matchedText, r.context, r.runtimeStatus,
      ]),
    }], "cpi-number-ranges.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Number Range Usage Scanner</h1>
        <p className="text-muted-foreground">Scan for ECC number range references needing S/4 alignment</p>
      </div>
      {hydrated && !result && <NoSnapshotPlaceholder />}
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalReferences}</p><p className="text-xs text-muted-foreground">References Found</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.uniqueObjects}</p><p className="text-xs text-muted-foreground">Unique Objects</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-orange-500">{result.flowsWithReferences}</p><p className="text-xs text-muted-foreground">Flows Affected</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsScanned}</p><p className="text-xs text-muted-foreground">Flows Scanned</p></CardContent></Card>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.objectCounts).sort(([, a], [, b]) => b - a).map(([obj, count]) => (
              <Badge key={obj} variant="outline">{obj}: {count}</Badge>
            ))}
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-number-ranges.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalReferences})</TabsTrigger>
              <TabsTrigger value="grouped">By Object</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.references} searchPlaceholder="Search references..." /></TabsContent>
            <TabsContent value="grouped">
              <div className="space-y-6">{groupedByObject.map(([obj, items]) => (
                <div key={obj}><h3 className="text-lg font-semibold mb-2">{obj} ({items.length})</h3>
                  <DataTable columns={columns} data={items} searchPlaceholder={`Search ${obj}...`} /></div>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
