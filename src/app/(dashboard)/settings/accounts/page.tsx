"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { 
  Link as LinkIcon,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";

interface TokenStatus {
  status: "valid" | "expiring_soon" | "expiring_urgent" | "expired" | "no_expiry";
  expiresInMs: number | null;
  expiresInHuman: string;
  needsRefresh: boolean;
  canAutoRefresh: boolean;
  requiresReconnect: boolean;
}

interface SocialAccount {
  id: string;
  platform: Platform;
  platformUserId: string;
  platformUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
  isActive: boolean;
  tokenExpiresAt?: string;
  lastSyncAt?: string;
  lastError?: string | null;
  needsReconnect?: boolean;
  tokenStatus?: TokenStatus;
}

interface PlatformStatus {
  platform: Platform;
  config: typeof PLATFORM_CONFIGS[Platform];
  configured: boolean;
  missingCredentials: string[];
  connected: boolean;
  accounts: SocialAccount[];
}

function AccountsContent() {
  const searchParams = useSearchParams();
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setPlatformStatus(data.platformStatus || []);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    
    if (success) {
      setMessage({ type: "success", text: `Successfully connected ${success.replace("_connected", "")}` });
    } else if (error) {
      setMessage({ type: "error", text: decodeURIComponent(error) });
    }
  }, [searchParams]);

  async function handleConnect(platform: Platform) {
    setConnecting(platform);
    setMessage(null);

    try {
      const res = await fetch(`/api/social/connect?platform=${platform}`);
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.message || data.error });
        return;
      }

      window.location.href = data.url;
    } catch {
      setMessage({ type: "error", text: "Failed to initiate connection" });
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm("Are you sure you want to disconnect this account?")) return;

    try {
      const res = await fetch(`/api/accounts?id=${accountId}`, { method: "DELETE" });
      
      if (res.ok) {
        fetchAccounts();
        setMessage({ type: "success", text: "Account disconnected successfully" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to disconnect account" });
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Connected Accounts" description="Manage your social media connections" />
        <div className="flex-1 flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header 
        title="Connected Accounts" 
        description="Manage your social media connections"
      />
      
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {message && (
            <div className={`rounded-md p-4 flex items-center gap-2 ${
              message.type === "success" 
                ? "bg-green-50 text-green-700" 
                : "bg-red-50 text-red-700"
            }`}>
              {message.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {message.text}
            </div>
          )}

          <div className="grid gap-4">
            {platformStatus.map((status) => {
              const Icon = platformIcons[status.platform];
              const config = PLATFORM_CONFIGS[status.platform];

              return (
                <Card key={status.platform}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="flex h-10 w-10 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${config.color}20` }}
                        >
                          <Icon className={`h-5 w-5 text-[${config.color}]`} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{config.name}</CardTitle>
                          <CardDescription>
                            {status.configured ? (
                              status.connected ? "Connected" : "Ready to connect"
                            ) : (
                              "Credentials not configured"
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      {!status.connected && status.configured && (
                        <Button
                          onClick={() => handleConnect(status.platform)}
                          disabled={connecting === status.platform}
                        >
                          {connecting === status.platform ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <LinkIcon className="mr-2 h-4 w-4" />
                          )}
                          Connect
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    {!status.configured && (
                      <div className="rounded-md bg-yellow-50 p-4">
                        <p className="text-sm text-yellow-700">
                          <strong>Missing credentials:</strong>{" "}
                          {status.missingCredentials.join(", ")}
                        </p>
                        <p className="text-sm text-yellow-600 mt-1">
                          Add these environment variables to enable {config.name} integration.
                        </p>
                      </div>
                    )}

                    {status.accounts.length > 0 && (
                      <div className="space-y-3">
                        {status.accounts.map((account) => {
                          const tokenStatus = account.tokenStatus;
                          const showReconnectBanner = account.needsReconnect || tokenStatus?.requiresReconnect;
                          const showExpiryWarning = tokenStatus?.status === "expiring_soon" || tokenStatus?.status === "expiring_urgent";

                          return (
                            <div key={account.id} className="space-y-2">
                              {showReconnectBanner && (
                                <div className="rounded-md bg-red-50 border border-red-200 p-3 flex items-start gap-3">
                                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-red-800">
                                      Reconnection Required
                                    </p>
                                    <p className="text-sm text-red-600 mt-1">
                                      {account.lastError || "This account needs to be reconnected to continue publishing."}
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="mt-2"
                                      onClick={() => handleConnect(status.platform)}
                                      disabled={connecting === status.platform}
                                    >
                                      {connecting === status.platform ? (
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="mr-2 h-3 w-3" />
                                      )}
                                      Reconnect Now
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {!showReconnectBanner && showExpiryWarning && (
                                <div className={`rounded-md p-3 flex items-start gap-3 ${
                                  tokenStatus?.status === "expiring_urgent"
                                    ? "bg-orange-50 border border-orange-200"
                                    : "bg-yellow-50 border border-yellow-200"
                                }`}>
                                  <Clock className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                                    tokenStatus?.status === "expiring_urgent"
                                      ? "text-orange-500"
                                      : "text-yellow-500"
                                  }`} />
                                  <div className="flex-1">
                                    <p className={`text-sm font-medium ${
                                      tokenStatus?.status === "expiring_urgent"
                                        ? "text-orange-800"
                                        : "text-yellow-800"
                                    }`}>
                                      Token {tokenStatus?.status === "expiring_urgent" ? "Expiring Soon" : "Expiring"}
                                    </p>
                                    <p className={`text-sm mt-1 ${
                                      tokenStatus?.status === "expiring_urgent"
                                        ? "text-orange-600"
                                        : "text-yellow-600"
                                    }`}>
                                      {tokenStatus?.canAutoRefresh
                                        ? `Token expires in ${tokenStatus.expiresInHuman}. It will be refreshed automatically when needed.`
                                        : `Token expires in ${tokenStatus?.expiresInHuman}. Reconnect before it expires to avoid failed posts.`}
                                    </p>
                                    {!tokenStatus?.canAutoRefresh && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="mt-2"
                                        onClick={() => handleConnect(status.platform)}
                                        disabled={connecting === status.platform}
                                      >
                                        {connecting === status.platform ? (
                                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                        ) : (
                                          <RefreshCw className="mr-2 h-3 w-3" />
                                        )}
                                        Reconnect Now
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between rounded-lg border p-3">
                                <div className="flex items-center gap-3">
                                  <Avatar>
                                    <AvatarImage src={account.profileImageUrl || ""} />
                                    <AvatarFallback>
                                      {account.displayName?.charAt(0) || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-medium">
                                      {account.displayName || account.platformUsername || "Unknown"}
                                    </p>
                                    {account.platformUsername && (
                                      <p className="text-sm text-muted-foreground">
                                        @{account.platformUsername}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {showReconnectBanner ? (
                                    <Badge variant="destructive">Needs Reconnect</Badge>
                                  ) : tokenStatus?.status === "expired" ? (
                                    <Badge variant="destructive">Token Expired</Badge>
                                  ) : tokenStatus?.status === "expiring_urgent" ? (
                                    <Badge variant="outline" className="border-orange-300 text-orange-600">
                                      Expires in {tokenStatus.expiresInHuman}
                                    </Badge>
                                  ) : account.isActive ? (
                                    <Badge variant="default">Active</Badge>
                                  ) : (
                                    <Badge variant="secondary">Inactive</Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDisconnect(account.id)}
                                  >
                                    <Unlink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {config.notes.length > 0 && (
                      <div className="mt-4 space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          Platform Notes
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {config.notes.map((note, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-primary">•</span>
                              {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col">
        <Header title="Connected Accounts" description="Manage your social media connections" />
        <div className="flex-1 flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <AccountsContent />
    </Suspense>
  );
}
