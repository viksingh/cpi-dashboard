"use client";

import { useMemo } from "react";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/interface-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { InterfaceInventory, InterfaceRecord } from "@/types/interface-inventory";
import { EndpointTypeLabels } from "@/types/endpoint";

const ifColumns: ColumnDef<InterfaceRecord, unknown>[] = [
  { accessorKey: "sourceSystemName", header: "Source System" },
  { accessorKey: "iflowName", header: "iFlow" },
  { accessorKey: "targetSystemName", header: "Target System" },
  {
    accessorKey: "protocolType", header: "Protocol",
    cell: ({ row }) => <Badge variant="outline">{EndpointTypeLabels[row.original.protocolType] || row.original.protocolType}</Badge>,
  },
  { accessorKey: "direction", header: "Direction" },
  { accessorKey: "adapterType", header: "Adapter" },
  {
    accessorKey: "address", header: "Address",
    cell: ({ row }) => (
      <span className="max-w-xs truncate block" title={row.original.address}>
        {row.original.address || "-"}
      </span>
    ),
  },
  {
    accessorKey: "eccRelated", header: "ECC",
    cell: ({ row }) =>
      row.original.eccRelated ? <Badge variant="destructive">ECC</Badge> : <span className="text-muted-foreground">-</span>,
  },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
  { accessorKey: "packageName", header: "Package" },
];

export default function InventoryPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();

  const inventory = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const eccInterfaces = useMemo(
    () => inventory?.allInterfaces.filter((i) => i.eccRelated) || [],
    [inventory]
  );

  const systemPairs = useMemo(() => {
    if (!inventory) return [];
    const pairs: Record<string, InterfaceRecord[]> = {};
    inventory.allInterfaces.forEach((r) => {
      const key = `${r.sourceSystemName || "Unknown"} → ${r.targetSystemName || "Unknown"}`;
      (pairs[key] = pairs[key] || []).push(r);
    });
    return Object.entries(pairs).sort((a, b) => b[1].length - a[1].length);
  }, [inventory]);

  const protocolCounts = useMemo(() => {
    if (!inventory) return [];
    const counts: Record<string, number> = {};
    inventory.allInterfaces.forEach((r) => {
      const label = EndpointTypeLabels[r.protocolType] || r.protocolType;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [inventory]);

  const handleExportExcel = async () => {
    if (!inventory) return;
    await exportExcel(
      [{
        name: "Interfaces",
        headers: ["Source", "iFlow", "Target", "Protocol", "Direction", "Adapter", "Address", "ECC", "Status", "Package"],
        rows: inventory.allInterfaces.map((r) => [
          r.sourceSystemName, r.iflowName, r.targetSystemName,
          EndpointTypeLabels[r.protocolType] || r.protocolType,
          r.direction, r.adapterType, r.address || "",
          r.eccRelated ? "Yes" : "", r.runtimeStatus || "", r.packageName,
        ]),
      }],
      "cpi-interface-inventory.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Interface Inventory</h1>
        <p className="text-muted-foreground">Source → iFlow → Target with protocol grouping and ECC classification</p>
      </div>

      {hydrated && !inventory && <NoSnapshotPlaceholder />}

      {inventory && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{inventory.allInterfaces.length}</p>
                <p className="text-xs text-muted-foreground">Interface Records</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{systemPairs.length}</p>
                <p className="text-xs text-muted-foreground">Unique System Pairs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{eccInterfaces.length}</p>
                <p className="text-xs text-muted-foreground">ECC-Related</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{inventory.flowsWithInterfaces}</p>
                <p className="text-xs text-muted-foreground">Flows with Interfaces</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {protocolCounts.map(([type, count]) => (
              <Badge key={type} variant="outline">{type}: {count}</Badge>
            ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(inventory, "cpi-interface-inventory.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({inventory.allInterfaces.length})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccInterfaces.length})</TabsTrigger>
              <TabsTrigger value="pairs">System Pairs ({systemPairs.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable columns={ifColumns} data={inventory.allInterfaces} searchPlaceholder="Search interfaces..." />
            </TabsContent>
            <TabsContent value="ecc">
              <DataTable columns={ifColumns} data={eccInterfaces} searchPlaceholder="Search ECC interfaces..." />
            </TabsContent>
            <TabsContent value="pairs">
              <div className="space-y-3">
                {systemPairs.map(([pair, records]) => (
                  <Card key={pair}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        {pair}
                        <Badge variant="secondary">{records.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {records.map((r) => (
                          <Badge key={r.recordId} variant="outline" className="text-xs">
                            {r.iflowName} ({EndpointTypeLabels[r.protocolType] || r.protocolType})
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
