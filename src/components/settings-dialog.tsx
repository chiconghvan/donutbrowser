"use client";

import { invoke } from "@tauri-apps/api/core";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import Color from "color";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BsCamera, BsMic } from "react-icons/bs";
import { LoadingButton } from "@/components/loading-button";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
} from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import type { PermissionType } from "@/hooks/use-permissions";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getThemeByColors,
  getThemeById,
  THEME_VARIABLES,
  THEMES,
} from "@/lib/themes";
import { showErrorToast, showSuccessToast } from "@/lib/toast-utils";
import { cn } from "@/lib/utils";
import { RippleButton } from "./ui/ripple";

interface AppSettings {
  set_as_default_browser: boolean;
  theme: string;
  custom_theme?: Record<string, string>;
  api_enabled: boolean;
  api_port: number;
  api_token?: string;
  disable_auto_updates?: boolean;
  keep_decrypted_profiles_in_ram?: boolean;
  clear_cache_after_browser_close?: boolean;
}

interface DataDirSettings {
  current_data_dir: string;
  configured_data_dir?: string | null;
  default_data_dir: string;
  env_override_active: boolean;
  portable: boolean;
}

interface CustomThemeState {
  selectedThemeId: string | null;
  colors: Record<string, string>;
}

interface PermissionInfo {
  permission_type: PermissionType;
  isGranted: boolean;
  description: string;
}

// Version update progress toasts are handled globally via useVersionUpdater

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subPage?: boolean;
}

