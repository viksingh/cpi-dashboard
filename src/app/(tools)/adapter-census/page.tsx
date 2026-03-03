"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { useFlowIdFilter } from "@/hooks/use-flow-id-filter";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/adapter-census-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { AdapterTypeStat } from "@/types/adapter-census";

const columns: ColumnDef<AdapterTypeStat, unknown>[] = [
  { accessorKey: "adapterType", header: "Adapter Type" },
  { accessorKey: "count", header: "Total" },
  { accessorKey: "senderCount", header: "Sender" },
  { accessorKey: "receiverCount", header: "Receiver" },
  { accessorKey: "flowCount", header: "Flows" },
  {
    accessorKey: "eccRelated", header: "ECC",
    cell: ({ row }) => row.original.eccRelated ? <Badge variant="destructive">ECC</Badge> : <span className="text-muted-foreground">-</span>,
  },
  {
    accessorKey: "migrationEffort", header: "Effort",
    cell: ({ row }) => {
      const e = row.original.migrationEffort;
      const color = e === "HIGH" ? "text-red-600" : e === "MEDIUM" ? "text-yellow-600" : "text-green-600";
      return <span className={`font-medium ${color}`}>{e}</span>;
    },
  },
  { accessorKey: "migrationNotes", header: "Migration Notes" },
];

export default function AdapterCensusPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const initialFilter = useFlowIdFilter(extractionResult);

  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const eccStats = useMemo(() => result?.stats.filter((s) => s.eccRelated) || [], [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "Adapter Census",
      headers: ["Adapter Type", "Total", "Sender", "Receiver", "Flows", "ECC", "Effort", "Migration Notes"],
      rows: result.stats.map((s) => [
        s.adapterType, s.count, s.senderCount, s.receiverCount, s.flowCount,
        s.eccRelated ? "Yes" : "", s.migrationEffort, s.migrationNotes,
      ]),
    }], "cpi-adapter-census.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Adapter Type Census</h1>
        <p className="text-muted-foreground">Breakdown of adapter types with ECC migration effort analysis</p>
      </div>
      {hydrated && !result && <NoSnapshotPlaceholder />}
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalAdapters}</p><p className="text-xs text-muted-foreground">Total Adapters</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.uniqueTypes}</p><p className="text-xs text-muted-foreground">Unique Types</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{result.eccAdapterCount}</p><p className="text-xs text-muted-foreground">ECC Adapters</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsScanned}</p><p className="text-xs text-muted-foreground">Flows Scanned</p></CardContent></Card>
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-adapter-census.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Types ({result.stats.length})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccStats.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.stats} searchPlaceholder="Search adapter types..." initialFilter={initialFilter} /></TabsContent>
            <TabsContent value="ecc"><DataTable columns={columns} data={eccStats} searchPlaceholder="Search ECC adapters..." initialFilter={initialFilter} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
