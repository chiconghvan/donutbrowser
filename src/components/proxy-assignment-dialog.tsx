"use client";

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { translateBackendError } from "@/lib/backend-errors";
import type { BrowserProfile } from "@/types";
import { RippleButton } from "./ui/ripple";

interface ProxyAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfiles: string[];
  onAssignmentComplete: () => void;
  profiles: BrowserProfile[];
}

export function ProxyAssignmentDialog({
  isOpen,
  onClose,
  selectedProfiles,
  onAssignmentComplete,
  profiles,
}: ProxyAssignmentDialogProps) {
  const { t } = useTranslation();
  const [proxyString, setProxyString] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProfilesRef = useRef(selectedProfiles);
  const profilesRef = useRef(profiles);
  const onAssignmentCompleteRef = useRef(onAssignmentComplete);
  const onCloseRef = useRef(onClose);
  selectedProfilesRef.current = selectedProfiles;
  profilesRef.current = profiles;
  onAssignmentCompleteRef.current = onAssignmentComplete;
  onCloseRef.current = onClose;

  const parsedProxyLines = proxyString
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const handleAssign = useCallback(async () => {
    setIsAssigning(true);
    setError(null);
    try {
      const validProfiles = selectedProfilesRef.current.filter((profileId) => {
        const profile = profilesRef.current.find((p) => p.id === profileId);
        return profile && profile.browser !== "tor-browser";
      });

      if (validProfiles.length === 0) {
        setError(t("proxyAssignment.noValidProfiles"));
        setIsAssigning(false);
        return;
      }

      for (let i = 0; i < validProfiles.length; i += 1) {
        const profileId = validProfiles[i];
        const proxyValue = parsedProxyLines[i] ?? null;
        await invoke("update_profile_proxy", {
          profileId,
          proxyId: proxyValue,
        });
      }

      onAssignmentCompleteRef.current();
      onCloseRef.current();
    } catch (err) {
      console.error("Failed to assign proxies:", err);
      setError(translateBackendError(t, err));
    } finally {
      setIsAssigning(false);
    }
  }, [parsedProxyLines, t]);

  useEffect(() => {
    if (isOpen) {
      setProxyString("");
      setError(null);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("proxyAssignment.title")}</DialogTitle>
          <DialogDescription>
            {t("proxyAssignment.description", {
              count: selectedProfiles.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proxy-string">
              {t("proxyAssignment.proxyInputLabel")}
            </Label>
            <Textarea
              id="proxy-string"
              value={proxyString}
              onChange={(e) => {
                setProxyString(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t("proxyAssignment.proxyPlaceholder")}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t("proxyAssignment.proxyHelper")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("proxyAssignment.proxyLineInfo", {
                count: parsedProxyLines.length,
              })}
            </p>
          </div>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
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
            {t("proxyAssignment.assignButton")}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
