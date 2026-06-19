"use client";

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LoadingButton } from "@/components/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BrowserProfile } from "@/types";
import { RippleButton } from "./ui/ripple";

interface BulkProxyAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfiles: string[];
  onAssignmentComplete: () => void;
  profiles?: BrowserProfile[];
}

export function BulkProxyAssignmentDialog({
  isOpen,
  onClose,
  selectedProfiles,
  onAssignmentComplete,
  profiles = [],
}: BulkProxyAssignmentDialogProps) {
  const { t } = useTranslation();
  const [proxyLines, setProxyLines] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProxyLines("");
      setError(null);
    }
  }, [isOpen]);

  const handleAssign = useCallback(async () => {
    setIsAssigning(true);
    setError(null);
    try {
      // Parse lines: split, trim, drop empty
      const lines = proxyLines
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Count must match selected profiles
      if (lines.length !== selectedProfiles.length) {
        setError(
          t("bulkProxyAssignment.countMismatch", {
            proxyCount: lines.length,
            profileCount: selectedProfiles.length,
          }),
        );
        setIsAssigning(false);
        return;
      }

      // Validate each line format: address:port:user:pass
      for (const line of lines) {
        const parts = line.split(":");
        if (parts.length !== 4 || parts.some((p) => p.length === 0)) {
          setError(t("bulkProxyAssignment.invalidLineFormat", { line }));
          setIsAssigning(false);
          return;
        }
        const port = Number(parts[1]);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          setError(t("bulkProxyAssignment.invalidPort", { line }));
          setIsAssigning(false);
          return;
        }
      }

      // Assign sequentially so first error stops the loop
      for (let i = 0; i < selectedProfiles.length; i++) {
        const profileId = selectedProfiles[i];
        const proxyId = lines[i];
        await invoke("update_profile_proxy", {
          profileId,
          proxyId,
        });
      }

      await emit("profile-updated");
      toast.success(
        t("bulkProxyAssignment.success", {
          count: selectedProfiles.length,
        }),
      );
      onAssignmentComplete();
      onClose();
    } catch (err) {
      console.error("Failed to assign proxies:", err);
      const errorMessage =
        err instanceof Error ? err.message : t("bulkProxyAssignment.failed");
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsAssigning(false);
    }
  }, [proxyLines, selectedProfiles, onAssignmentComplete, onClose, t]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("bulkProxyAssignment.title")}</DialogTitle>
          <DialogDescription>
            {t("bulkProxyAssignment.description", {
              count: selectedProfiles.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected profiles summary */}
          <div className="space-y-2">
            <Label>{t("bulkProxyAssignment.selectedProfilesLabel")}</Label>
            <div className="max-h-28 overflow-y-auto rounded-md bg-muted p-3">
              <ul className="space-y-1 text-sm">
                {selectedProfiles.map((profileId) => {
                  const profile = profiles.find(
                    (p: BrowserProfile) => p.id === profileId,
                  );
                  const displayName = profile ? profile.name : profileId;
                  return (
                    <li key={profileId} className="truncate">
                      &bull; {displayName}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Textarea for proxy lines */}
          <div className="space-y-2">
            <Label htmlFor="bulk-proxy-textarea">
              {t("bulkProxyAssignment.textareaLabel")}
            </Label>
            <Textarea
              id="bulk-proxy-textarea"
              value={proxyLines}
              onChange={(e) => setProxyLines(e.target.value)}
              placeholder={t("bulkProxyAssignment.textareaPlaceholder")}
              rows={10}
              disabled={isAssigning}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {t("bulkProxyAssignment.helperText")}
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <RippleButton
            variant="outline"
            onClick={onClose}
            disabled={isAssigning}
          >
            {t("common.buttons.cancel")}
          </RippleButton>
          <LoadingButton
            isLoading={isAssigning}
            onClick={() => void handleAssign()}
          >
            {t("bulkProxyAssignment.applyButton")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
