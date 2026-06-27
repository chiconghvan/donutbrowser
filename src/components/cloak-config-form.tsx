"use client";

import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  CloakColorScheme,
  CloakConfig,
  CloakHumanPreset,
  CloakPlatform,
} from "@/types";

interface CloakConfigFormProps {
  config: CloakConfig;
  onConfigChange: (key: keyof CloakConfig, value: unknown) => void;
  className?: string;
  readOnly?: boolean;
}

const getCurrentPlatform = (): CloakPlatform => {
  if (typeof navigator === "undefined") return "linux";
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "macos";
  return "linux";
};

const toNumber = (value: string) =>
  value.trim() ? parseInt(value, 10) : undefined;

export function CloakConfigForm({
  config,
  onConfigChange,
  className = "",
  readOnly = false,
}: CloakConfigFormProps) {
  const { t } = useTranslation();
  const launchArgsText = (config.launch_args ?? []).join("\n");

  return (
    <fieldset disabled={readOnly} className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cloak-seed">{t("config.cloak.seedNumber")}</Label>
          <Input
            id="cloak-seed"
            inputMode="numeric"
            pattern="[0-9]*"
            value={config.fingerprint_seed ?? ""}
            onChange={(e) =>
              onConfigChange(
                "fingerprint_seed",
                e.target.value.replace(/\D/g, "") || undefined,
              )
            }
            placeholder={t("common.placeholders.example", { value: "12345" })}
          />
          <p className="text-xs text-muted-foreground">
            {t("config.cloak.seedNumberDescription")}
          </p>
        </div>
        <div className="space-y-2">
          <Label>{t("config.cloak.platform")}</Label>
          <Select
            value={config.platform ?? getCurrentPlatform()}
            onValueChange={(value: CloakPlatform) =>
              onConfigChange("platform", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="windows">
                {t("config.cloak.platforms.windows")}
              </SelectItem>
              <SelectItem value="macos">
                {t("config.cloak.platforms.macos")}
              </SelectItem>
              <SelectItem value="linux">
                {t("config.cloak.platforms.linux")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cloak-timezone">{t("config.cloak.timezone")}</Label>
          <Input
            id="cloak-timezone"
            value={config.timezone ?? ""}
            onChange={(e) =>
              onConfigChange("timezone", e.target.value || undefined)
            }
            placeholder={t("common.placeholders.example", {
              value: "America/New_York",
            })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cloak-locale">{t("config.cloak.locale")}</Label>
          <Input
            id="cloak-locale"
            value={config.locale ?? ""}
            onChange={(e) =>
              onConfigChange("locale", e.target.value || undefined)
            }
            placeholder={t("common.placeholders.example", { value: "en-US" })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cloak-user-agent">{t("config.cloak.userAgent")}</Label>
        <Input
          id="cloak-user-agent"
          value={config.user_agent ?? ""}
          onChange={(e) =>
            onConfigChange("user_agent", e.target.value || undefined)
          }
          placeholder={t("common.placeholders.example", {
            value: "Mozilla/5.0...",
          })}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cloak-screen-width">
            {t("config.cloak.screenWidth")}
          </Label>
          <Input
            id="cloak-screen-width"
            type="number"
            value={config.screen_width ?? ""}
            onChange={(e) =>
              onConfigChange("screen_width", toNumber(e.target.value))
            }
            placeholder={t("common.placeholders.example", { value: "1920" })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cloak-screen-height">
            {t("config.cloak.screenHeight")}
          </Label>
          <Input
            id="cloak-screen-height"
            type="number"
            value={config.screen_height ?? ""}
            onChange={(e) =>
              onConfigChange("screen_height", toNumber(e.target.value))
            }
            placeholder={t("common.placeholders.example", { value: "1080" })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cloak-cpu">
            {t("config.cloak.hardwareConcurrency")}
          </Label>
          <Input
            id="cloak-cpu"
            type="number"
            value={config.hardware_concurrency ?? ""}
            onChange={(e) =>
              onConfigChange("hardware_concurrency", toNumber(e.target.value))
            }
            placeholder={t("common.placeholders.example", { value: "8" })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cloak-gpu-vendor">
            {t("config.cloak.gpuVendor")}
          </Label>
          <Input
            id="cloak-gpu-vendor"
            value={config.gpu_vendor ?? ""}
            onChange={(e) =>
              onConfigChange("gpu_vendor", e.target.value || undefined)
            }
            placeholder={t("common.placeholders.example", { value: "Intel" })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cloak-gpu-renderer">
            {t("config.cloak.gpuRenderer")}
          </Label>
          <Input
            id="cloak-gpu-renderer"
            value={config.gpu_renderer ?? ""}
            onChange={(e) =>
              onConfigChange("gpu_renderer", e.target.value || undefined)
            }
            placeholder={t("common.placeholders.example", {
              value: "Intel Iris OpenGL Engine",
            })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("config.cloak.humanPreset")}</Label>
          <Select
            value={config.human_preset ?? "default"}
            onValueChange={(value: CloakHumanPreset) =>
              onConfigChange("human_preset", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                {t("config.cloak.presets.default")}
              </SelectItem>
              <SelectItem value="careful">
                {t("config.cloak.presets.careful")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("config.cloak.colorScheme")}</Label>
          <Select
            value={config.color_scheme ?? "no-preference"}
            onValueChange={(value: CloakColorScheme) =>
              onConfigChange("color_scheme", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no-preference">
                {t("config.cloak.colorSchemes.noPreference")}
              </SelectItem>
              <SelectItem value="light">
                {t("config.cloak.colorSchemes.light")}
              </SelectItem>
              <SelectItem value="dark">
                {t("config.cloak.colorSchemes.dark")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id="cloak-randomize-fingerprint"
            checked={config.randomize_fingerprint_on_launch ?? false}
            onCheckedChange={(checked) =>
              onConfigChange(
                "randomize_fingerprint_on_launch",
                checked === true,
              )
            }
          />
          <div className="space-y-1">
            <Label htmlFor="cloak-randomize-fingerprint">
              {t("config.cloak.randomizeFingerprintOnLaunch")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("config.cloak.randomizeFingerprintOnLaunchDescription")}
            </p>
          </div>
        </div>
        {(
          [
            ["humanize", "humanize"],
            ["headless", "headless"],
            ["geoip", "geoip"],
          ] as const
        ).map(([key, labelKey]) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox
              id={`cloak-${key}`}
              checked={config[key] ?? false}
              onCheckedChange={(checked) =>
                onConfigChange(key, checked === true)
              }
            />
            <Label htmlFor={`cloak-${key}`}>
              {t(`config.cloak.${labelKey}`)}
            </Label>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cloak-launch-args">
          {t("config.cloak.launchArgs")}
        </Label>
        <Textarea
          id="cloak-launch-args"
          value={launchArgsText}
          onChange={(e) =>
            onConfigChange(
              "launch_args",
              e.target.value
                .split("\n")
                .map((arg) => arg.trim())
                .filter(Boolean),
            )
          }
          placeholder={t("common.placeholders.example", {
            value: "--disable-web-security",
          })}
          className="font-mono text-sm"
          rows={4}
        />
      </div>
    </fieldset>
  );
}
