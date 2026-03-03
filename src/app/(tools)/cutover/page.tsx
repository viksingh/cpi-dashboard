"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useExtractionStore } from "@/stores/extraction-store";
import { useStoreHydrated } from "@/hooks/use-store-hydration";
import { useFlowIdFilter } from "@/hooks/use-flow-id-filter";
import { NoSnapshotPlaceholder } from "@/components/shared/no-snapshot-placeholder";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ColumnDef } from "@tanstack/react-table";
import { analyzeFromSnapshot } from "@/lib/analysis/cutover-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { CutoverPlan, CutoverItem, CutoverRisk } from "@/types/cutover";
import { CutoverRiskLabels } from "@/types/cutover";
import { flowLink } from "@/lib/flow-navigation";

const riskColors: Record<CutoverRisk, string> = {
  LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const columns: ColumnDef<CutoverItem, unknown>[] = [
  {
    accessorKey: "wave", header: "Wave",
    cell: ({ row }) => {
      const w = row.original.wave;
      return w === -1 ? <Badge variant="destructive">Circular</Badge> : <Badge variant="outline">Wave {w}</Badge>;
    },
  },
  {
    accessorKey: "flowName", header: "iFlow",
    cell: ({ row }) => (
      <Link href={flowLink("/dependencies", row.original.flowId)} className="text-primary hover:underline">
        {row.original.flowName}
      </Link>
    ),
  },
  { accessorKey: "packageName", header: "Package" },
  {
    accessorKey: "risk", header: "Risk",
    cell: ({ row }) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${riskColors[row.original.risk]}`}>
        {CutoverRiskLabels[row.original.risk]}
      </span>
    ),
  },
  { accessorKey: "riskReason", header: "Risk Reason" },
  { accessorKey: "eccEndpointCount", header: "ECC Endpoints" },
  { accessorKey: "dependencyCount", header: "Dependencies" },
  {
    accessorKey: "dependsOn", header: "Depends On",
    cell: ({ row }) => {
      const deps = row.original.dependsOn;
      return deps.length > 0 ? (
        <span className="max-w-xs truncate block text-xs" title={deps.join(", ")}>
          {deps.join(", ")}
        </span>
      ) : "-";
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

export default function CutoverPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const initialFilter = useFlowIdFilter(extractionResult);

  const plan = useMemo(() => extractionResult ? analyzeFromSnapshot(extractionResult) : null, [extractionResult]);

  const allItems = useMemo(() => {
    if (!plan) return [];
    const items: CutoverItem[] = [];
    for (const wave of plan.waves) {
      items.push(...wave.items);
    }
    items.push(...plan.circularDeps);
    return items;
  }, [plan]);

  const handleExportExcel = async () => {
    if (!plan) return;
    const sheets = plan.waves.map((wave) => ({
      name: `Wave ${wave.waveNumber}`,
      headers: ["iFlow", "Package", "Risk", "Risk Reason", "ECC Endpoints", "Dependencies", "Depends On", "Status"],
      rows: wave.items.map((item) => [
        item.flowName, item.packageName, CutoverRiskLabels[item.risk],
        item.riskReason, item.eccEndpointCount, item.dependencyCount,
        item.dependsOn.join(", "), item.runtimeStatus,
      ]),
    }));

    if (plan.circularDeps.length > 0) {
      sheets.push({
        name: "Circular Dependencies",
        headers: ["iFlow", "Package", "Risk", "Risk Reason", "ECC Endpoints", "Dependencies", "Depends On", "Status"],
        rows: plan.circularDeps.map((item) => [
          item.flowName, item.packageName, CutoverRiskLabels[item.risk],
          item.riskReason, item.eccEndpointCount, item.dependencyCount,
          item.dependsOn.join(", "), item.runtimeStatus,
        ]),
      });
    }

    await exportExcel(sheets, "cpi-cutover-plan.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cutover Plan Generator</h1>
        <p className="text-muted-foreground">Auto-generate sequenced migration waves from dependency graph and ECC endpoints</p>
      </div>

      {hydrated && !plan && <NoSnapshotPlaceholder />}

      {plan && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{plan.totalWaves}</p>
                <p className="text-xs text-muted-foreground">Waves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{plan.eccFlows}</p>
                <p className="text-xs text-muted-foreground">ECC Flows</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{plan.nonEccFlows}</p>
                <p className="text-xs text-muted-foreground">Non-ECC Flows</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">{plan.circularDeps.length}</p>
                <p className="text-xs text-muted-foreground">Circular Dependencies</p>
              </CardContent>
            </Card>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(plan, "cpi-cutover-plan.json")}
          />

          <Tabs defaultValue="waves">
            <TabsList>
              <TabsTrigger value="waves">Wave View</TabsTrigger>
              <TabsTrigger value="plan">Full Plan ({allItems.length})</TabsTrigger>
              <TabsTrigger value="circular">Circular ({plan.circularDeps.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="waves">
              <div className="space-y-6">
                {plan.waves.map((wave) => (
                  <Card key={wave.waveNumber}>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        Wave {wave.waveNumber}
                        <Badge variant="secondary">{wave.totalFlows} flows</Badge>
                        {wave.eccFlows > 0 && <Badge variant="destructive">{wave.eccFlows} ECC</Badge>}
                      </CardTitle>
                      <div className="flex gap-2 mt-1">
                        {Object.entries(wave.riskSummary)
                          .filter(([, count]) => count > 0)
                          .map(([risk, count]) => (
                            <span key={risk} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${riskColors[risk as CutoverRisk]}`}>
                              {CutoverRiskLabels[risk as CutoverRisk]}: {count}
                            </span>
                          ))}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <DataTable columns={columns} data={wave.items} searchPlaceholder={`Search wave ${wave.waveNumber}...`} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="plan">
              <DataTable columns={columns} data={allItems} searchPlaceholder="Search all flows..." initialFilter={initialFilter} />
            </TabsContent>
            <TabsContent value="circular">
              {plan.circularDeps.length > 0 ? (
                <DataTable columns={columns} data={plan.circularDeps} searchPlaceholder="Search circular deps..." />
              ) : (
                <p className="text-muted-foreground text-center py-8">No circular dependencies found</p>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
