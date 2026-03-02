"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Download,
  Camera,
  GitCompare,
  Network,
  MapPin,
  AlertTriangle,
  List,
  ArrowRight,
  Workflow,
  CalendarCheck,
  Shapes,
  KeyRound,
  Cloud,
} from "lucide-react";

const tools = [
  {
    href: "/extractor",
    title: "Extractor",
    description: "Extract packages, flows, value mappings, configurations, and runtime data from SAP CPI",
    icon: Download,
    color: "text-blue-500",
  },
  {
    href: "/snapshot",
    title: "Snapshot Creator",
    description: "Create JSON snapshots of your CPI tenant for offline analysis across all tools",
    icon: Camera,
    color: "text-emerald-500",
  },
  {
    href: "/diff",
    title: "Snapshot Diff",
    description: "Compare two snapshots side-by-side to identify added, removed, and modified artifacts",
    icon: GitCompare,
    color: "text-purple-500",
  },
  {
    href: "/dependencies",
    title: "Dependency Mapper",
    description: "Analyze iFlow dependencies via ProcessDirect, HTTP loopback, shared resources, and more",
    icon: Network,
    color: "text-cyan-500",
  },
  {
    href: "/endpoints",
    title: "Endpoint Tracker",
    description: "Catalog all endpoints, track ECC connections, and manage migration status for S/4HANA",
    icon: MapPin,
    color: "text-orange-500",
  },
  {
    href: "/tech-debt",
    title: "Tech Debt Scorer",
    description: "Score iFlows on age, complexity, error handling, deprecated adapters, and hardcoded values",
    icon: AlertTriangle,
    color: "text-red-500",
  },
  {
    href: "/inventory",
    title: "Interface Inventory",
    description: "Map Source System → iFlow → Target System with protocol grouping and ECC classification",
    icon: List,
    color: "text-teal-500",
  },
  {
    href: "/normalized-flows",
    title: "Flow Chain Mapper",
    description: "Concatenate JMS/ProcessDirect-chained iFlows into end-to-end logical flows for migration analysis",
    icon: Workflow,
    color: "text-violet-500",
  },
  {
    href: "/cutover",
    title: "Cutover Plan Generator",
    description: "Auto-generate sequenced migration waves from dependency graph and ECC endpoint analysis",
    icon: CalendarCheck,
    color: "text-lime-500",
  },
  {
    href: "/patterns",
    title: "Pattern Classifier",
    description: "Classify iFlows by integration pattern: sync, async, store-forward, polling, batch, and more",
    icon: Shapes,
    color: "text-pink-500",
  },
  {
    href: "/credentials",
    title: "Credential Auditor",
    description: "Inventory all security artifacts: user credentials, OAuth2 clients, keystores, and secure parameters",
    icon: KeyRound,
    color: "text-amber-500",
  },
  {
    href: "/cloud-connector",
    title: "Cloud Connector Mapper",
    description: "Map all on-premise virtual hosts and routes for S/4HANA cutover planning",
    icon: Cloud,
    color: "text-sky-500",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">CPI Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Unified SAP CPI management toolkit. Extract, analyze, and track your integration artifacts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.href} href={tool.href}>
              <Card className="h-full transition-colors hover:border-primary/50 hover:shadow-md cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={`h-5 w-5 ${tool.color}`} />
                    {tool.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">{tool.description}</CardDescription>
                  <div className="mt-4 flex items-center text-sm text-primary">
                    Open tool <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>1. Connect</strong> — Enter your CPI tenant URL and OAuth2/Basic credentials on any tool page</p>
          <p><strong>2. Extract</strong> — Use the Extractor or Snapshot Creator to pull data from your tenant</p>
          <p><strong>3. Analyze</strong> — Load snapshots into Diff, Dependencies, Tech Debt, Endpoints, or Inventory tools</p>
          <p><strong>4. Export</strong> — Download results as Excel, CSV, or JSON for reporting and tracking</p>
        </CardContent>
      </Card>
    </div>
  );
}
