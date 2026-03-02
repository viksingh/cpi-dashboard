"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExportToolbar } from "@/components/shared/export-toolbar";
import { Upload, Plus, Trash2, Play, RotateCcw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportGenericJson } from "@/exporters/json-exporter";
import { exportExcel } from "@/exporters/excel-exporter";
import type { Runbook, RunbookStep, RunbookStepType, StepStatus } from "@/types/runbook";
import { RunbookStepLabels } from "@/types/runbook";

function newStep(order: number): RunbookStep {
  return {
    id: randomId(), order, type: "HEALTH_CHECK", name: "", description: "",
    params: {}, rollbackStepId: null, status: "PENDING", result: "",
    startedAt: "", completedAt: "",
  };
}

function newRunbook(): Runbook {
  return {
    id: randomId(), name: "New Cutover Runbook", description: "",
    createdAt: new Date().toISOString(), steps: [newStep(1)],
    status: "DRAFT", currentStepIndex: -1,
  };
}

const statusIcons: Record<StepStatus, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4 text-muted-foreground" />,
  RUNNING: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  SUCCESS: <CheckCircle className="h-4 w-4 text-green-500" />,
  FAILED: <XCircle className="h-4 w-4 text-red-500" />,
  SKIPPED: <Clock className="h-4 w-4 text-yellow-500" />,
  ROLLED_BACK: <RotateCcw className="h-4 w-4 text-orange-500" />,
};

export default function RunbookPage() {
  const [runbook, setRunbook] = useState<Runbook>(newRunbook());
  const fileInputRef = useState<HTMLInputElement | null>(null);

  const addStep = useCallback(() => {
    setRunbook((rb) => ({
      ...rb,
      steps: [...rb.steps, newStep(rb.steps.length + 1)],
    }));
  }, []);

  const removeStep = useCallback((stepId: string) => {
    setRunbook((rb) => ({
      ...rb,
      steps: rb.steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order: i + 1 })),
    }));
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<RunbookStep>) => {
    setRunbook((rb) => ({
      ...rb,
      steps: rb.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
    }));
  }, []);

  const handleLoadRunbook = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const loaded = JSON.parse(text) as Runbook;
      if (!loaded.steps || !Array.isArray(loaded.steps)) throw new Error("Invalid runbook format");
      setRunbook(loaded);
      toast.success(`Loaded runbook: ${loaded.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse runbook");
    }
    e.target.value = "";
  }, []);

  const resetRunbook = useCallback(() => {
    setRunbook((rb) => ({
      ...rb,
      status: "DRAFT",
      currentStepIndex: -1,
      steps: rb.steps.map((s) => ({ ...s, status: "PENDING" as StepStatus, result: "", startedAt: "", completedAt: "" })),
    }));
  }, []);

  const handleExportExcel = async () => {
    await exportExcel([{
      name: "Runbook Steps",
      headers: ["Order", "Type", "Name", "Description", "Status", "Result"],
      rows: runbook.steps.map((s) => [s.order, RunbookStepLabels[s.type], s.name, s.description, s.status, s.result]),
    }], "cpi-cutover-runbook.xlsx");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cutover Runbook Executor</h1>
        <p className="text-muted-foreground">Define and track cutover steps for ECC-to-S/4 migration</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runbook Configuration</CardTitle>
          <CardDescription>Define your cutover runbook or load an existing one</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Runbook Name</Label>
              <Input value={runbook.name} onChange={(e) => setRunbook((rb) => ({ ...rb, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={runbook.description} onChange={(e) => setRunbook((rb) => ({ ...rb, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="file" accept=".json" className="hidden" id="runbook-file" onChange={handleLoadRunbook} />
            <Button variant="outline" size="sm" onClick={() => document.getElementById("runbook-file")?.click()}>
              <Upload className="h-3.5 w-3.5" /> Load Runbook
            </Button>
            <Button variant="outline" size="sm" onClick={resetRunbook}><RotateCcw className="h-3.5 w-3.5" /> Reset All</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{runbook.steps.length}</p><p className="text-xs text-muted-foreground">Total Steps</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-green-500">{runbook.steps.filter((s) => s.status === "SUCCESS").length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{runbook.steps.filter((s) => s.status === "FAILED").length}</p><p className="text-xs text-muted-foreground">Failed</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-yellow-500">{runbook.steps.filter((s) => s.status === "PENDING").length}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
      </div>

      <ExportToolbar
        onExportExcel={handleExportExcel}
        onExportJson={() => exportGenericJson(runbook, `runbook-${runbook.name.replace(/\s+/g, "-").toLowerCase()}.json`)}
      />

      <div className="space-y-3">
        {runbook.steps.map((step) => (
          <Card key={step.id} className={step.status === "SUCCESS" ? "border-green-200 dark:border-green-800" : step.status === "FAILED" ? "border-red-200 dark:border-red-800" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-sm font-mono text-muted-foreground w-6">{step.order}</span>
                  {statusIcons[step.status]}
                </div>
                <div className="flex-1 grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={step.type} onValueChange={(v) => updateStep(step.id, { type: v as RunbookStepType })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(RunbookStepLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input className="h-8 text-xs" value={step.name} onChange={(e) => updateStep(step.id, { name: e.target.value })} placeholder="Step name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input className="h-8 text-xs" value={step.description} onChange={(e) => updateStep(step.id, { description: e.target.value })} placeholder="Details" />
                  </div>
                  <div className="flex items-end gap-1">
                    <Badge variant="secondary" className="text-xs">{step.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeStep(step.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" className="w-full" onClick={addStep}><Plus className="h-4 w-4" /> Add Step</Button>
      </div>
    </div>
  );
}

function randomId(): string {
  const c = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += c.charAt(Math.floor(Math.random() * c.length));
  return id;
}
