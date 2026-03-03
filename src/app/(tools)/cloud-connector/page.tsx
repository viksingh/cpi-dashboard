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
import { analyzeFromSnapshot } from "@/lib/analysis/cloud-connector-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { CloudConnectorResult, CloudConnectorRoute } from "@/types/cloud-connector";
import { BackendTypeLabels } from "@/types/cloud-connector";

const columns: ColumnDef<CloudConnectorRoute, unknown>[] = [
  { accessorKey: "flowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "adapterType", header: "Adapter" },
  { accessorKey: "direction", header: "Direction" },
  { accessorKey: "virtualHost", header: "Virtual Host" },
  { accessorKey: "virtualPort", header: "Port" },
  { accessorKey: "locationId", header: "Location ID",
    cell: ({ row }) => row.original.locationId || "(default)",
  },
  {
    accessorKey: "address", header: "Address",
    cell: ({ row }) => (
      <span className="max-w-xs truncate block" title={row.original.address}>
        {row.original.address || "-"}
      </span>
    ),
  },
  {
    accessorKey: "backendType", header: "Backend",
    cell: ({ row }) => {
      const bt = row.original.backendType;
      const v = bt === "ECC" ? "destructive" : bt === "S4" ? "success" : "secondary";
      return <Badge variant={v}>{BackendTypeLabels[bt]}</Badge>;
    },
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

export default function CloudConnectorPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();

  const result = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const eccRoutes = useMemo(
    () => result?.routes.filter((r) => r.backendType === "ECC") || [],
    [result]
  );

  const groupedByLocation = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, CloudConnectorRoute[]> = {};
    for (const r of result.routes) {
      const loc = r.locationId || "(default)";
      if (!groups[loc]) groups[loc] = [];
      groups[loc].push(r);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const groupedByVHost = useMemo(() => {
    if (!result) return [];
    const groups: Record<string, CloudConnectorRoute[]> = {};
    for (const r of result.routes) {
      const vh = r.virtualHost ? `${r.virtualHost}:${r.virtualPort || "*"}` : "(unknown)";
      if (!groups[vh]) groups[vh] = [];
      groups[vh].push(r);
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [{
        name: "CC Routes",
        headers: ["iFlow", "Package", "Adapter", "Direction", "Virtual Host", "Port", "Location", "Address", "Backend", "Status"],
        rows: result.routes.map((r) => [
          r.flowName, r.packageName, r.adapterType, r.direction,
          r.virtualHost, r.virtualPort, r.locationId || "(default)",
          r.address, BackendTypeLabels[r.backendType], r.runtimeStatus,
        ]),
      }],
      "cpi-cloud-connector.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cloud Connector Route Mapper</h1>
        <p className="text-muted-foreground">Map all on-premise virtual hosts and routes for S/4 cutover</p>
      </div>

      {hydrated && !result && <NoSnapshotPlaceholder />}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.totalRoutes}</p>
                <p className="text-xs text-muted-foreground">Total Routes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{result.eccRoutes}</p>
                <p className="text-xs text-muted-foreground">ECC Routes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.uniqueLocations}</p>
                <p className="text-xs text-muted-foreground">Locations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.flowsUsingCC}</p>
                <p className="text-xs text-muted-foreground">Flows Using CC</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(result.backendTypeCounts)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <Badge key={type} variant="outline">
                  {BackendTypeLabels[type as keyof typeof BackendTypeLabels]}: {count}
                </Badge>
              ))}
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-cloud-connector.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({result.totalRoutes})</TabsTrigger>
              <TabsTrigger value="ecc">ECC ({eccRoutes.length})</TabsTrigger>
              <TabsTrigger value="location">By Location</TabsTrigger>
              <TabsTrigger value="vhost">By Virtual Host</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable columns={columns} data={result.routes} searchPlaceholder="Search routes..." />
            </TabsContent>
            <TabsContent value="ecc">
              <DataTable columns={columns} data={eccRoutes} searchPlaceholder="Search ECC routes..." />
            </TabsContent>
            <TabsContent value="location">
              <div className="space-y-6">
                {groupedByLocation.map(([location, routes]) => (
                  <div key={location}>
                    <h3 className="text-lg font-semibold mb-2">{location} ({routes.length})</h3>
                    <DataTable columns={columns} data={routes} searchPlaceholder={`Search ${location}...`} />
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="vhost">
              <div className="space-y-6">
                {groupedByVHost.map(([vhost, routes]) => (
                  <div key={vhost}>
                    <h3 className="text-lg font-semibold mb-2">{vhost} ({routes.length})</h3>
                    <DataTable columns={columns} data={routes} searchPlaceholder={`Search ${vhost}...`} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
