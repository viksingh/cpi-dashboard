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
import { analyzeFromSnapshot } from "@/lib/analysis/external-system-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExternalSystem } from "@/types/external-system";
import { SystemCategoryLabels } from "@/types/external-system";

const columns: ColumnDef<ExternalSystem, unknown>[] = [
  { accessorKey: "hostname", header: "Hostname" },
  {
    accessorKey: "category", header: "Category",
    cell: ({ row }) => {
      const c = row.original.category;
      const v = c === "ECC" ? "destructive" : c === "S4" ? "success" : "secondary";
      return <Badge variant={v}>{SystemCategoryLabels[c]}</Badge>;
    },
  },
  { accessorKey: "protocol", header: "Protocol" },
  { accessorKey: "flowCount", header: "Flows" },
  {
    accessorKey: "adapterTypes", header: "Adapter Types",
    cell: ({ row }) => row.original.adapterTypes.join(", "),
  },
  {
    accessorKey: "eccRelated", header: "ECC",
    cell: ({ row }) => row.original.eccRelated ? <Badge variant="destructive">ECC</Badge> : <span className="text-muted-foreground">-</span>,
  },
];

export default function ExternalSystemsPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const eccSystems = useMemo(() => result?.systems.filter((s) => s.eccRelated) || [], [result]);

  const groupedByCategory = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, ExternalSystem[]> = {};
    for (const s of result.systems) {
      const label = SystemCategoryLabels[s.category];
      if (!groups[label]) groups[label] = [];
      groups[label].push(s);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel([{
      name: "External Systems",
      headers: ["Hostname", "Category", "Protocol", "Flows", "Adapter Types", "ECC", "Addresses"],
      rows: result.systems.map((s) => [
        s.hostname, SystemCategoryLabels[s.category], s.protocol, s.flowCount,
        s.adapterTypes.join(", "), s.eccRelated ? "Yes" : "", s.addresses.join("; "),
      ]),
    }], "cpi-external-systems.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">External System Dependency Map</h1>
        <p className="text-muted-foreground">Graph of every external system the CPI tenant connects to</p>
      </div>
      {hydrated && !result && <NoSnapshotPlaceholder />}
      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.totalSystems}</p><p className="text-xs text-muted-foreground">External Systems</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{result.eccSystems}</p><p className="text-xs text-muted-foreground">ECC Systems</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{Object.values(result.categoryCounts).filter((c) => c > 0).length}</p><p className="text-xs text-muted-foreground">Categories</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-bold">{result.flowsScanned}</p><p className="text-xs text-muted-foreground">Flows Scanned</p></CardContent></Card>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.categoryCounts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).map(([cat, count]) => (
              <Badge key={cat} variant="outline">{SystemCategoryLabels[cat as keyof typeof SystemCategoryLabels]}: {count}</Badge>
            ))}
          </div>
          <ExportToolbar onExportExcel={handleExportExcel} onExportJson={() => exportGenericJson(result, "cpi-external-systems.json")} />
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalSystems})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccSystems.length})</TabsTrigger>
              <TabsTrigger value="category">By Category</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><DataTable columns={columns} data={result.systems} searchPlaceholder="Search systems..." /></TabsContent>
            <TabsContent value="ecc"><DataTable columns={columns} data={eccSystems} searchPlaceholder="Search ECC systems..." /></TabsContent>
            <TabsContent value="category">
              <div className="space-y-6">{groupedByCategory.map(([cat, items]) => (
                <div key={cat}><h3 className="text-lg font-semibold mb-2">{cat} ({items.length})</h3>
                  <DataTable columns={columns} data={items} searchPlaceholder={`Search ${cat}...`} /></div>
              ))}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
