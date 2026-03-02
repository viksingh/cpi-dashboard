"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, AlertCircle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/endpoint-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { EndpointInventory, EndpointInfo } from "@/types/endpoint";
import { EndpointTypeLabels } from "@/types/endpoint";

const epColumns: ColumnDef<EndpointInfo, unknown>[] = [
  { accessorKey: "iflowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "endpointType", header: "Type",
    cell: ({ row }) => <Badge variant="outline">{EndpointTypeLabels[row.original.endpointType]}</Badge>,
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
      row.original.eccRelated ? (
        <Badge variant="destructive">ECC</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "runtimeStatus", header: "Status",
    cell: ({ row }) => {
      const s = row.original.runtimeStatus;
      const v = s === "STARTED" ? "success" : s === "ERROR" ? "destructive" : "secondary";
      return <Badge variant={v}>{s || "N/A"}</Badge>;
    },
  },
  {
    accessorKey: "fromScript", header: "Source",
    cell: ({ row }) => row.original.fromScript ? "Script" : "Adapter",
  },
];

export default function EndpointsPage() {
  const [inventory, setInventory] = useState<EndpointInventory | null>(null);

  const handleLoad = (data: ExtractionResult) => {
    const result = analyzeFromSnapshot(data);
    setInventory(result);
  };

  const eccEndpoints = useMemo(
    () => inventory?.allEndpoints.filter((e) => e.eccRelated) || [],
    [inventory]
  );
  const scriptEndpoints = useMemo(
    () => inventory?.allEndpoints.filter((e) => e.fromScript) || [],
    [inventory]
  );

  const typeCounts = useMemo(() => {
    if (!inventory) return [];
    const counts: Record<string, number> = {};
    inventory.allEndpoints.forEach((e) => {
      const label = EndpointTypeLabels[e.endpointType];
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [inventory]);

  const handleExportExcel = async () => {
    if (!inventory) return;
    await exportExcel(
      [{
        name: "Endpoints",
        headers: ["iFlow", "Package", "Type", "Direction", "Adapter", "Address", "ECC", "Status", "Source"],
        rows: inventory.allEndpoints.map((e) => [
          e.iflowName, e.packageName, EndpointTypeLabels[e.endpointType],
          e.direction, e.adapterType, e.address || "",
          e.eccRelated ? "Yes" : "", e.runtimeStatus || "", e.fromScript ? "Script" : "Adapter",
        ]),
      }],
      "cpi-endpoints.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Endpoint Tracker</h1>
        <p className="text-muted-foreground">Catalog endpoints, track ECC connections, and manage migration status</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Load Snapshot</CardTitle>
          <CardDescription>Load a snapshot with parsed bundles for endpoint analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Analysis" />
        </CardContent>
      </Card>

      {inventory && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{inventory.allEndpoints.length}</p>
                <p className="text-xs text-muted-foreground">Total Endpoints</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{eccEndpoints.length}</p>
                <p className="text-xs text-muted-foreground">ECC-Related</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{scriptEndpoints.length}</p>
                <p className="text-xs text-muted-foreground">From Scripts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{inventory.flowsWithEndpoints}</p>
                <p className="text-xs text-muted-foreground">Flows with Endpoints</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {typeCounts.map(([type, count]) => (
              <Badge key={type} variant="outline">{type}: {count}</Badge>
            ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(inventory, "cpi-endpoints.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({inventory.allEndpoints.length})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccEndpoints.length})</TabsTrigger>
              <TabsTrigger value="scripts">Scripts ({scriptEndpoints.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable columns={epColumns} data={inventory.allEndpoints} searchPlaceholder="Search endpoints..." />
            </TabsContent>
            <TabsContent value="ecc">
              <DataTable columns={epColumns} data={eccEndpoints} searchPlaceholder="Search ECC endpoints..." />
            </TabsContent>
            <TabsContent value="scripts">
              <DataTable columns={epColumns} data={scriptEndpoints} searchPlaceholder="Search script endpoints..." />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
