"use client";

import { useState, useMemo } from "react";
import { SnapshotLoader } from "@/components/shared/snapshot-loader";
import { DataTable } from "@/components/shared/data-table";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { scoreFromSnapshot } from "@/lib/analysis/tech-debt-scorer";
import { exportExcel } from "@/exporters/excel-exporter";
import { exportGenericJson } from "@/exporters/json-exporter";
import type { ExtractionResult } from "@/types/cpi";
import type { ScoringResult, TechDebtScore, RiskLevel, DebtCategory } from "@/types/tech-debt";
import { DebtCategoryLabels } from "@/types/tech-debt";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const riskColors: Record<RiskLevel, string> = {
  LOW: "text-green-600 dark:text-green-400",
  MEDIUM: "text-yellow-600 dark:text-yellow-400",
  HIGH: "text-orange-600 dark:text-orange-400",
  CRITICAL: "text-red-600 dark:text-red-400",
};

const riskBadgeVariants: Record<RiskLevel, "success" | "warning" | "destructive" | "secondary"> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const PIE_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];

const scoreColumns: ColumnDef<TechDebtScore, unknown>[] = [
  {
    accessorKey: "compositeScore", header: "Score",
    cell: ({ row }) => (
      <span className={`font-bold ${riskColors[row.original.riskLevel]}`}>
        {row.original.compositeScore.toFixed(1)}
      </span>
    ),
  },
  {
    accessorKey: "riskLevel", header: "Risk",
    cell: ({ row }) => <Badge variant={riskBadgeVariants[row.original.riskLevel]}>{row.original.riskLevel}</Badge>,
  },
  { accessorKey: "iflowName", header: "iFlow" },
  { accessorKey: "packageName", header: "Package" },
  { accessorKey: "ageScore", header: "Age" },
  { accessorKey: "complexityScore", header: "Complexity" },
  { accessorKey: "missingErrorHandlingScore", header: "Error Handling" },
  { accessorKey: "deprecatedAdapterScore", header: "Deprecated" },
  { accessorKey: "hardcodedValueScore", header: "Hardcoded" },
  { accessorKey: "runtimeStatus", header: "Status" },
];

export default function TechDebtPage() {
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [selectedScore, setSelectedScore] = useState<TechDebtScore | null>(null);

  const handleLoad = (data: ExtractionResult) => {
    const scored = scoreFromSnapshot(data);
    setResult(scored);
  };

  const riskDistribution = useMemo(() => {
    if (!result) return [];
    const counts: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    result.scores.forEach((s) => counts[s.riskLevel]++);
    return [
      { name: "Low", value: counts.LOW },
      { name: "Medium", value: counts.MEDIUM },
      { name: "High", value: counts.HIGH },
      { name: "Critical", value: counts.CRITICAL },
    ].filter((d) => d.value > 0);
  }, [result]);

  const topScores = useMemo(
    () => result?.scores.slice().sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 15) || [],
    [result]
  );

  const radarData = useMemo(() => {
    if (!selectedScore) return [];
    return [
      { category: "Age", score: selectedScore.ageScore },
      { category: "Complexity", score: selectedScore.complexityScore },
      { category: "Error Handling", score: selectedScore.missingErrorHandlingScore },
      { category: "Deprecated", score: selectedScore.deprecatedAdapterScore },
      { category: "Hardcoded", score: selectedScore.hardcodedValueScore },
    ];
  }, [selectedScore]);

  const handleExportExcel = async () => {
    if (!result) return;
    await exportExcel(
      [{
        name: "Tech Debt Scores",
        headers: ["iFlow ID", "iFlow Name", "Package", "Composite", "Risk", "Age", "Complexity", "Error Handling", "Deprecated", "Hardcoded", "Status"],
        rows: result.scores.map((s) => [s.iflowId, s.iflowName, s.packageName || "", s.compositeScore, s.riskLevel, s.ageScore, s.complexityScore, s.missingErrorHandlingScore, s.deprecatedAdapterScore, s.hardcodedValueScore, s.runtimeStatus || ""]),
      }],
      "cpi-tech-debt.xlsx"
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tech Debt Scorer</h1>
        <p className="text-muted-foreground">Score iFlows on 5 technical debt categories and prioritize remediation</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Load Snapshot</CardTitle>
          <CardDescription>Load a snapshot with parsed bundles for technical debt scoring</CardDescription>
        </CardHeader>
        <CardContent>
          <SnapshotLoader onLoad={handleLoad} label="Load Snapshot for Scoring" />
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{result.scores.length}</p>
                <p className="text-xs text-muted-foreground">iFlows Scored</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-500">
                  {result.scores.filter((s) => s.riskLevel === "CRITICAL").length}
                </p>
                <p className="text-xs text-muted-foreground">Critical Risk</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-orange-500">
                  {result.scores.filter((s) => s.riskLevel === "HIGH").length}
                </p>
                <p className="text-xs text-muted-foreground">High Risk</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">
                  {result.scores.length > 0 ? (result.scores.reduce((s, r) => s + r.compositeScore, 0) / result.scores.length).toFixed(1) : "0"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </CardContent>
            </Card>
          </div>

          <ExportToolbar
            onExportExcel={handleExportExcel}
            onExportJson={() => exportGenericJson(result, "cpi-tech-debt.json")}
          />

          <Tabs defaultValue="table">
            <TabsList>
              <TabsTrigger value="table">Ranked Backlog</TabsTrigger>
              <TabsTrigger value="charts">Charts</TabsTrigger>
              <TabsTrigger value="detail">Detail View</TabsTrigger>
            </TabsList>

            <TabsContent value="table">
              <DataTable
                columns={scoreColumns}
                data={result.scores.slice().sort((a, b) => b.compositeScore - a.compositeScore)}
                searchPlaceholder="Search iFlows..."
              />
            </TabsContent>

            <TabsContent value="charts">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Risk Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={riskDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {riskDistribution.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Top 15 by Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topScores} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis type="category" dataKey="iflowName" width={120} tick={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Bar dataKey="compositeScore" fill="hsl(221.2, 83.2%, 53.3%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="detail">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 lg:col-span-1">
                  <p className="text-sm font-medium">Select an iFlow:</p>
                  <div className="max-h-96 overflow-auto space-y-1 border rounded-md p-2">
                    {result.scores.slice().sort((a, b) => b.compositeScore - a.compositeScore).map((s) => (
                      <button
                        key={s.iflowId}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors ${selectedScore?.iflowId === s.iflowId ? "bg-accent font-medium" : ""}`}
                        onClick={() => setSelectedScore(s)}
                      >
                        <span className={`font-mono ${riskColors[s.riskLevel]}`}>
                          {s.compositeScore.toFixed(0).padStart(3)}
                        </span>{" "}
                        {s.iflowName}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedScore && (
                  <div className="lg:col-span-2 space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{selectedScore.iflowName}</CardTitle>
                        <CardDescription>
                          Package: {selectedScore.packageName} | Score: {selectedScore.compositeScore.toFixed(1)} | Risk: {selectedScore.riskLevel}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                            <Radar dataKey="score" stroke="hsl(221.2, 83.2%, 53.3%)" fill="hsl(221.2, 83.2%, 53.3%)" fillOpacity={0.3} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Findings</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(Object.entries(selectedScore.findings) as [DebtCategory, string[]][]).map(
                            ([category, findings]) =>
                              findings.length > 0 && (
                                <div key={category}>
                                  <p className="font-medium text-sm">{DebtCategoryLabels[category]}</p>
                                  <ul className="mt-1 space-y-1">
                                    {findings.map((f, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 text-yellow-500 shrink-0" />
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
