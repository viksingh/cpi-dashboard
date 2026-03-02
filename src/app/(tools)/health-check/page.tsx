"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/health-check-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { HealthCheckResult, HealthCheckTarget } from "@/types/health-check";
import { HealthStatusLabels } from "@/types/health-check";

const columns: ColumnDef<HealthCheckTarget, unknown>[] = [
  { accessorKey: "hostname", header: "Hostname" },
  { accessorKey: "protocol", header: "Protocol" },
  { accessorKey: "adapterType", header: "Adapter" },
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "address", header: "Address",
    cell: ({ row }) => <span className="max-w-xs truncate block" title={row.original.address}>{row.original.address || "-"}</span>,
  },
  {
    accessorKey: "healthStatus", header: "Health",
    cell: ({ row }) => {
      const s = row.original.healthStatus;
      const v = s === "HEALTHY" ? "success" : s === "DEGRADED" ? "warning" : s === "UNREACHABLE" ? "destructive" : "secondary";
      return <Badge variant={v}>{HealthStatusLabels[s]}</Badge>;
    },
  },
  {
    accessorKey: "runtimeStatus", header: "Runtime",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
];

export default function HealthCheckPage() {
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const handleLoad = (data: ExtractionResult) => setResult(analyzeFromSnapshot(data));

  const hostGroups = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, HealthCheckTarget[]> = {};
    for (const t of result.targets) {
      if (!groups[t.hostname]) groups[t.hostname] = [];
      groups[t.hostname].push(t);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Health Check Targets",
      headers: ["Hostname", "Protocol", "Adapter", "iFlow", "Package", "Address", "Health", "Runtime"],
      rows: result.targets.map((t) => [
        t.hostname, t.protocol, t.adapterType, t.flowName, t.packageName,
        t.address, HealthStatusLabels[t.healthStatus], t.runtimeStatus,
      ]),
    }], "cpi-health-check.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connectivity Health Checker</h1>
        <p className="text-muted-foreground">Discover all endpoint targets for connectivity verification before and after cutover</p>
      </div>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Load Snapshot</CardTitle>
        <CardDescription>Load a snapshot with parsed bundles to discover all endpoint targets</CardDescription></CardHeader>
        <CardContent><SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Analysis" /></CardContent></Card>
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalTargets}</p><p className="text-xs text-muted-foreground">Endpoint Targets</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{hostGroups.length}</p><p className="text-xs text-muted-foreground">Unique Hosts</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-green-500">{result.healthyCount}</p><p className="text-xs text-muted-foreground">Healthy</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-yellow-500">{result.notTestedCount}</p><p className="text-xs text-muted-foreground">Not Tested</p></CardContent></Card>
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-health-check.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Targets ({result.totalTargets})</TabsTrigger>
              <TabsTrigger value="hosts">By Host ({hostGroups.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.targets} searchPlaceholder="Search targets..." /></TabsContent>
            <TabsContent value="hosts">
              <div className="space-y-6">{hostGroups.map(([host, items]) => (
                <div key={host}><h3 className="text-lg font-semibold mb-2">{host} ({items.length})</h3>
                  <DataTable columns={columns} data={items} searchPlaceholder={`Search ${host}...`} /></div>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
