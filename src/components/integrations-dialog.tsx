"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPlug } from "react-icons/lu";
import { AnimatedSwitch } from "@/components/ui/animated-switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showErrorToast, showSuccessToast } from "@/lib/toast-utils";
import { CopyToClipboard } from "./ui/copy-to-clipboard";

interface AppSettings {
  api_enabled: boolean;
  api_port: number;
}

interface IntegrationsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subPage?: boolean;
}

export function IntegrationsDialog({
  isOpen,
  onClose,
  subPage,
}: IntegrationsDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>({
    api_enabled: false,
    api_port: 10108,
  });
  const [apiServerPort, setApiServerPort] = useState<number | null>(null);
  const [isApiStarting, setIsApiStarting] = useState(false);
  const [apiPortDraft, setApiPortDraft] = useState<string>("10108");

  const loadSettings = useCallback(async () => {
    try {
      const loaded = await invoke<AppSettings>("get_app_settings");
      setSettings(loaded);
      setApiPortDraft(String(loaded.api_port ?? ""));
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  const loadApiServerStatus = useCallback(async () => {
    try {
      const port = await invoke<number | null>("get_api_server_status");
      setApiServerPort(port);
    } catch (e) {
      console.error("Failed to get API server status:", e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadSettings();
      void loadApiServerStatus();
    }
  }, [isOpen, loadSettings, loadApiServerStatus]);

  const handleApiToggle = async (enabled: boolean) => {
    setIsApiStarting(true);
    try {
      if (enabled) {
        const port = await invoke<number>("start_api_server", {
          port: settings.api_port,
        });
        setApiServerPort(port);
        const next = await invoke<AppSettings>("save_app_settings", {
          settings: { ...settings, api_enabled: true },
        });
        setSettings(next);
        showSuccessToast(t("integrations.apiStarted", { port }));
      } else {
        await invoke("stop_api_server");
        setApiServerPort(null);
        const next = await invoke<AppSettings>("save_app_settings", {
          settings: { ...settings, api_enabled: false },
        });
        setSettings(next);
        showSuccessToast(t("integrations.apiStopped"));
      }
    } catch (e) {
      console.error("Failed to toggle API:", e);
      showErrorToast(t("integrations.apiToggleFailed"), {
        description:
          e instanceof Error ? e.message : t("integrations.apiUnknownError"),
      });
    } finally {
      setIsApiStarting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      subPage={subPage}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] my-8 flex flex-col">
        {!subPage && (
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("integrations.title")}</DialogTitle>
          </DialogHeader>
        )}

        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
          <div className="rounded-md border bg-card p-4 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <LuPlug className="size-5 mt-0.5 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <Label className="text-sm font-medium">
                    {t("integrations.apiEnableLabel")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("integrations.apiEnableDescription")}
                  </p>
                </div>
              </div>
              <AnimatedSwitch
                checked={apiServerPort !== null}
                disabled={isApiStarting}
                onCheckedChange={(checked) => void handleApiToggle(checked)}
              />
            </div>

            {apiServerPort && (
              <div className="flex items-center gap-2 text-xs">
                <span className="size-1.5 rounded-full bg-success" />
                <span className="text-muted-foreground">
                  {t("integrations.apiRunningOn")}
                </span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
                  http://127.0.0.1:{apiServerPort}
                </code>
              </div>
            )}
          </div>

          {settings.api_enabled && (
            <>
              <div className="rounded-md border bg-card p-4 flex flex-col gap-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("integrations.apiPortLabel")}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={apiPortDraft}
                    onChange={(e) => {
                      setApiPortDraft(e.target.value);
                      const val = Number.parseInt(e.target.value, 10);
                      if (!Number.isNaN(val) && val >= 1 && val <= 65535) {
                        setSettings({ ...settings, api_port: val });
                      }
                    }}
                    onBlur={() => {
                      const val = Number.parseInt(apiPortDraft, 10);
                      if (Number.isNaN(val) || val < 1 || val > 65535) {
                        setApiPortDraft(String(settings.api_port));
                      }
                    }}
                    className="w-24 font-mono"
                    min={1}
                    max={65535}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      isApiStarting || apiServerPort === settings.api_port
                    }
                    onClick={async () => {
                      const port = settings.api_port;
                      if (port < 1 || port > 65535) {
                        showErrorToast(t("integrations.apiInvalidPort"), {
                          description: t(
                            "integrations.apiInvalidPortDescription",
                          ),
                        });
                        return;
                      }
                      setIsApiStarting(true);
                      try {
                        await invoke("stop_api_server");
                        const next = await invoke<AppSettings>(
                          "save_app_settings",
                          { settings },
                        );
                        setSettings(next);
                        const actualPort = await invoke<number>(
                          "start_api_server",
                          { port },
                        );
                        setApiServerPort(actualPort);
                        if (actualPort !== port) {
                          showErrorToast(
                            t("integrations.apiPortInUse", { port }),
                            {
                              description: t("integrations.apiFallbackPort", {
                                port: actualPort,
                              }),
                            },
                          );
                        } else {
                          showSuccessToast(
                            t("integrations.apiRunning", {
                              port: actualPort,
                            }),
                          );
                        }
                      } catch (e) {
                        showErrorToast(t("integrations.apiStartFailed"), {
                          description:
                            e instanceof Error
                              ? e.message
                              : t("integrations.apiUnknownError"),
                        });
                      } finally {
                        setIsApiStarting(false);
                      }
                    }}
                  >
                    {t("common.buttons.save")}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t("integrations.apiExampleRequest")}
                  </Label>
                  <CopyToClipboard
                    text={`curl http://127.0.0.1:${apiServerPort ?? settings.api_port}/v1/profiles`}
                    successMessage={t("common.buttons.copied")}
                  />
                </div>
                <pre className="font-mono text-[11px] whitespace-pre overflow-x-auto bg-background rounded p-3">
                  {`curl http://127.0.0.1:${apiServerPort ?? settings.api_port}/v1/profiles`}
                </pre>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
