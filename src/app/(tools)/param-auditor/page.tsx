"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/param-audit-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { ParamAuditResult, ParamViolation } from "@/types/param-audit";
import { ParamViolationLabels } from "@/types/param-audit";

const columns: ColumnDef<ParamViolation, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "type", header: "Violation",
    cell: ({ row }) => <Badge variant="destructive">{ParamViolationLabels[row.original.type]}</Badge>,
  },
  { accessorKey: "source", header: "Source" },
  { accessorKey: "propertyKey", header: "Property" },
  {
    accessorKey: "currentValue", header: "Current Value",
    cell: ({ row }) => <span className="max-w-xs truncate block text-xs font-mono" title={row.original.currentValue}>{row.original.currentValue}</span>,
  },
  {
    accessorKey: "recommendation", header: "Recommendation",
    cell: ({ row }) => <span className="max-w-xs truncate block text-xs" title={row.original.recommendation}>{row.original.recommendation}</span>,
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

export default function ParamAuditorPage() {
  const [result, setResult] = useState<ParamAuditResult | null>(null);
  const handleLoad = (data: ExtractionResult) => setResult(analyzeFromSnapshot(data));

  const groupedByType = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, ParamViolation[]> = {};
    for (const v of result.violations) {
      const label = ParamViolationLabels[v.type];
      if (!groups[label]) groups[label] = [];
      groups[label].push(v);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Param Audit",
      headers: ["iFlow", "Package", "Violation", "Source", "Property", "Current Value", "Recommendation", "Status"],
      rows: result.violations.map((v) => [
        v.flowName, v.packageName, ParamViolationLabels[v.type], v.source,
        v.propertyKey, v.currentValue, v.recommendation, v.runtimeStatus,
      ]),
    }], "cpi-param-audit.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Externalized Parameter Auditor</h1>
        <p className="text-muted-foreground">Find hardcoded URLs, IPs, credentials, and non-externalized parameters</p>
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Load Snapshot</CardTitle>
        <CardDescription>Load a snapshot with parsed bundles for parameter audit</CardDescription></CardHeader>
        <CardContent><SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Analysis" /></CardContent></Card>
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{result.totalViolations}</p><p className="text-xs text-muted-foreground">Violations</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsWithViolations}</p><p className="text-xs text-muted-foreground">Flows Affected</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsScanned}</p><p className="text-xs text-muted-foreground">Flows Scanned</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{Object.values(result.typeCounts).filter((c) => c > 0).length}</p><p className="text-xs text-muted-foreground">Violation Types</p></CardContent></Card>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.typeCounts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).map(([type, count]) => (
              <Badge key={type} variant="outline">{ParamViolationLabels[type as keyof typeof ParamViolationLabels]}: {count}</Badge>
            ))}
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-param-audit.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalViolations})</TabsTrigger>
              <TabsTrigger value="type">By Type</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.violations} searchPlaceholder="Search violations..." /></TabsContent>
            <TabsContent value="type">
              <div className="space-y-6">{groupedByType.map(([type, items]) => (
                <div key={type}><h3 className="text-lg font-semibold mb-2">{type} ({items.length})</h3>
                  <DataTable columns={columns} data={items} searchPlaceholder={`Search ${type}...`} /></div>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
