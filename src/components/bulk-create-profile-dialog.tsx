"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuLoaderCircle } from "react-icons/lu";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrowserDownload } from "@/hooks/use-browser-download";
import { translateBackendError } from "@/lib/backend-errors";
import { getBrowserIcon } from "@/lib/browser-utils";
import { showErrorToast } from "@/lib/toast-utils";
import type { BrowserReleaseTypes } from "@/types";

import { RippleButton } from "./ui/ripple";

type BrowserTypeString = "camoufox" | "wayfern";

interface BulkCreateProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  selectedGroupId?: string;
}

function makeDatePrefix(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

export function BulkCreateProfileDialog({
  isOpen,
  onClose,
  onCreated,
  selectedGroupId,
}: BulkCreateProfileDialogProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<
    "browser-selection" | "bulk-config"
  >("browser-selection");
  const [selectedBrowser, setSelectedBrowser] =
    useState<BrowserTypeString>("wayfern");
  const [profileCount, setProfileCount] = useState<number>(1);
  const [proxyText, setProxyText] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [releaseTypes, setReleaseTypes] = useState<BrowserReleaseTypes>();
  const [isLoadingReleaseTypes, setIsLoadingReleaseTypes] = useState(false);
  const loadingBrowserRef = useRef<string | null>(null);

  const {
    isBrowserDownloading,
    downloadBrowser,
    loadDownloadedVersions,
    isVersionDownloaded,
    downloadedVersionsMap,
  } = useBrowserDownload();

  const loadReleaseTypes = useCallback(
    async (browser: string) => {
      loadingBrowserRef.current = browser;
      setIsLoadingReleaseTypes(true);
      try {
        const rawReleaseTypes = await invoke<BrowserReleaseTypes>(
          "get_browser_release_types",
          { browserStr: browser },
        );
        await loadDownloadedVersions(browser);
        if (loadingBrowserRef.current === browser) {
          const filtered: BrowserReleaseTypes = {};
          if (rawReleaseTypes.stable) filtered.stable = rawReleaseTypes.stable;
          setReleaseTypes(filtered);
        }
      } catch (error) {
        console.error(`Failed to load release types for ${browser}:`, error);
        try {
          const downloaded = await loadDownloadedVersions(browser);
          if (loadingBrowserRef.current === browser && downloaded.length > 0) {
            const fallback: BrowserReleaseTypes = {};
            fallback.stable = downloaded[0];
            setReleaseTypes(fallback);
          }
        } catch {
          // ignore
        }
      } finally {
        if (loadingBrowserRef.current === browser) {
          loadingBrowserRef.current = null;
          setIsLoadingReleaseTypes(false);
        }
      }
    },
    [loadDownloadedVersions],
  );

  useEffect(() => {
    if (isOpen) {
      void loadDownloadedVersions("wayfern");
      void loadDownloadedVersions("camoufox");
      void loadReleaseTypes("wayfern");
      void loadReleaseTypes("camoufox");
    }
  }, [isOpen, loadReleaseTypes, loadDownloadedVersions]);

  const getBestAvailableVersion = useCallback(() => {
    if (!releaseTypes?.stable) return null;
    return { version: releaseTypes.stable, releaseType: "stable" as const };
  }, [releaseTypes]);

  const getCreatableVersion = useCallback(
    (browserType: string) => {
      const bestVersion = getBestAvailableVersion();
      if (bestVersion && isVersionDownloaded(bestVersion.version)) {
        return bestVersion;
      }
      const browserDownloaded = downloadedVersionsMap[browserType] ?? [];
      if (browserDownloaded.length > 0) {
        return {
          version: browserDownloaded[0],
          releaseType: "stable" as const,
        };
      }
      return null;
    },
    [getBestAvailableVersion, isVersionDownloaded, downloadedVersionsMap],
  );

  const handleBrowserSelect = (browser: BrowserTypeString) => {
    setSelectedBrowser(browser);
    setCurrentStep("bulk-config");
  };

  const handleBack = () => {
    setCurrentStep("browser-selection");
  };

  const proxyLines = useMemo(() => {
    return proxyText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }, [proxyText]);

  const canCreate = useMemo(() => {
    if (profileCount < 1) return false;
    if (!getCreatableVersion(selectedBrowser)) return false;
    if (isCreating) return false;
    return true;
  }, [profileCount, selectedBrowser, getCreatableVersion, isCreating]);

  const handleCreate = async () => {
    if (!canCreate) return;

    const versionInfo = getCreatableVersion(selectedBrowser);
    if (!versionInfo) return;

    const datePrefix = makeDatePrefix();
    const entries = Array.from({ length: profileCount }, (_, i) => ({
      name: `${datePrefix}.${String(i + 1).padStart(2, "0")}`,
      proxy: proxyLines[i] || null,
    }));

    setIsCreating(true);
    try {
      await invoke("create_browser_profiles_bulk", {
        browserStr: selectedBrowser,
        version: versionInfo.version,
        releaseType: versionInfo.releaseType,
        profiles: entries,
        groupId:
          selectedGroupId && selectedGroupId !== "__all__"
            ? selectedGroupId
            : null,
      });
      onCreated();
      handleClose();
    } catch (error) {
      console.error("Bulk create failed:", error);
      showErrorToast(
        t("errors.createProfileFailed", {
          error: translateBackendError(t, error),
        }),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    loadingBrowserRef.current = null;
    setCurrentStep("browser-selection");
    setSelectedBrowser("wayfern");
    setProfileCount(1);
    setProxyText("");
    setReleaseTypes({});
    setIsLoadingReleaseTypes(false);
    onClose();
  };

  const handleDownload = async (browserStr: string) => {
    const versionInfo = getBestAvailableVersion();
    if (!versionInfo) return;
    try {
      await downloadBrowser(browserStr, versionInfo.version);
      await loadDownloadedVersions(browserStr);
      await loadReleaseTypes(browserStr);
    } catch (error) {
      console.error("Failed to download browser:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[380px] max-w-[380px] max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {currentStep === "browser-selection"
              ? t("bulkCreateProfile.title")
              : t("bulkCreateProfile.configureTitle", {
                  browser:
                    selectedBrowser === "wayfern"
                      ? t("createProfile.chromiumLabel")
                      : t("createProfile.firefoxLabel"),
                })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {currentStep === "browser-selection" ? (
            <div className="space-y-3 pt-4">
              {/* Wayfern (Chromium) */}
              <Button
                onClick={() => {
                  handleBrowserSelect("wayfern");
                }}
                disabled={!getCreatableVersion("wayfern")}
                className="flex gap-3 justify-start items-center p-4 w-full h-16 border-2 transition-colors hover:border-primary/50"
                variant="outline"
              >
                <div className="flex justify-center items-center size-8">
                  {isBrowserDownloading("wayfern") ? (
                    <LuLoaderCircle className="size-6 animate-spin" />
                  ) : (
                    (() => {
                      const IconComponent = getBrowserIcon("wayfern");
                      return IconComponent ? (
                        <IconComponent className="size-6" />
                      ) : null;
                    })()
                  )}
                </div>
                <div className="text-left">
                  <div className="font-medium">
                    {t("createProfile.chromiumLabel")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isBrowserDownloading("wayfern")
                      ? t("createProfile.downloadingSubtitle")
                      : t("createProfile.chromiumSubtitle")}
                  </div>
                </div>
              </Button>

              {/* Camoufox (Firefox) */}
              <Button
                onClick={() => {
                  handleBrowserSelect("camoufox");
                }}
                disabled={!getCreatableVersion("camoufox")}
                className="flex gap-3 justify-start items-center p-4 w-full h-16 border-2 transition-colors hover:border-primary/50"
                variant="outline"
              >
                <div className="flex justify-center items-center size-8">
                  {isBrowserDownloading("camoufox") ? (
                    <LuLoaderCircle className="size-6 animate-spin" />
                  ) : (
                    (() => {
                      const IconComponent = getBrowserIcon("camoufox");
                      return IconComponent ? (
                        <IconComponent className="size-6" />
                      ) : null;
                    })()
                  )}
                </div>
                <div className="text-left">
                  <div className="font-medium">
                    {t("createProfile.firefoxLabel")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isBrowserDownloading("camoufox")
                      ? t("createProfile.downloadingSubtitle")
                      : t("createProfile.firefoxSubtitle")}
                  </div>
                </div>
              </Button>

              {!getCreatableVersion("wayfern") &&
                !getCreatableVersion("camoufox") && (
                  <p className="pt-2 text-sm text-center text-muted-foreground">
                    {t("createProfile.browsersDownloading")}
                  </p>
                )}

              {!getCreatableVersion("wayfern") && !isLoadingReleaseTypes && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    void handleDownload("wayfern");
                  }}
                  disabled={isBrowserDownloading("wayfern")}
                >
                  {isBrowserDownloading("wayfern")
                    ? t("createProfile.downloadingButton")
                    : t("createProfile.downloadButton", {
                        browser: t("createProfile.chromiumLabel"),
                      })}
                </Button>
              )}
              {!getCreatableVersion("camoufox") && !isLoadingReleaseTypes && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    void handleDownload("camoufox");
                  }}
                  disabled={isBrowserDownloading("camoufox")}
                >
                  {isBrowserDownloading("camoufox")
                    ? t("createProfile.downloadingButton")
                    : t("createProfile.downloadButton", {
                        browser: t("createProfile.firefoxLabel"),
                      })}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-profile-count">
                  {t("bulkCreateProfile.countLabel")}
                </Label>
                <Input
                  id="bulk-profile-count"
                  type="number"
                  min={1}
                  value={profileCount}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(v) && v >= 1) setProfileCount(v);
                  }}
                  placeholder={t("bulkCreateProfile.countPlaceholder")}
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  {t("bulkCreateProfile.namePattern", {
                    prefix: makeDatePrefix(),
                    count: profileCount,
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk-proxy-textarea">
                  {t("bulkCreateProfile.proxyLabel")}
                </Label>
                <Textarea
                  id="bulk-proxy-textarea"
                  value={proxyText}
                  onChange={(e) => setProxyText(e.target.value)}
                  placeholder={t("bulkCreateProfile.proxyPlaceholder")}
                  rows={8}
                  disabled={isCreating}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {t("bulkCreateProfile.proxyHelper")}
                </p>
              </div>

              {proxyLines.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("bulkCreateProfile.proxyCountInfo", {
                    proxyCount: proxyLines.length,
                    profileCount,
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t">
          {currentStep === "bulk-config" ? (
            <>
              <RippleButton variant="outline" onClick={handleBack}>
                {t("common.buttons.back")}
              </RippleButton>
              <LoadingButton
                onClick={() => {
                  void handleCreate();
                }}
                isLoading={isCreating}
                disabled={!canCreate}
              >
                {t("bulkCreateProfile.createButton", { count: profileCount })}
              </LoadingButton>
            </>
          ) : (
            <RippleButton variant="outline" onClick={handleClose}>
              {t("common.buttons.cancel")}
            </RippleButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
