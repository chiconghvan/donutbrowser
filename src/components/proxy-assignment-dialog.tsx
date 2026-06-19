"use client";

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LoadingButton } from "@/components/loading-button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BrowserProfile, VpnConfig } from "@/types";
import { RippleButton } from "./ui/ripple";

interface ProxyAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProfiles: string[];
  onAssignmentComplete: () => void;
  profiles?: BrowserProfile[];
  vpnConfigs?: VpnConfig[];
}

export function ProxyAssignmentDialog({
  isOpen,
  onClose,
  selectedProfiles,
  onAssignmentComplete,
  profiles = [],
  vpnConfigs = [],
}: ProxyAssignmentDialogProps) {
  const { t } = useTranslation();
  const [selectionType, setSelectionType] = useState<"none" | "proxy" | "vpn">(
    "none",
  );
  const [proxyString, setProxyString] = useState<string>("");
  const [vpnId, setVpnId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = useCallback(async () => {
    setIsAssigning(true);
    setError(null);
    try {
      const validProfiles = selectedProfiles.filter((profileId) => {
        const profile = profiles.find((p) => p.id === profileId);
        return profile;
      });

      if (validProfiles.length === 0) {
        setError(t("proxyAssignment.noValidProfiles"));
        setIsAssigning(false);
        return;
      }

      const inlineProxy = proxyString.trim() || null;

      for (const profileId of validProfiles) {
        if (selectionType === "vpn" && vpnId) {
          await invoke("update_profile_vpn", {
            profileId,
            vpnId,
          });
        } else {
          await invoke("update_profile_proxy", {
            profileId,
            proxyId: selectionType === "proxy" ? inlineProxy : null,
          });
        }
      }

      await emit("profile-updated");
      onAssignmentComplete();
      onClose();
    } catch (err) {
      console.error("Failed to assign proxy/VPN to profiles:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : t("proxyAssignment.failedFallback");
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsAssigning(false);
    }
  }, [
    selectedProfiles,
    selectionType,
    proxyString,
    vpnId,
    profiles,
    onAssignmentComplete,
    onClose,
    t,
  ]);

  useEffect(() => {
    if (isOpen) {
      setSelectionType("none");
      setProxyString("");
      setVpnId(null);
      setError(null);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("proxyAssignment.title")}</DialogTitle>
          <DialogDescription>
            {selectedProfiles.length === 1
              ? t("proxyAssignment.description_one", {
                  count: selectedProfiles.length,
                })
              : t("proxyAssignment.description_other", {
                  count: selectedProfiles.length,
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("proxyAssignment.selectedProfilesLabel")}</Label>
            <div className="p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
              <ul className="text-sm space-y-1">
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

          <div className="space-y-2">
            <Label>{t("proxyAssignment.assignProxyVpnLabel")}</Label>
            <Select
              value={
                selectionType === "vpn" && vpnId
                  ? `vpn-${vpnId}`
                  : selectionType
              }
              onValueChange={(v) => {
                if (v === "none") {
                  setSelectionType("none");
                  setProxyString("");
                  setVpnId(null);
                } else if (v.startsWith("vpn-")) {
                  setSelectionType("vpn");
                  setVpnId(v.slice(4));
                  setProxyString("");
                } else {
                  setSelectionType("proxy");
                  setVpnId(null);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("proxyAssignment.noneOption")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("proxyAssignment.noneOption")}
                </SelectItem>
                <SelectItem value="proxy">
                  {t("profileInfo.fields.proxy")}
                </SelectItem>
                {vpnConfigs.map((vpn) => (
                  <SelectItem key={vpn.id} value={`vpn-${vpn.id}`}>
                    <span className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 leading-tight"
                      >
                        WG
                      </Badge>
                      {vpn.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectionType === "proxy" && (
            <div className="space-y-2">
              <Label htmlFor="proxy-input">
                {t("profileInfo.fields.proxy")}
              </Label>
              <Input
                id="proxy-input"
                value={proxyString}
                onChange={(e) => setProxyString(e.target.value)}
                placeholder="address:port:user:pass"
                disabled={isAssigning}
              />
            </div>
          )}

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