export function SettingsDialog({
  isOpen,
  onClose,
  subPage,
}: SettingsDialogProps) {
  const [settings, setSettings] = useState<AppSettings>({
    set_as_default_browser: false,
    theme: "system",
    custom_theme: undefined,
    api_enabled: false,
    api_port: 10108,
    api_token: undefined,
    clear_cache_after_browser_close: true,
  });
  const [originalSettings, setOriginalSettings] = useState<AppSettings>({
    set_as_default_browser: false,
    theme: "system",
    custom_theme: undefined,
    api_enabled: false,
    api_port: 10108,
    api_token: undefined,
    clear_cache_after_browser_close: true,
  });
  const [customThemeState, setCustomThemeState] = useState<CustomThemeState>({
    selectedThemeId: null,
    colors: {},
  });
  const [isDefaultBrowser, setIsDefaultBrowser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [requestingPermission, setRequestingPermission] =
    useState<PermissionType | null>(null);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isLinux, setIsLinux] = useState(false);
  const [systemInfo, setSystemInfo] = useState<{
    app_version: string;
    os: string;
    arch: string;
    portable: boolean;
  } | null>(null);
  const [dataDirSettings, setDataDirSettings] =
    useState<DataDirSettings | null>(null);
  const [dataDirInput, setDataDirInput] = useState("");
  const [originalDataDirInput, setOriginalDataDirInput] = useState("");

  const { t } = useTranslation();
  const { setTheme } = useTheme();
  const {
    requestPermission,
    isMicrophoneAccessGranted,
    isCameraAccessGranted,
  } = usePermissions();
  const {
    currentLanguage,
    changeLanguage,
    supportedLanguages,
    isLoading: isLanguageLoading,
  } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [originalLanguage, setOriginalLanguage] = useState<string | null>(null);

  const getPermissionIcon = useCallback((type: PermissionType) => {
    switch (type) {
      case "microphone":
        return <BsMic className="size-4" />;
      case "camera":
        return <BsCamera className="size-4" />;
    }
  }, []);

  const getPermissionDisplayName = useCallback(
    (type: PermissionType) => {
      switch (type) {
        case "microphone":
          return t("settings.permissions.microphone");
        case "camera":
          return t("settings.permissions.camera");
      }
    },
    [t],
  );

  const getStatusBadge = useCallback(
    (isGranted: boolean) => {
      if (isGranted) {
        return (
          <Badge
            variant="default"
            className="text-success-foreground bg-success"
          >
            {t("common.status.granted")}
          </Badge>
        );
      }
      return <Badge variant="secondary">{t("common.status.notGranted")}</Badge>;
    },
    [t],
  );

  const getPermissionDescription = useCallback(
    (type: PermissionType) => {
      switch (type) {
        case "microphone":
          return t("settings.permissions.microphoneDescription");
        case "camera":
          return t("settings.permissions.cameraDescription");
      }
    },
    [t],
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const appSettings = await invoke<AppSettings>("get_app_settings");
      const tokyoNightTheme = getThemeById("tokyo-night");
      if (!tokyoNightTheme) {
        throw new Error("Tokyo Night theme not found");
      }
      const merged: AppSettings = {
        ...appSettings,
        custom_theme:
          appSettings.custom_theme &&
          Object.keys(appSettings.custom_theme).length > 0
            ? appSettings.custom_theme
            : tokyoNightTheme.colors,
      };
      setSettings(merged);
      setOriginalSettings(merged);

      const dirSettings = await invoke<DataDirSettings>(
        "get_data_dir_settings",
      );
      const configuredDir = dirSettings.configured_data_dir ?? "";
      setDataDirSettings(dirSettings);
      setDataDirInput(configuredDir);
      setOriginalDataDirInput(configuredDir);

      // Initialize custom theme state
      if (merged.theme === "custom" && merged.custom_theme) {
        const matchingTheme = getThemeByColors(merged.custom_theme);
        setCustomThemeState({
          selectedThemeId: matchingTheme?.id ?? null,
          colors: merged.custom_theme,
        });
      } else if (merged.theme === "custom") {
        // Initialize with Tokyo Night if no custom theme exists
        setCustomThemeState({
          selectedThemeId: "tokyo-night",
          colors: tokyoNightTheme.colors,
        });
      }
      // Load system info
      try {
        const info = await invoke<{
          app_version: string;
          os: string;
          arch: string;
          portable: boolean;
        }>("get_system_info");
        setSystemInfo(info);
      } catch {
        setSystemInfo(null);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyCustomTheme = useCallback((vars: Record<string, string>) => {
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => {
      root.style.setProperty(k, v, "important");
    });
  }, []);

  const clearCustomTheme = useCallback(() => {
    const root = document.documentElement;
    THEME_VARIABLES.forEach(({ key }) => {
      root.style.removeProperty(key as string);
    });
  }, []);

  const loadPermissions = useCallback(() => {
    setIsLoadingPermissions(true);
    try {
      if (!isMacOS) {
        // On non-macOS platforms, don't show permissions
        setPermissions([]);
        return;
      }

      const permissionList: PermissionInfo[] = [
        {
          permission_type: "microphone",
          isGranted: isMicrophoneAccessGranted,
          description: getPermissionDescription("microphone"),
        },
        {
          permission_type: "camera",
          isGranted: isCameraAccessGranted,
          description: getPermissionDescription("camera"),
        },
      ];

      setPermissions(permissionList);
    } catch (error) {
      console.error("Failed to load permissions:", error);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [
    getPermissionDescription,
    isCameraAccessGranted,
    isMacOS,
    isMicrophoneAccessGranted,
  ]);

  const checkDefaultBrowserStatus = useCallback(async () => {
    try {
      const isDefault = await invoke<boolean>("is_default_browser");
      setIsDefaultBrowser(isDefault);
    } catch (error) {
      console.error("Failed to check default browser status:", error);
    }
  }, []);

  const handleSetDefaultBrowser = useCallback(async () => {
    setIsSettingDefault(true);
    try {
      await invoke("set_as_default_browser");
      await checkDefaultBrowserStatus();
    } catch (error) {
      console.error("Failed to set as default browser:", error);
    } finally {
      setIsSettingDefault(false);
    }
  }, [checkDefaultBrowserStatus]);

  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      await invoke("clear_all_version_cache_and_refetch");
      // Also clear traffic stats cache
      await invoke("clear_all_traffic_stats");
      // Don't show immediate success toast - let the version update progress events handle it
    } catch (error) {
      console.error("Failed to clear cache:", error);
      showErrorToast(t("settings.advanced.clearCacheFailed"), {
        description:
          error instanceof Error ? error.message : t("common.errors.unknown"),
        duration: 4000,
      });
    } finally {
      setIsClearingCache(false);
    }
  }, [t]);

  const handleRequestPermission = useCallback(
    async (permissionType: PermissionType) => {
      setRequestingPermission(permissionType);
      try {
        const granted = await requestPermission(permissionType);
        if (granted) {
          showSuccessToast(
            permissionType === "microphone"
              ? t("permissionDialog.grantedToastMicrophone")
              : t("permissionDialog.grantedToastCamera"),
          );
          return;
        }

        await openUrl(
          `x-apple.systempreferences:com.apple.preference.security?${
            permissionType === "microphone"
              ? "Privacy_Microphone"
              : "Privacy_Camera"
          }`,
        );
        showErrorToast(
          permissionType === "microphone"
            ? t("permissionDialog.stillNotGrantedMicrophone")
            : t("permissionDialog.stillNotGrantedCamera"),
        );
      } catch (error) {
        console.error("Failed to request permission:", error);
        showErrorToast(t("permissionDialog.requestFailed"));
      } finally {
        setRequestingPermission(null);
      }
    },
    [requestPermission, t],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Update settings with current custom theme state
      let settingsToSave: AppSettings = {
        ...settings,
        custom_theme:
          settings.theme === "custom"
            ? customThemeState.colors
            : settings.custom_theme,
      };

      const dataDirChanged = dataDirInput !== originalDataDirInput;
      if (dataDirChanged) {
        const updatedDataDirSettings = await invoke<DataDirSettings>(
          "save_data_dir_settings",
          { dataDir: dataDirInput.trim() || null },
        );
        const configuredDir = updatedDataDirSettings.configured_data_dir ?? "";
        setDataDirSettings(updatedDataDirSettings);
        setDataDirInput(configuredDir);
        setOriginalDataDirInput(configuredDir);
      }

      console.log("[settings-dialog] Saving settings:", {
        theme: settingsToSave.theme,
        hasCustomTheme: !!settingsToSave.custom_theme,
        customThemeKeys: settingsToSave.custom_theme
          ? Object.keys(settingsToSave.custom_theme).length
          : 0,
      });

      const savedSettings = await invoke<AppSettings>("save_app_settings", {
        settings: settingsToSave,
      });

      console.log("[settings-dialog] Saved settings response:", {
        theme: savedSettings.theme,
        hasCustomTheme: !!savedSettings.custom_theme,
        customThemeKeys: savedSettings.custom_theme
          ? Object.keys(savedSettings.custom_theme).length
          : 0,
      });

      // Update settings with any generated tokens
      setSettings(savedSettings);
      settingsToSave = savedSettings;
      // Pass the actual theme value through. Calling setTheme("dark") here
      // when the user is on "custom" pushes the provider state to "dark",
      // which triggers its clear-custom-vars effect and wipes the CSS
      // variables we set just below — that's the bug where saving a custom
      // theme made it disappear until the app was restarted.
      setTheme(settings.theme);

      // Apply or clear custom variables only on Save
      if (settings.theme === "custom") {
        if (Object.keys(customThemeState.colors).length > 0) {
          try {
            const root = document.documentElement;
            // Clear any previous custom vars first
            THEME_VARIABLES.forEach(({ key }) => {
              root.style.removeProperty(key as string);
            });
            Object.entries(customThemeState.colors).forEach(([k, v]) => {
              root.style.setProperty(k, v, "important");
            });
          } catch {
            /* empty */
          }
        }
      } else {
        try {
          const root = document.documentElement;
          THEME_VARIABLES.forEach(({ key }) => {
            root.style.removeProperty(key as string);
          });
        } catch {
          /* empty */
        }
      }

      // Save language if changed
      if (selectedLanguage !== originalLanguage) {
        await changeLanguage(
          selectedLanguage === "system"
            ? null
            : (selectedLanguage as
                | "en"
                | "es"
                | "pt"
                | "fr"
                | "zh"
                | "ja"
                | "ko"
                | "ru"
                | "vi"),
        );
        setOriginalLanguage(selectedLanguage);
      }

      setOriginalSettings(settingsToSave);
      if (dataDirChanged) {
        showSuccessToast(t("settings.advanced.dataDirRestartWarning"), {
          description: t("settings.advanced.dataDirNoMigrationWarning"),
          duration: 7000,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
      showErrorToast(t("settings.advanced.dataDirSaveFailed"), {
        description:
          error instanceof Error ? error.message : t("common.errors.unknown"),
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    onClose,
    setTheme,
    settings,
    customThemeState,
    dataDirInput,
    originalDataDirInput,
    selectedLanguage,
    originalLanguage,
    changeLanguage,
    t,
  ]);

  const updateSetting = useCallback(
    (
      key: keyof AppSettings,
      value: boolean | string | Record<string, string> | undefined,
    ) => {
      setSettings((prev) => ({ ...prev, [key]: value as unknown as never }));
    },
    [],
  );

  const handleClose = useCallback(() => {
    // Restore original theme when closing without saving
    if (originalSettings.theme === "custom" && originalSettings.custom_theme) {
      applyCustomTheme(originalSettings.custom_theme);
    } else {
      clearCustomTheme();
    }

    // Reset custom theme state to original
    if (originalSettings.theme === "custom" && originalSettings.custom_theme) {
      const matchingTheme = getThemeByColors(originalSettings.custom_theme);
      setCustomThemeState({
        selectedThemeId: matchingTheme?.id ?? null,
        colors: originalSettings.custom_theme,
      });
    }

    onClose();
  }, [
    originalSettings.theme,
    originalSettings.custom_theme,
    applyCustomTheme,
    clearCustomTheme,
    onClose,
  ]);

  // Only clear custom theme when switching away from custom, don't apply live changes
  useEffect(() => {
    if (settings.theme !== "custom") {
      clearCustomTheme();
    }
  }, [settings.theme, clearCustomTheme]);

  useEffect(() => {
    if (isOpen) {
      loadSettings().catch((err: unknown) => {
        console.error(err);
      });
      checkDefaultBrowserStatus().catch((err: unknown) => {
        console.error(err);
      });

      // Check if we're on macOS
      const userAgent = navigator.userAgent;
      const isMac = userAgent.includes("Mac");
      setIsMacOS(isMac);
      const isLin = !userAgent.includes("Mac") && !userAgent.includes("Win");
      setIsLinux(isLin);

      if (isMac) {
        loadPermissions();
      }

      // Set up interval to check default browser status
      const intervalId = setInterval(() => {
        checkDefaultBrowserStatus().catch((err: unknown) => {
          console.error(err);
        });
      }, 2000);

      // Cleanup interval on component unmount or dialog close
      return () => {
        clearInterval(intervalId);
      };
    }
  }, [isOpen, loadPermissions, checkDefaultBrowserStatus, loadSettings]);

  // Initialize language selection when dialog opens or language loads
  useEffect(() => {
    if (isOpen && !isLanguageLoading) {
      setSelectedLanguage(currentLanguage);
      setOriginalLanguage(currentLanguage);
    }
  }, [isOpen, currentLanguage, isLanguageLoading]);

  // Update permissions when the permission states change
  useEffect(() => {
    if (isMacOS) {
      const permissionList: PermissionInfo[] = [
        {
          permission_type: "microphone",
          isGranted: isMicrophoneAccessGranted,
          description: getPermissionDescription("microphone"),
        },
        {
          permission_type: "camera",
          isGranted: isCameraAccessGranted,
          description: getPermissionDescription("camera"),
        },
      ];
      setPermissions(permissionList);
    } else {
      setPermissions([]);
    }
  }, [
    isMacOS,
    isMicrophoneAccessGranted,
    isCameraAccessGranted,
    getPermissionDescription,
  ]);

  // Check if settings have changed (excluding default browser setting)
  const hasChanges =
    settings.theme !== originalSettings.theme ||
    settings.api_enabled !== originalSettings.api_enabled ||
    selectedLanguage !== originalLanguage ||
    (settings.theme === "custom" &&
      JSON.stringify(customThemeState.colors) !==
        JSON.stringify(originalSettings.custom_theme ?? {})) ||
    (settings.theme !== "custom" &&
      JSON.stringify(settings.custom_theme ?? {}) !==
        JSON.stringify(originalSettings.custom_theme ?? {})) ||
    settings.disable_auto_updates !== originalSettings.disable_auto_updates ||
    dataDirInput !== originalDataDirInput;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose} subPage={subPage}>
      <DialogContent className="max-w-md max-h-[80vh] my-8 flex flex-col">
        {!subPage && (
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("settings.title")}</DialogTitle>
          </DialogHeader>
        )}

        <div
          className={cn(
            "grid overflow-y-auto flex-1 gap-6 min-h-0",
            subPage ? "py-2" : "py-4",
          )}
        >
          {/* Appearance Section */}
          <div className="space-y-4">
            <Label className="text-base font-medium">
              {t("settings.appearance.title")}
            </Label>

            <div className="grid gap-2">
              <Label htmlFor="theme-select" className="text-sm">
                {t("settings.appearance.theme")}
              </Label>
              <Select
                value={settings.theme}
                onValueChange={(value) => {
                  updateSetting("theme", value);
                  if (value === "custom") {
                    const tokyoNightTheme = getThemeById("tokyo-night");
                    if (tokyoNightTheme) {
                      setCustomThemeState({
                        selectedThemeId: "tokyo-night",
                        colors: tokyoNightTheme.colors,
                      });
                    }
                  }
                }}
              >
                <SelectTrigger id="theme-select">
                  <SelectValue
                    placeholder={t("settings.appearance.selectTheme")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    {t("settings.appearance.light")}
                  </SelectItem>
                  <SelectItem value="dark">
                    {t("settings.appearance.dark")}
                  </SelectItem>
                  <SelectItem value="system">
                    {t("settings.appearance.system")}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t("common.labels.custom")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("settings.appearance.themeDescription")}
            </p>

            {settings.theme === "custom" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="theme-preset-select"
                    className="text-sm font-medium"
                  >
                    {t("settings.appearance.themePreset")}
                  </Label>
                  <Select
                    value={customThemeState.selectedThemeId ?? "custom"}
                    onValueChange={(value) => {
                      if (value === "custom") {
                        setCustomThemeState((prev) => ({
                          ...prev,
                          selectedThemeId: null,
                        }));
                      } else {
                        const theme = getThemeById(value);
                        if (theme) {
                          setCustomThemeState({
                            selectedThemeId: value,
                            colors: theme.colors,
                          });
                        }
                      }
                    }}
                  >
                    <SelectTrigger id="theme-preset-select">
                      <SelectValue
                        placeholder={t("settings.appearance.selectThemePreset")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        {t("settings.appearance.yourOwn")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm font-medium">
                  {t("settings.appearance.customColors")}
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {THEME_VARIABLES.map(({ key, label }) => {
                    const colorValue =
                      customThemeState.colors[key] ?? "#000000";
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-1 items-center"
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              aria-label={label}
                              className="size-8 rounded-md border shadow-sm cursor-pointer"
                              style={{ backgroundColor: colorValue }}
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[320px] p-3"
                            sideOffset={6}
                          >
                            <ColorPicker
                              className="p-3 rounded-md border shadow-sm bg-background"
                              value={colorValue}
                              onColorChange={([r, g, b, a]) => {
                                const next = Color({ r, g, b }).alpha(a);
                                const nextStr = next.hexa();
                                const newColors = {
                                  ...customThemeState.colors,
                                  [key]: nextStr,
                                };

                                // Check if colors match any preset theme
                                const matchingTheme =
                                  getThemeByColors(newColors);

                                setCustomThemeState({
                                  selectedThemeId: matchingTheme?.id ?? null,
                                  colors: newColors,
                                });
                              }}
                            >
                              <ColorPickerSelection className="h-36 rounded" />
                              <div className="flex gap-3 items-center mt-3">
                                <ColorPickerEyeDropper />
                                <div className="grid gap-1 w-full">
                                  <ColorPickerHue />
                                  <ColorPickerAlpha />
                                </div>
                              </div>
                              <div className="flex gap-2 items-center mt-3">
                                <ColorPickerOutput />
                                <ColorPickerFormat />
                              </div>
                            </ColorPicker>
                          </PopoverContent>
                        </Popover>
                        <div className="text-[10px] text-muted-foreground text-center leading-tight">
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Language Section */}
          <div className="space-y-4">
            <Label className="text-base font-medium">
              {t("settings.language.title")}
            </Label>

            <div className="grid gap-2">
              <Label htmlFor="language-select" className="text-sm">
                {t("settings.language.interface")}
              </Label>
              <Select
                value={selectedLanguage ?? "system"}
                onValueChange={(value) => {
                  setSelectedLanguage(value);
                }}
                disabled={isLanguageLoading}
              >
                <SelectTrigger id="language-select">
                  <SelectValue
                    placeholder={t("settings.language.selectLanguage")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    {t("settings.language.systemDefault")}
                  </SelectItem>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("settings.language.description")}
            </p>
          </div>

          {/* Default Browser Section - hidden in portable mode */}
          {!systemInfo?.portable && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base font-medium">
                  {t("settings.defaultBrowser.title")}
                </Label>
                <Badge variant={isDefaultBrowser ? "default" : "secondary"}>
                  {isDefaultBrowser
                    ? t("common.status.active")
                    : t("common.status.inactive")}
                </Badge>
              </div>

              <LoadingButton
                isLoading={isSettingDefault}
                onClick={() => {
                  handleSetDefaultBrowser().catch((err: unknown) => {
                    console.error(err);
                  });
                }}
                disabled={isDefaultBrowser}
                variant={isDefaultBrowser ? "outline" : "default"}
                className="w-full"
              >
                {isDefaultBrowser
                  ? t("settings.defaultBrowser.alreadyDefault")
                  : t("settings.defaultBrowser.setAsDefault")}
              </LoadingButton>

              <p className="text-xs text-muted-foreground">
                {t("settings.defaultBrowser.description")}
              </p>
            </div>
          )}

          {/* Permissions Section - Only show on macOS */}
          {isMacOS && (
            <div className="space-y-4">
              <Label className="text-base font-medium">
                {t("settings.permissions.title")}
              </Label>

              {isLoadingPermissions ? (
                <div className="text-sm text-muted-foreground">
                  {t("settings.permissions.loading")}
                </div>
              ) : (
                <div className="space-y-3">
                  {permissions.map((permission) => (
                    <div
                      key={permission.permission_type}
                      className="flex justify-between items-center p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-x-3">
                        {getPermissionIcon(permission.permission_type)}
                        <div>
                          <div className="text-sm font-medium">
                            {getPermissionDisplayName(
                              permission.permission_type,
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {permission.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-x-2">
                        {getStatusBadge(permission.isGranted)}
                        {!permission.isGranted && (
                          <LoadingButton
                            size="sm"
                            isLoading={
                              requestingPermission ===
                              permission.permission_type
                            }
                            onClick={() => {
                              handleRequestPermission(
                                permission.permission_type,
                              ).catch((err: unknown) => {
                                console.error(err);
                              });
                            }}
                          >
                            Grant
                          </LoadingButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                These permissions allow browsers launched from Donut Browser to
                access system resources. Each website will still ask for your
                permission individually.
              </p>
            </div>
          )}

          {/* Advanced Section */}
          <div className="space-y-4">
            <Label className="text-base font-medium">
              {t("settings.advanced.title")}
            </Label>

            {!isLinux && (
              <div className="flex items-start gap-x-3 p-3 rounded-lg border">
                <Checkbox
                  id="disable-auto-updates"
                  checked={settings.disable_auto_updates ?? false}
                  onCheckedChange={(checked) => {
                    updateSetting("disable_auto_updates", checked as boolean);
                  }}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="disable-auto-updates"
                    className="text-sm font-medium"
                  >
                    {t("settings.disableAutoUpdates")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.disableAutoUpdatesDescription")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-x-3 p-3 rounded-lg border">
              <Checkbox
                id="keep-decrypted-profiles-in-ram"
                checked={settings.keep_decrypted_profiles_in_ram ?? false}
                onCheckedChange={(checked) => {
                  updateSetting(
                    "keep_decrypted_profiles_in_ram",
                    checked as boolean,
                  );
                }}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="keep-decrypted-profiles-in-ram"
                  className="text-sm font-medium"
                >
                  {t("settings.keepDecryptedProfilesInRam")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.keepDecryptedProfilesInRamDescription")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-x-3 p-3 rounded-lg border">
              <Checkbox
                id="clear-cache-after-browser-close"
                checked={settings.clear_cache_after_browser_close ?? true}
                onCheckedChange={(checked) => {
                  updateSetting(
                    "clear_cache_after_browser_close",
                    checked as boolean,
                  );
                }}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="clear-cache-after-browser-close"
                  className="text-sm font-medium"
                >
                  {t("settings.clearCacheAfterBrowserClose")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.clearCacheAfterBrowserCloseDescription")}
                </p>
              </div>
            </div>

            <div className="space-y-3 p-3 rounded-lg border">
              <div className="space-y-1">
                <Label htmlFor="data-dir-input" className="text-sm font-medium">
                  {t("settings.advanced.dataDirTitle")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.advanced.dataDirDescription")}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("settings.advanced.dataDirCurrent")}
                </Label>
                <Input
                  value={dataDirSettings?.current_data_dir ?? ""}
                  readOnly
                  className="text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="data-dir-input"
                  className="text-xs text-muted-foreground"
                >
                  {t("settings.advanced.dataDirCustom")}
                </Label>
                <Input
                  id="data-dir-input"
                  value={dataDirInput}
                  disabled={
                    dataDirSettings?.env_override_active ||
                    dataDirSettings?.portable
                  }
                  onChange={(event) => setDataDirInput(event.target.value)}
                  placeholder={dataDirSettings?.default_data_dir ?? ""}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RippleButton
                  variant="outline"
                  disabled={
                    dataDirSettings?.env_override_active ||
                    dataDirSettings?.portable
                  }
                  onClick={async () => {
                    const selected = await openDialog({
                      directory: true,
                      multiple: false,
                      title: t("settings.advanced.dataDirSelectTitle"),
                    });
                    if (typeof selected === "string") {
                      setDataDirInput(selected);
                    }
                  }}
                >
                  {t("settings.advanced.dataDirBrowse")}
                </RippleButton>
                <RippleButton
                  variant="outline"
                  disabled={
                    dataDirSettings?.env_override_active ||
                    dataDirSettings?.portable
                  }
                  onClick={() => setDataDirInput("")}
                >
                  {t("settings.advanced.dataDirUseDefault")}
                </RippleButton>
              </div>

              {dataDirSettings?.env_override_active ? (
                <p className="text-xs text-warning">
                  {t("settings.advanced.dataDirEnvOverride")}
                </p>
              ) : dataDirSettings?.portable ? (
                <p className="text-xs text-warning">
                  {t("settings.advanced.dataDirPortableMode")}
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-warning">
                    {t("settings.advanced.dataDirRestartWarning")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.advanced.dataDirNoMigrationWarning")}
                  </p>
                </div>
              )}
            </div>

            <LoadingButton
              isLoading={isClearingCache}
              onClick={() => {
                handleClearCache().catch((err: unknown) => {
                  console.error(err);
                });
              }}
              variant="outline"
              className="w-full"
            >
              {t("settings.advanced.clearCache")}
            </LoadingButton>

            <p className="text-xs text-muted-foreground">
              {t("settings.advanced.clearCacheDescription")}
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <RippleButton
                variant="outline"
                className="text-xs"
                onClick={async () => {
                  try {
                    const content = await invoke<string>("read_log_files");
                    await writeClipboardText(content);
                    showSuccessToast(t("settings.advanced.copyLogsSuccess"));
                  } catch (err) {
                    showErrorToast(String(err));
                  }
                }}
              >
                {t("settings.advanced.copyLogs")}
              </RippleButton>
              <RippleButton
                variant="outline"
                className="text-xs"
                onClick={async () => {
                  try {
                    await invoke("open_log_directory");
                  } catch (err) {
                    showErrorToast(String(err));
                  }
                }}
              >
                {t("settings.advanced.openLogDir")}
              </RippleButton>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.advanced.copyLogsDescription")}
            </p>
          </div>

          {/* System Info */}
          {systemInfo && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground font-mono whitespace-pre-line select-all">
                {`Donut Browser ${systemInfo.app_version}\n${systemInfo.os} ${systemInfo.arch}${systemInfo.portable ? " (portable)" : ""}`}
              </p>
            </div>
          )}
        </div>

        {subPage ? (
          <div className="shrink-0 flex items-center justify-end gap-2 pt-2 border-t border-border">
            <LoadingButton
              size="sm"
              isLoading={isSaving}
              onClick={() => {
                handleSave().catch((err: unknown) => {
                  console.error(err);
                });
              }}
              disabled={isLoading || !hasChanges}
            >
              {t("common.buttons.saveSettings")}
            </LoadingButton>
          </div>
        ) : (
          <DialogFooter className="shrink-0">
            <RippleButton variant="outline" onClick={handleClose}>
              {t("common.buttons.cancel")}
            </RippleButton>
            <LoadingButton
              isLoading={isSaving}
              onClick={() => {
                handleSave().catch((err: unknown) => {
                  console.error(err);
                });
              }}
              disabled={isLoading || !hasChanges}
            >
              {t("common.buttons.saveSettings")}
            </LoadingButton>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
