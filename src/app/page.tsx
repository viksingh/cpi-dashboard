"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Download,
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
  BarChart3,
  MessageSquare,
  Globe,
  BookOpen,
  Hash,
  FileText,
  ScanSearch,
  ShieldCheck,
  HeartPulse,
  ClipboardList,
} from "lucide-react";

const tools = [
  {
    href: "/extractor",
    title: "Extractor & Snapshot",
    description: "Extract data from SAP CPI, load or save JSON snapshots for offline analysis across all tools",
    icon: Download,
    color: "text-blue-500",
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
  {
    href: "/adapter-census",
    title: "Adapter Type Census",
    description: "Breakdown of adapter types in use with ECC-specific migration effort analysis",
    icon: BarChart3,
    color: "text-indigo-500",
  },
  {
    href: "/jms-queues",
    title: "JMS Queue Inventory",
    description: "Inventory all JMS queues with producer/consumer flows, orphan detection, and multi-producer warnings",
    icon: MessageSquare,
    color: "text-emerald-500",
  },
  {
    href: "/external-systems",
    title: "External System Map",
    description: "Graph of every external system the CPI tenant connects to — ECC, S/4, SaaS, third-party",
    icon: Globe,
    color: "text-rose-500",
  },
  {
    href: "/pattern-cataloger",
    title: "Pattern Cataloger",
    description: "Classify integration patterns with S/4HANA migration recommendations per pattern type",
    icon: BookOpen,
    color: "text-fuchsia-500",
  },
  {
    href: "/number-ranges",
    title: "Number Range Scanner",
    description: "Scan scripts, mappings, and parameters for ECC number range references needing S/4 alignment",
    icon: Hash,
    color: "text-yellow-600",
  },
  {
    href: "/req-docgen",
    title: "Requirement Doc Generator",
    description: "Auto-generate migration requirements per iFlow with current state and proposed S/4 target",
    icon: FileText,
    color: "text-slate-500",
  },
  {
    href: "/param-auditor",
    title: "Parameter Auditor",
    description: "Find hardcoded URLs, IPs, credentials, system IDs, and non-externalized parameters",
    icon: ScanSearch,
    color: "text-orange-600",
  },
  {
    href: "/cert-expiry",
    title: "Certificate Monitor",
    description: "Inventory all certificate and keystore references across iFlows for migration planning",
    icon: ShieldCheck,
    color: "text-green-600",
  },
  {
    href: "/health-check",
    title: "Health Checker",
    description: "Discover all endpoint targets for connectivity verification before and after cutover",
    icon: HeartPulse,
    color: "text-red-600",
  },
  {
    href: "/runbook",
    title: "Cutover Runbook",
    description: "Define and track sequenced cutover steps with rollback support for ECC-to-S/4 migration",
    icon: ClipboardList,
    color: "text-blue-600",
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
          <p><strong>2. Extract</strong> — Use the Extractor to pull data and save as a snapshot</p>
          <p><strong>3. Analyze</strong> — All analysis tools automatically use the loaded snapshot — no re-loading needed</p>
          <p><strong>4. Export</strong> — Download results as Excel, CSV, or JSON for reporting and tracking</p>
        </CardContent>
      </Card>
    </div>
  );
}
