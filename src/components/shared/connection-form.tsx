"use client";

import { useState, useRef, useCallback } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plug, Check, AlertCircle, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ConnectionConfig } from "@/types/cpi";

export function ConnectionForm() {
  const { config, isConnected, isConnecting, setConfig, setConnected, setConnecting, setError } =
    useConnectionStore();
  const [showSecrets, setShowSecrets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveCredentials = useCallback(() => {
    const payload = JSON.stringify(config, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cpi-credentials.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Credentials saved to file");
  }, [config]);

  const handleLoadCredentials = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const loaded = JSON.parse(text) as Partial<ConnectionConfig>;
        if (!loaded.tenantUrl) {
          throw new Error("Invalid credentials file: missing tenantUrl");
        }
        setConfig({
          tenantUrl: loaded.tenantUrl ?? "",
          authType: loaded.authType ?? "oauth2",
          oauthTokenUrl: loaded.oauthTokenUrl ?? "",
          oauthClientId: loaded.oauthClientId ?? "",
          oauthClientSecret: loaded.oauthClientSecret ?? "",
          basicUsername: loaded.basicUsername ?? "",
          basicPassword: loaded.basicPassword ?? "",
        });
        setConnected(false);
        toast.success(`Loaded credentials from ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse credentials file";
        toast.error(msg);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [setConfig, setConnected]
  );

  const handleTestConnection = async () => {
    setConnecting(true);
    setError(null);
    try {
      const resp = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await resp.json();
      if (data.success) {
        setConnected(true);
        toast.success("Connected to CPI tenant");
      } else {
        setConnected(false);
        setError(data.error);
        toast.error(`Connection failed: ${data.error}`);
      }
    } catch (err) {
      setConnected(false);
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" />
          CPI Connection
          {isConnected && <Check className="h-4 w-4 text-green-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tenantUrl">Tenant URL</Label>
            <Input
              id="tenantUrl"
              placeholder="https://your-tenant.it-cpi018.cfapps.eu10.hana.ondemand.com"
              value={config.tenantUrl}
              onChange={(e) => setConfig({ tenantUrl: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authType">Auth Type</Label>
            <Select
              value={config.authType}
              onValueChange={(v) => setConfig({ authType: v as "oauth2" | "basic" })}
            >
              <SelectTrigger id="authType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth2">OAuth2 Client Credentials</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.authType === "oauth2" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tokenUrl">Token URL</Label>
              <Input
                id="tokenUrl"
                placeholder="https://your-subdomain.authentication.eu10.hana.ondemand.com/oauth/token"
                value={config.oauthTokenUrl}
                onChange={(e) => setConfig({ oauthTokenUrl: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                value={config.oauthClientId}
                onChange={(e) => setConfig({ oauthClientId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type={showSecrets ? "text" : "password"}
                value={config.oauthClientSecret}
                onChange={(e) => setConfig({ oauthClientSecret: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={config.basicUsername}
                onChange={(e) => setConfig({ basicUsername: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showSecrets ? "text" : "password"}
                value={config.basicPassword}
                onChange={(e) => setConfig({ basicPassword: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleTestConnection} disabled={isConnecting || !config.tenantUrl}>
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConnected ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Test Connection"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowSecrets(!showSecrets)}>
            {showSecrets ? "Hide" : "Show"} secrets
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleLoadCredentials} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Load
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveCredentials} disabled={!config.tenantUrl}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
