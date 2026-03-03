"use client";

import { useMemo } from "react";
import Link from "next/link";
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
import { analyzeFromSnapshot } from "@/lib/analysis/jms-queue-analyzer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { JmsQueueRecord, JmsQueueStatus } from "@/types/jms-queue";
import { JmsQueueStatusLabels } from "@/types/jms-queue";
import { flowLink } from "@/lib/flow-navigation";

const statusColors: Record<JmsQueueStatus, string> = {
  healthy: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  orphan_producer: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  orphan_consumer: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  multi_producer: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

function FlowLinks({ flows, toolPath }: { flows: { flowId: string; flowName: string }[]; toolPath: string }) {
  if (flows.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="max-w-xs block">
      {flows.map((f, i) => (
        <span key={f.flowId}>
          {i > 0 && ", "}
          <Link
            href={flowLink(toolPath, f.flowId)}
            className="text-primary hover:underline"
          >
            {f.flowName}
          </Link>
        </span>
      ))}
    </span>
  );
}

const columns: ColumnDef<JmsQueueRecord, unknown>[] = [
  { accessorKey: "queueName", header: "Queue Name" },
  {
    accessorKey: "producers", header: "Producers",
    cell: ({ row }) => <FlowLinks flows={row.original.producers} toolPath="/normalized-flows" />,
    filterFn: (row, _, filterValue) => {
      const val = (filterValue as string).toLowerCase();
      return row.original.queueName.toLowerCase().includes(val)
        || row.original.producers.some((p) => p.flowName.toLowerCase().includes(val))
        || row.original.consumers.some((c) => c.flowName.toLowerCase().includes(val));
    },
  },
  {
    accessorKey: "consumers", header: "Consumers",
    cell: ({ row }) => <FlowLinks flows={row.original.consumers} toolPath="/normalized-flows" />,
  },
  { accessorKey: "producerCount", header: "# Producers" },
  { accessorKey: "consumerCount", header: "# Consumers" },
  {
    accessorKey: "status", header: "Status",
    cell: ({ row }) => (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[row.original.status]}`}>
        {JmsQueueStatusLabels[row.original.status]}
      </span>
    ),
  },
];

export default function JmsQueuesPage() {
  const extractionResult = useExtractionStore((s) => s.result);
  const hydrated = useStoreHydrated();
  const initialFilter = useFlowIdFilter(extractionResult);

  const result = useMemo(
    () => (extractionResult ? analyzeFromSnapshot(extractionResult) : null),
    [extractionResult]
  );

  const orphans = useMemo(
    () => result?.queues.filter((q) => q.status !== "healthy") ?? [],
    [result]
  );

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [
        {
          name: "JMS Queues",
          headers: ["Queue Name", "Producers", "Consumers", "# Producers", "# Consumers", "Status"],
          rows: result.queues.map((q) => [
            q.queueName,
            q.producers.map((p) => p.flowName).join(", "),
            q.consumers.map((c) => c.flowName).join(", "),
            q.producerCount,
            q.consumerCount,
            JmsQueueStatusLabels[q.status],
          ]),
        },
      ],
      "cpi-jms-queues.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">JMS Queue Inventory</h1>
        <p className="text-muted-foreground">
          All JMS queues with producer/consumer flows and orphan detection
        </p>
      </div>

      {hydrated && !result && <NoSnapshotPlaceholder />}

      {result && (
        <>
          <div className="grid gap-4 sm:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.totalQueues}</p>
                <p className="text-xs text-muted-foreground">Total Queues</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-green-600">{result.healthyQueues}</p>
                <p className="text-xs text-muted-foreground">Healthy</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">{result.orphanProducers}</p>
                <p className="text-xs text-muted-foreground">Orphan Producers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">{result.orphanConsumers}</p>
                <p className="text-xs text-muted-foreground">Orphan Consumers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-yellow-600">{result.multiProducerQueues}</p>
                <p className="text-xs text-muted-foreground">Multi-Producer</p>
              </CardContent>
            </Card>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-jms-queues.json")}
          />

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Queues ({result.queues.length})</TabsTrigger>
              <TabsTrigger value="orphans">Orphans ({orphans.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <DataTable
                columns={columns}
                data={result.queues}
                searchPlaceholder="Search queues or flow names..."
                initialFilter={initialFilter}
              />
            </TabsContent>
            <TabsContent value="orphans">
              <DataTable
                columns={columns}
                data={orphans}
                searchPlaceholder="Search orphan queues..."
                initialFilter={initialFilter}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
