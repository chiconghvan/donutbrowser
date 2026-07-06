"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrent } from "@tauri-apps/plugin-deep-link";
import { useOnborda } from "onborda";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BulkCreateProfileDialog } from "@/components/bulk-create-profile-dialog";
import { CamoufoxConfigDialog } from "@/components/camoufox-config-dialog";
import { CloneProfileDialog } from "@/components/clone-profile-dialog";
import { CloseConfirmDialog } from "@/components/close-confirm-dialog";
import { CommandPalette } from "@/components/command-palette";
import { CookieCopyDialog } from "@/components/cookie-copy-dialog";
import { CookieManagementDialog } from "@/components/cookie-management-dialog";
import { CreateProfileDialog } from "@/components/create-profile-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { ExtensionGroupAssignmentDialog } from "@/components/extension-group-assignment-dialog";
import { ExtensionManagementDialog } from "@/components/extension-management-dialog";
import { GroupAssignmentDialog } from "@/components/group-assignment-dialog";
import { GroupManagementDialog } from "@/components/group-management-dialog";
import HomeHeader from "@/components/home-header";
import { ImportProfileDialog } from "@/components/import-profile-dialog";
import { IntegrationsDialog } from "@/components/integrations-dialog";
import { ONBOARDING_TOUR } from "@/components/onboarding-provider";
import { PermissionDialog } from "@/components/permission-dialog";
import { ProfilesDataTable } from "@/components/profile-data-table";
import {
  type PasswordDialogMode,
  ProfilePasswordDialog,
} from "@/components/profile-password-dialog";
import { ProfileSelectorDialog } from "@/components/profile-selector-dialog";
import { ProxyAssignmentDialog } from "@/components/proxy-assignment-dialog";
import { type AppPage, RailNav } from "@/components/rail-nav";
import { SettingsDialog } from "@/components/settings-dialog";
import { ShortcutsPage } from "@/components/shortcuts-page";
import { ThankYouDialog } from "@/components/thank-you-dialog";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { WindowResizeWarningDialog } from "@/components/window-resize-warning-dialog";
import { useAppUpdateNotifications } from "@/hooks/use-app-update-notifications";
import { useGroupEvents } from "@/hooks/use-group-events";
import type { PermissionType } from "@/hooks/use-permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { useProfileEvents } from "@/hooks/use-profile-events";
import { useUpdateNotifications } from "@/hooks/use-update-notifications";
import { useVersionUpdater } from "@/hooks/use-version-updater";
import { parseBackendError, translateBackendError } from "@/lib/backend-errors";
import {
  ONBOARDING_TOUR_FINISHED_EVENT,
  setOnboardingActive,
} from "@/lib/onboarding-signal";
import {
  matchesGroupDigit,
  matchesShortcut,
  SHORTCUTS,
  type ShortcutId,
} from "@/lib/shortcuts";
import { showErrorToast, showSuccessToast, showToast } from "@/lib/toast-utils";
import type { BrowserProfile, CamoufoxConfig, CloakConfig } from "@/types";

type BrowserTypeString = "camoufox" | "cloak";

interface PendingUrl {
  id: string;
  url: string;
}

export default function Home() {
  const { t } = useTranslation();
  // Mount global version update listener/toasts
  useVersionUpdater();

  // Use the new profile events hook for centralized profile management
  const {
    profiles,
    runningProfiles,
    isLoading: profilesLoading,
    error: profilesError,
  } = useProfileEvents();

  // First-run onboarding tour (Onborda).
  const { startOnborda, isOnbordaVisible } = useOnborda();
  const onboardingHandledRef = useRef(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [thankYouOpen, setThankYouOpen] = useState(false);
  // null = onboarding decision pending; false = not a first-run onboarding (run
  // the normal permission checks); true = first-run onboarding, so the welcome
  // flow drives permissions and the standalone permission dialog is suppressed.
  const [firstRunOnboarding, setFirstRunOnboarding] = useState<boolean | null>(
    null,
  );

  // Welcome flow finished. Users with no profile yet continue into the in-app
  // product tour that walks them through creating their first profile.
  const handleWelcomeComplete = useCallback(() => {
    setWelcomeOpen(false);
    setFirstRunOnboarding(false);
    if (profiles.length === 0) {
      startOnborda(ONBOARDING_TOUR);
    }
  }, [startOnborda, profiles.length]);

  // The product tour finished (user clicked "Finish", not "Skip") → celebrate.
  useEffect(() => {
    const handler = () => setThankYouOpen(true);
    window.addEventListener(ONBOARDING_TOUR_FINISHED_EVENT, handler);
    return () =>
      window.removeEventListener(ONBOARDING_TOUR_FINISHED_EVENT, handler);
  }, []);

  // Suppress the global browser-download toasts while onboarding (welcome or
  // tour) is active — the welcome dialog shows setup progress itself.
  useEffect(() => {
    setOnboardingActive(welcomeOpen || isOnbordaVisible);
  }, [welcomeOpen, isOnbordaVisible]);

  // While the tour is visible, keep the body pinned to the left. Onborda calls
  // scrollIntoView({ inline: "center" }) on the highlighted element; because the
  // body is overflow-hidden it can still be scrolled programmatically, which
  // would shove the whole app (rail and all) sideways with no way to scroll
  // back. The profile table keeps its own scroll container, untouched here.
  useEffect(() => {
    if (!isOnbordaVisible) return;
    const pin = () => {
      if (document.body.scrollLeft !== 0) document.body.scrollLeft = 0;
      if (document.documentElement.scrollLeft !== 0)
        document.documentElement.scrollLeft = 0;
    };
    pin();
    window.addEventListener("scroll", pin, true);
    return () => window.removeEventListener("scroll", pin, true);
  }, [isOnbordaVisible]);

  // On the very first launch, always show the welcome flow
  // (one-shot: the backend flag is set immediately so it can't trigger again).
  // The welcome dialog itself decides whether to continue into the browser
  // download + profile-creation flow — only when the user has no profile yet.
  useEffect(() => {
    if (profilesLoading || onboardingHandledRef.current) return;
    onboardingHandledRef.current = true;
    void (async () => {
      try {
        const completed = await invoke<boolean>("get_onboarding_completed");
        if (completed) {
          setFirstRunOnboarding(false);
          return;
        }
        await invoke("complete_onboarding");
        setFirstRunOnboarding(true);
        setWelcomeOpen(true);
      } catch (err) {
        console.error("Onboarding init failed:", err);
        setFirstRunOnboarding(false);
      }
    })();
  }, [profilesLoading]);

  const {
    groups: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
  } = useGroupEvents();

  const [currentPage, setCurrentPage] = useState<AppPage>("profiles");
  const [extensionManagementInitialTab, _setExtensionManagementInitialTab] =
    useState<"extensions" | "groups">("extensions");
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [bulkCreateProfileDialogOpen, setBulkCreateProfileDialogOpen] =
    useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [integrationsDialogOpen, setIntegrationsDialogOpen] = useState(false);
  const [importProfileDialogOpen, setImportProfileDialogOpen] = useState(false);
  const [camoufoxConfigDialogOpen, setCamoufoxConfigDialogOpen] =
    useState(false);
  const [groupManagementDialogOpen, setGroupManagementDialogOpen] =
    useState(false);
  const [extensionManagementDialogOpen, setExtensionManagementDialogOpen] =
    useState(false);
  const [groupAssignmentDialogOpen, setGroupAssignmentDialogOpen] =
    useState(false);
  const [proxyAssignmentDialogOpen, setProxyAssignmentDialogOpen] =
    useState(false);
  const [selectedProfilesForProxy, setSelectedProfilesForProxy] = useState<
    string[]
  >([]);
  const [
    extensionGroupAssignmentDialogOpen,
    setExtensionGroupAssignmentDialogOpen,
  ] = useState(false);
  const [
    selectedProfilesForExtensionGroup,
    setSelectedProfilesForExtensionGroup,
  ] = useState<string[]>([]);
  const [cookieCopyDialogOpen, setCookieCopyDialogOpen] = useState(false);
  const [cookieManagementDialogOpen, setCookieManagementDialogOpen] =
    useState(false);
  const [
    currentProfileForCookieManagement,
    setCurrentProfileForCookieManagement,
  ] = useState<BrowserProfile | null>(null);
  const [selectedProfilesForCookies, setSelectedProfilesForCookies] = useState<
    string[]
  >([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("__all__");
  const [selectedProfilesForGroup, setSelectedProfilesForGroup] = useState<
    string[]
  >([]);
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pendingUrls, setPendingUrls] = useState<PendingUrl[]>([]);
  const [currentProfileForCamoufoxConfig, setCurrentProfileForCamoufoxConfig] =
    useState<BrowserProfile | null>(null);
  const [cloneProfile, setCloneProfile] = useState<BrowserProfile | null>(null);
  const [passwordDialogProfile, setPasswordDialogProfile] =
    useState<BrowserProfile | null>(null);
  const [passwordDialogMode, setPasswordDialogMode] =
    useState<PasswordDialogMode>("set");
  const pendingLaunchAfterUnlockRef = useRef<BrowserProfile | null>(null);
  const [windowResizeWarningOpen, setWindowResizeWarningOpen] = useState(false);
  const [windowResizeWarningBrowserType, setWindowResizeWarningBrowserType] =
    useState<string | undefined>(undefined);
  const windowResizeWarningResolver = useRef<
    ((proceed: boolean) => void) | null
  >(null);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [currentPermissionType, setCurrentPermissionType] =
    useState<PermissionType>("microphone");
  const [showBulkDeleteConfirmation, setShowBulkDeleteConfirmation] =
    useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Owned by page.tsx so the command palette can request opening the profile
  // info dialog. ProfilesDataTable consumes it through controlled props.
  const [profileInfoDialog, setProfileInfoDialog] =
    useState<BrowserProfile | null>(null);
  const { isMicrophoneAccessGranted, isCameraAccessGranted, isInitialized } =
    usePermissions();

  const handleSelectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedProfiles([]);
  }, []);

  const handleRailNavigate = useCallback((page: AppPage) => {
    setSettingsDialogOpen(false);
    setExtensionManagementDialogOpen(false);
    setGroupManagementDialogOpen(false);
    setIntegrationsDialogOpen(false);
    setImportProfileDialogOpen(false);

    setCurrentPage(page);
    switch (page) {
      case "profiles":
        break;
      case "settings":
        setSettingsDialogOpen(true);
        break;
      case "extensions":
        setExtensionManagementDialogOpen(true);
        break;
      case "groups":
        setGroupManagementDialogOpen(true);
        break;
      case "integrations":
        setIntegrationsDialogOpen(true);
        break;
      case "import":
        setImportProfileDialogOpen(true);
        break;
      case "shortcuts":
        break;
    }
  }, []);

  const runShortcut = useCallback(
    (id: ShortcutId) => {
      switch (id) {
        case "openPalette":
          setCommandPaletteOpen(true);
          break;
        case "openShortcuts":
          handleRailNavigate("shortcuts");
          break;
        case "importProfile":
          handleRailNavigate("import");
          break;
        case "goProfiles":
          handleRailNavigate("profiles");
          break;
        case "goExtensions":
          handleRailNavigate("extensions");
          break;
        case "goGroups":
          handleRailNavigate("groups");
          break;
        case "goIntegrations":
          handleRailNavigate("integrations");
          break;
        case "goSettings":
          handleRailNavigate("settings");
          break;
      }
    },
    [handleRailNavigate],
  );

  // Ordered list the digit shortcuts and palette consume. "__all__" is index 1
  // so Mod+1 always lands on the unfiltered view; the user's groups follow.
  const orderedGroupTargets = useMemo(
    () => [
      { id: "__all__", name: t("rail.profiles") },
      ...groupsData.map((g) => ({ id: g.id, name: g.name })),
    ],
    [groupsData, t],
  );

  const selectGroupByDigit = useCallback(
    (digit: number) => {
      const target = orderedGroupTargets[digit - 1];
      if (!target) return;
      handleRailNavigate("profiles");
      handleSelectGroup(target.id);
    },
    [orderedGroupTargets, handleRailNavigate, handleSelectGroup],
  );

  useEffect(() => {
    // Global keydown — handles Mod+1..9 group jumps first, then falls back to
    // the static SHORTCUTS table. Skipped while typing in an input, EXCEPT
    // ⌘K and ⌘/ which are meta-level shortcuts and should always be reachable.
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;

      const digit = matchesGroupDigit(e);
      if (digit !== null) {
        if (isTyping) return;
        if (digit - 1 >= orderedGroupTargets.length) return;
        e.preventDefault();
        selectGroupByDigit(digit);
        return;
      }

      for (const s of SHORTCUTS) {
        if (!matchesShortcut(s, e)) continue;
        if (isTyping && s.id !== "openPalette" && s.id !== "openShortcuts") {
          return;
        }
        e.preventDefault();
        runShortcut(s.id);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [runShortcut, selectGroupByDigit, orderedGroupTargets.length]);

  // Check for missing binaries and offer to download them
  const checkMissingBinaries = useCallback(async () => {
    try {
      const missingBinaries = await invoke<[string, string, string][]>(
        "check_missing_binaries",
      );

      // Also check for missing GeoIP database
      const missingGeoIP = await invoke<boolean>(
        "check_missing_geoip_database",
      );

      if (missingBinaries.length > 0 || missingGeoIP) {
        if (missingBinaries.length > 0) {
          console.log("Found missing binaries:", missingBinaries);
        }
        if (missingGeoIP) {
          console.log("Found missing GeoIP database for Camoufox");
        }

        // Group missing binaries by browser type to avoid concurrent downloads
        const browserMap = new Map<string, string[]>();
        for (const [profileName, browser, version] of missingBinaries) {
          if (!browserMap.has(browser)) {
            browserMap.set(browser, []);
          }
          const versions = browserMap.get(browser);
          if (versions) {
            versions.push(`${version} (for ${profileName})`);
          }
        }

        // Show a toast notification about missing binaries and auto-download them
        let missingList = Array.from(browserMap.entries())
          .map(([browser, versions]) => `${browser}: ${versions.join(", ")}`)
          .join(", ");

        if (missingGeoIP) {
          if (missingList) {
            missingList += ", GeoIP database for Camoufox";
          } else {
            missingList = "GeoIP database for Camoufox";
          }
        }

        console.log(`Downloading missing components: ${missingList}`);

        try {
          // Download missing binaries and GeoIP database sequentially to prevent conflicts
          const downloaded = await invoke<string[]>(
            "ensure_all_binaries_exist",
          );
          if (downloaded.length > 0) {
            console.log(
              "Successfully downloaded missing components:",
              downloaded,
            );
          }
        } catch (downloadError) {
          console.error(
            "Failed to download missing components:",
            downloadError,
          );
        }
      }
    } catch (err: unknown) {
      console.error("Failed to check missing components:", err);
    }
  }, []);

  const [processingUrls, setProcessingUrls] = useState<Set<string>>(new Set());

  const handleUrlOpen = useCallback(
    (url: string) => {
      // Prevent duplicate processing of the same URL
      if (processingUrls.has(url)) {
        console.log("URL already being processed:", url);
        return;
      }

      setProcessingUrls((prev) => new Set(prev).add(url));

      try {
        console.log("URL received for opening:", url);

        // Always show profile selector for manual selection - never auto-open
        // Replace any existing pending URL with the new one
        setPendingUrls([{ id: Date.now().toString(), url }]);
      } finally {
        // Remove URL from processing set after a short delay to prevent rapid duplicates
        setTimeout(() => {
          setProcessingUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        }, 1000);
      }
    },
    [processingUrls],
  );

  // Auto-update functionality - use the existing hook for compatibility
  const updateNotifications = useUpdateNotifications();
  const { checkForUpdates, isUpdating } = updateNotifications;

  useAppUpdateNotifications();

  // Check for startup URLs but only process them once
  const [hasCheckedStartupUrl, setHasCheckedStartupUrl] = useState(false);
  const checkCurrentUrl = useCallback(async () => {
    if (hasCheckedStartupUrl) return;

    try {
      const currentUrl = await getCurrent();
      if (currentUrl && currentUrl.length > 0) {
        console.log("Startup URL detected:", currentUrl[0]);
        handleUrlOpen(currentUrl[0]);
      }
    } catch (error) {
      console.error("Failed to check current URL:", error);
    } finally {
      setHasCheckedStartupUrl(true);
    }
  }, [handleUrlOpen, hasCheckedStartupUrl]);

  // Handle profile errors from useProfileEvents hook
  useEffect(() => {
    if (profilesError) {
      showErrorToast(profilesError);
    }
  }, [profilesError]);

  // Handle group errors from useGroupEvents hook
  useEffect(() => {
    if (groupsError) {
      showErrorToast(groupsError);
    }
  }, [groupsError]);

  // useProxyEvents usage removed — proxy is inline in profiles.

  const checkAllPermissions = useCallback(() => {
    try {
      // Wait for permissions to be initialized before checking
      if (!isInitialized) {
        return;
      }

      // Check if any permissions are not granted - prioritize missing permissions
      if (!isMicrophoneAccessGranted) {
        setCurrentPermissionType("microphone");
        setPermissionDialogOpen(true);
      } else if (!isCameraAccessGranted) {
        setCurrentPermissionType("camera");
        setPermissionDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to check permissions:", error);
    }
  }, [isMicrophoneAccessGranted, isCameraAccessGranted, isInitialized]);

  const checkNextPermission = useCallback(
    (justGranted?: PermissionType) => {
      try {
        // Treat the just-granted permission as already granted even if our
        // own usePermissions instance hasn't observed it yet — it polls on a
        // 5 s cadence and would otherwise leave the dialog stuck on the
        // permission the user just successfully granted.
        const micGranted =
          isMicrophoneAccessGranted || justGranted === "microphone";
        const camGranted = isCameraAccessGranted || justGranted === "camera";

        if (!micGranted) {
          setCurrentPermissionType("microphone");
          setPermissionDialogOpen(true);
        } else if (!camGranted) {
          setCurrentPermissionType("camera");
          setPermissionDialogOpen(true);
        } else {
          setPermissionDialogOpen(false);
        }
      } catch (error) {
        console.error("Failed to check next permission:", error);
      }
    },
    [isMicrophoneAccessGranted, isCameraAccessGranted],
  );

  const listenForUrlEvents = useCallback(async () => {
    try {
      // Listen for URL open events from the deep link handler (when app is already running)
      await listen<string>("url-open-request", (event) => {
        console.log("Received URL open request:", event.payload);
        handleUrlOpen(event.payload);
      });

      // Listen for show profile selector events
      await listen<string>("show-profile-selector", (event) => {
        console.log("Received show profile selector request:", event.payload);
        handleUrlOpen(event.payload);
      });

      // Listen for show create profile dialog events
      await listen<string>("show-create-profile-dialog", (event) => {
        console.log(
          "Received show create profile dialog request:",
          event.payload,
        );
        showErrorToast(t("errors.noProfilesForUrl"));
        setCreateProfileDialogOpen(true);
      });

      // Listen for custom logo click events
      const handleLogoUrlEvent = (event: CustomEvent) => {
        console.log("Received logo URL event:", event.detail);
        handleUrlOpen(event.detail);
      };

      window.addEventListener(
        "url-open-request",
        handleLogoUrlEvent as EventListener,
      );

      // Return cleanup function
      return () => {
        window.removeEventListener(
          "url-open-request",
          handleLogoUrlEvent as EventListener,
        );
      };
    } catch (error) {
      console.error("Failed to setup URL listener:", error);
    }
  }, [handleUrlOpen, t]);

  const handleConfigureCamoufox = useCallback((profile: BrowserProfile) => {
    setCurrentProfileForCamoufoxConfig(profile);
    setCamoufoxConfigDialogOpen(true);
  }, []);

  const handleSaveCamoufoxConfig = useCallback(
    async (profile: BrowserProfile, config: CamoufoxConfig) => {
      try {
        await invoke("update_camoufox_config", {
          profileId: profile.id,
          config,
        });
        // No need to manually reload - useProfileEvents will handle the update
        setCamoufoxConfigDialogOpen(false);
      } catch (err: unknown) {
        console.error("Failed to update camoufox config:", err);
        showErrorToast(
          t("errors.updateCamoufoxConfigFailed", {
            error: JSON.stringify(err),
          }),
        );
        throw err;
      }
    },
    [t],
  );

  const handleSaveCloakConfig = useCallback(
    async (profile: BrowserProfile, config: CloakConfig) => {
      try {
        try {
          await invoke("update_cloak_config", {
            profileId: profile.id,
            config,
          });
        } catch (err) {
          const parsed = parseBackendError(err);
          if (
            parsed?.code === "CLOAK_SEED_DUPLICATE" &&
            window.confirm(
              t("config.cloak.duplicateSeedConfirm", {
                seed: parsed.params?.seed ?? "",
                profileName: parsed.params?.profileName ?? "",
              }),
            )
          ) {
            await invoke("update_cloak_config", {
              profileId: profile.id,
              config,
              allowDuplicateSeed: true,
            });
          } else {
            throw err;
          }
        }
        setCamoufoxConfigDialogOpen(false);
      } catch (err: unknown) {
        console.error("Failed to update cloak config:", err);
        showErrorToast(
          t("errors.updateCloakConfigFailed", { error: JSON.stringify(err) }),
        );
        throw err;
      }
    },
    [t],
  );

  const handleCreateProfile = useCallback(
    async (profileData: {
      name: string;
      browserStr: BrowserTypeString;
      version: string;
      releaseType: string;
      proxyId?: string;
      camoufoxConfig?: CamoufoxConfig;
      cloakConfig?: CloakConfig;
      groupId?: string;
      extensionGroupId?: string;
      ephemeral?: boolean;
      launchHook?: string;
      password?: string;
      allowDuplicateCloakSeed?: boolean;
    }) => {
      try {
        const profile = await invoke<BrowserProfile>(
          "create_browser_profile_new",
          {
            name: profileData.name,
            browserStr: profileData.browserStr,
            version: profileData.version,
            releaseType: profileData.releaseType,
            proxyId: profileData.proxyId,
            camoufoxConfig: profileData.camoufoxConfig,
            cloakConfig: profileData.cloakConfig,
            allowDuplicateCloakSeed: profileData.allowDuplicateCloakSeed,
            groupId:
              profileData.groupId ??
              (selectedGroupId && selectedGroupId !== "__all__"
                ? selectedGroupId
                : undefined),
            ephemeral: profileData.ephemeral,
            launchHook: profileData.launchHook,
          },
        );

        if (profileData.extensionGroupId) {
          try {
            await invoke("assign_extension_group_to_profile", {
              profileId: profile.id,
              extensionGroupId: profileData.extensionGroupId,
            });
          } catch (err) {
            console.error("Failed to assign extension group:", err);
          }
        }

        if (profileData.password && !profileData.ephemeral) {
          try {
            await invoke("set_profile_password", {
              profileId: profile.id,
              password: profileData.password,
            });
          } catch (err) {
            showErrorToast(
              t("errors.setProfilePasswordFailed", {
                error: translateBackendError(t, err),
              }),
            );
          }
        }

        // No need to manually reload - useProfileEvents will handle the update
      } catch (error) {
        if (parseBackendError(error)?.code === "CLOAK_SEED_DUPLICATE") {
          throw error;
        }
        showErrorToast(
          t("errors.createProfileFailed", {
            error: translateBackendError(t, error),
          }),
        );
        // Rethrow so the create dialog keeps itself open (its own handler
        // skips closing on error), letting the user fix the proxy and retry.
        throw error;
      }
    },
    [selectedGroupId, t],
  );

  const launchProfile = useCallback(
    async (profile: BrowserProfile) => {
      console.log("Starting launch for profile:", profile.name);

      // Password-protected: must be unlocked before launch
      if (profile.password_protected) {
        try {
          const isLocked = await invoke<boolean>("is_profile_locked", {
            profileId: profile.id,
          });
          if (isLocked) {
            pendingLaunchAfterUnlockRef.current = profile;
            setPasswordDialogMode("unlock");
            setPasswordDialogProfile(profile);
            return;
          }
        } catch (err) {
          console.error("Failed to check profile lock state:", err);
        }
      }

      // Show one-time warning about window resizing for fingerprinted browsers
      if (profile.browser === "camoufox" || profile.browser === "cloak") {
        try {
          const dismissed = await invoke<boolean>(
            "get_window_resize_warning_dismissed",
          );
          if (!dismissed) {
            const proceed = await new Promise<boolean>((resolve) => {
              windowResizeWarningResolver.current = resolve;
              setWindowResizeWarningBrowserType(profile.browser);
              setWindowResizeWarningOpen(true);
            });
            if (!proceed) {
              return;
            }
          }
        } catch (error) {
          console.error("Failed to check window resize warning:", error);
        }
      }

      try {
        const result = await invoke<BrowserProfile>("launch_browser_profile", {
          profile,
        });
        console.log("Successfully launched profile:", result.name);
      } catch (err: unknown) {
        console.error("Failed to launch browser:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        showErrorToast(
          t("errors.launchBrowserFailed", { error: errorMessage }),
        );
        throw err;
      }
    },
    [t],
  );

  const handleCloneProfile = useCallback((profile: BrowserProfile) => {
    setCloneProfile(profile);
  }, []);

  const handleSetPassword = useCallback((profile: BrowserProfile) => {
    pendingLaunchAfterUnlockRef.current = null;
    setPasswordDialogMode("set");
    setPasswordDialogProfile(profile);
  }, []);

  const handleChangePassword = useCallback((profile: BrowserProfile) => {
    pendingLaunchAfterUnlockRef.current = null;
    setPasswordDialogMode("change");
    setPasswordDialogProfile(profile);
  }, []);

  const handleRemovePassword = useCallback((profile: BrowserProfile) => {
    pendingLaunchAfterUnlockRef.current = null;
    setPasswordDialogMode("remove");
    setPasswordDialogProfile(profile);
  }, []);

  const handleDeleteProfile = useCallback(
    async (profile: BrowserProfile) => {
      console.log("Attempting to delete profile:", profile.name);

      try {
        // First check if the browser is running for this profile
        const isRunning = await invoke<boolean>("check_browser_status", {
          profile,
        });

        if (isRunning) {
          showErrorToast(t("errors.cannotDeleteRunningProfile"));
          return;
        }

        // Attempt to delete the profile
        await invoke("delete_profile", { profileId: profile.id });
        console.log("Profile deletion command completed successfully");

        // No need to manually reload - useProfileEvents will handle the update
        console.log("Profile deleted successfully");
      } catch (err: unknown) {
        console.error("Failed to delete profile:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        showErrorToast(
          t("errors.deleteProfileFailed", { error: errorMessage }),
        );
      }
    },
    [t],
  );

  const handleRenameProfile = useCallback(
    async (profileId: string, newName: string) => {
      try {
        await invoke("rename_profile", { profileId, newName });
        // No need to manually reload - useProfileEvents will handle the update
      } catch (err: unknown) {
        console.error("Failed to rename profile:", err);
        showErrorToast(
          t("errors.renameProfileFailed", { error: JSON.stringify(err) }),
        );
        throw err;
      }
    },
    [t],
  );

  const handleKillProfile = useCallback(
    async (profile: BrowserProfile) => {
      console.log("Starting kill for profile:", profile.name);

      try {
        await invoke("kill_browser_profile", { profile });
        console.log("Successfully killed profile:", profile.name);
        // No need to manually reload - useProfileEvents will handle the update
      } catch (err: unknown) {
        console.error("Failed to kill browser:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        showErrorToast(t("errors.killBrowserFailed", { error: errorMessage }));
        // Re-throw the error so the table component can handle loading state cleanup
        throw err;
      }
    },
    [t],
  );

  const handleDeleteSelectedProfiles = useCallback(
    async (profileIds: string[]) => {
      try {
        await invoke("delete_selected_profiles", { profileIds });
        // No need to manually reload - useProfileEvents will handle the update
      } catch (err: unknown) {
        console.error("Failed to delete selected profiles:", err);
        showErrorToast(
          t("errors.deleteSelectedProfilesFailed", {
            error: JSON.stringify(err),
          }),
        );
      }
    },
    [t],
  );

  const handleAssignProfilesToGroup = useCallback((profileIds: string[]) => {
    setSelectedProfilesForGroup(profileIds);
    setGroupAssignmentDialogOpen(true);
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedProfiles.length === 0) return;
    setShowBulkDeleteConfirmation(true);
  }, [selectedProfiles]);

  const confirmBulkDelete = useCallback(async () => {
    if (selectedProfiles.length === 0) return;

    setIsBulkDeleting(true);
    try {
      await invoke("delete_selected_profiles", {
        profileIds: selectedProfiles,
      });
      // No need to manually reload - useProfileEvents will handle the update
      setSelectedProfiles([]);
      setShowBulkDeleteConfirmation(false);
    } catch (error) {
      console.error("Failed to delete selected profiles:", error);
      showErrorToast(
        t("errors.deleteSelectedProfilesFailed", {
          error: JSON.stringify(error),
        }),
      );
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedProfiles, t]);

  const handleBulkGroupAssignment = useCallback(() => {
    if (selectedProfiles.length === 0) return;
    handleAssignProfilesToGroup(selectedProfiles);
    setSelectedProfiles([]);
  }, [selectedProfiles, handleAssignProfilesToGroup]);

  const handleAssignProfilesToProxy = useCallback((profileIds: string[]) => {
    setSelectedProfilesForProxy(profileIds);
    setProxyAssignmentDialogOpen(true);
  }, []);

  const handleBulkProxyAssignment = useCallback(() => {
    if (selectedProfiles.length === 0) return;
    handleAssignProfilesToProxy(selectedProfiles);
    setSelectedProfiles([]);
  }, [selectedProfiles, handleAssignProfilesToProxy]);

  const handleProxyAssignmentComplete = useCallback(() => {
    setProxyAssignmentDialogOpen(false);
    setSelectedProfilesForProxy([]);
  }, []);

  const handleAssignExtensionGroup = useCallback((profileIds: string[]) => {
    setSelectedProfilesForExtensionGroup(profileIds);
    setExtensionGroupAssignmentDialogOpen(true);
  }, []);

  const handleBulkExtensionGroupAssignment = useCallback(() => {
    if (selectedProfiles.length === 0) return;
    handleAssignExtensionGroup(selectedProfiles);
    setSelectedProfiles([]);
  }, [selectedProfiles, handleAssignExtensionGroup]);

  const handleExtensionGroupAssignmentComplete = useCallback(() => {
    setExtensionGroupAssignmentDialogOpen(false);
    setSelectedProfilesForExtensionGroup([]);
  }, []);

  const handleBulkCopyCookies = useCallback(() => {
    if (selectedProfiles.length === 0) return;
    const eligibleProfiles = profiles.filter(
      (p) =>
        selectedProfiles.includes(p.id) &&
        (p.browser === "camoufox" || p.browser === "cloak"),
    );
    if (eligibleProfiles.length === 0) {
      showErrorToast(t("errors.cookieCopyUnsupportedBrowser"));
      return;
    }
    setSelectedProfilesForCookies(eligibleProfiles.map((p) => p.id));
    setCookieCopyDialogOpen(true);
  }, [selectedProfiles, profiles, t]);

  const handleBulkCopySelectedNames = useCallback(async () => {
    if (selectedProfiles.length === 0) return;

    const selectedProfileNames = selectedProfiles
      .map(
        (profileId) =>
          profiles.find((profile) => profile.id === profileId)?.name,
      )
      .filter((name): name is string => Boolean(name))
      .map((name) => name.replace(/[\r\n]+/g, " "));

    if (selectedProfileNames.length === 0) {
      showErrorToast(t("profiles.actionBar.copySelectedNamesFailed"));
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedProfileNames.join("\n"));
      showSuccessToast(t("profiles.actionBar.copySelectedNamesSuccess"));
    } catch (error) {
      console.error("Failed to copy selected profile names:", error);
      showErrorToast(t("profiles.actionBar.copySelectedNamesFailed"));
    }
  }, [profiles, selectedProfiles, t]);

  const handleCopyCookiesToProfile = useCallback((profile: BrowserProfile) => {
    setSelectedProfilesForCookies([profile.id]);
    setCookieCopyDialogOpen(true);
  }, []);

  const handleOpenCookieManagement = useCallback((profile: BrowserProfile) => {
    setCurrentProfileForCookieManagement(profile);
    setCookieManagementDialogOpen(true);
  }, []);

  const handleGroupAssignmentComplete = useCallback(() => {
    // No need to manually reload - useProfileEvents will handle the update
    setGroupAssignmentDialogOpen(false);
    setSelectedProfilesForGroup([]);
  }, []);

  const handleGroupManagementComplete = useCallback(async () => {
    // No need to manually reload - useProfileEvents will handle the update
  }, []);

  useEffect(() => {
    // Listen for URL open events and get cleanup function
    const setupListeners = async () => {
      const cleanup = await listenForUrlEvents();
      return cleanup;
    };

    let cleanup: (() => void) | undefined;
    void setupListeners().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    // Check for startup URLs (when app was launched as default browser)
    void checkCurrentUrl();

    // Set up periodic update checks (every 30 minutes)
    const updateInterval = setInterval(
      () => {
        void checkForUpdates();
      },
      30 * 60 * 1000,
    );

    // Check for missing binaries after initial profile load
    if (!profilesLoading && profiles.length > 0) {
      void checkMissingBinaries();
    }

    // Proactively download active browsers if not already available
    if (!profilesLoading) {
      void invoke("ensure_active_browsers_downloaded").catch((err: unknown) => {
        console.error("Failed to auto-download browsers:", err);
      });
    }

    return () => {
      clearInterval(updateInterval);
      if (cleanup) {
        cleanup();
      }
    };
  }, [
    checkForUpdates,
    listenForUrlEvents,
    checkCurrentUrl,
    checkMissingBinaries,
    profilesLoading,
    profiles.length,
  ]);

  // Show warning for non-camoufox/cloak profiles (support ending March 15, 2026)
  useEffect(() => {
    if (profiles.length === 0) return;

    const unsupportedProfiles = profiles.filter(
      (p) => p.browser !== "camoufox" && p.browser !== "cloak",
    );

    if (unsupportedProfiles.length > 0) {
      const unsupportedNames = unsupportedProfiles
        .map((p) => p.name)
        .join(", ");

      showToast({
        id: "browser-support-ending-warning",
        type: "error",
        title: t("browserSupport.endingSoonTitle"),
        description: t("browserSupport.endingSoonDescription", {
          profiles: unsupportedNames,
        }),
        duration: 15000,
        action: {
          label: t("common.buttons.learnMore"),
          onClick: () => {
            const event = new CustomEvent("url-open-request", {
              detail: "https://github.com/chiconghvan/donutbrowser/discussions",
            });
            window.dispatchEvent(event);
          },
        },
      });
    }
  }, [profiles, t]);

  // Check permissions when they are initialized. During first-run onboarding
  // the welcome flow requests permissions, so the standalone dialog is deferred
  // until we know this isn't a first-run onboarding.
  useEffect(() => {
    if (isInitialized && firstRunOnboarding === false) {
      checkAllPermissions();
    }
  }, [isInitialized, firstRunOnboarding, checkAllPermissions]);

  // Filter data by selected group and search query
  const filteredProfiles = useMemo(() => {
    let filtered = profiles;

    // Filter by group. "__all__" is a virtual filter that shows every
    // profile (including ungrouped ones). Any other value is a real
    // group id; ungrouped profiles only show through "All".
    if (!selectedGroupId || selectedGroupId === "__all__") {
      filtered = profiles;
    } else {
      filtered = profiles.filter(
        (profile) => profile.group_id === selectedGroupId,
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((profile) => {
        // Search in profile name
        if (profile.name.toLowerCase().includes(query)) return true;

        // Search in note
        if (profile.note?.toLowerCase().includes(query)) return true;

        // Search in tags
        if (profile.tags?.some((tag) => tag.toLowerCase().includes(query)))
          return true;

        return false;
      });
    }

    return filtered;
  }, [profiles, selectedGroupId, searchQuery]);

  // Update loading states
  const isLoading = profilesLoading || groupsLoading;

  const subPageTitle =
    currentPage === "profiles"
      ? undefined
      : currentPage === "import"
        ? t("pageTitle.import")
        : t(`pageTitle.${currentPage}`);

  return (
    <div className="flex flex-col h-screen bg-background font-(family-name:--font-geist-sans)">
      <CloseConfirmDialog />
      <HomeHeader
        onCreateProfileDialogOpen={setCreateProfileDialogOpen}
        onBulkCreateProfileDialogOpen={setBulkCreateProfileDialogOpen}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        groups={groupsData}
        totalProfiles={profiles.length}
        selectedGroupId={selectedGroupId}
        onGroupSelect={handleSelectGroup}
        pageTitle={subPageTitle}
      />
      <div className="flex flex-1 min-h-0">
        <RailNav currentPage={currentPage} onNavigate={handleRailNavigate} />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {currentPage === "profiles" && (
            <div className="px-3 pt-2.5 flex flex-col flex-1 min-h-0">
              {isLoading && groupsData.length === 0 ? null : null}
              <ProfilesDataTable
                profiles={filteredProfiles}
                infoDialogProfile={profileInfoDialog}
                onInfoDialogProfileChange={setProfileInfoDialog}
                onLaunchProfile={launchProfile}
                onKillProfile={handleKillProfile}
                onCloneProfile={handleCloneProfile}
                onSetPassword={handleSetPassword}
                onChangePassword={handleChangePassword}
                onRemovePassword={handleRemovePassword}
                onDeleteProfile={handleDeleteProfile}
                onRenameProfile={handleRenameProfile}
                onConfigureCamoufox={handleConfigureCamoufox}
                onCopyCookiesToProfile={handleCopyCookiesToProfile}
                onOpenCookieManagement={handleOpenCookieManagement}
                runningProfiles={runningProfiles}
                isUpdating={isUpdating}
                onDeleteSelectedProfiles={handleDeleteSelectedProfiles}
                onAssignProfilesToGroup={handleAssignProfilesToGroup}
                selectedGroupId={selectedGroupId}
                selectedProfiles={selectedProfiles}
                onSelectedProfilesChange={setSelectedProfiles}
                onBulkDelete={handleBulkDelete}
                onBulkGroupAssignment={handleBulkGroupAssignment}
                onBulkProxyAssignment={handleBulkProxyAssignment}
                onBulkCopySelectedNames={handleBulkCopySelectedNames}
                onBulkCopyCookies={handleBulkCopyCookies}
                onBulkExtensionGroupAssignment={
                  handleBulkExtensionGroupAssignment
                }
                onAssignExtensionGroup={handleAssignExtensionGroup}
                crossOsUnlocked={true}
              />
            </div>
          )}

          {currentPage === "shortcuts" && (
            <ShortcutsPage groupTargets={orderedGroupTargets} />
          )}

          {settingsDialogOpen && (
            <SettingsDialog
              isOpen={settingsDialogOpen}
              onClose={() => {
                setSettingsDialogOpen(false);
                setCurrentPage("profiles");
              }}
              subPage={currentPage === "settings"}
            />
          )}

          {integrationsDialogOpen && (
            <IntegrationsDialog
              isOpen={integrationsDialogOpen}
              onClose={() => {
                setIntegrationsDialogOpen(false);
                setCurrentPage("profiles");
              }}
              subPage={currentPage === "integrations"}
            />
          )}

          {groupManagementDialogOpen && (
            <GroupManagementDialog
              isOpen={groupManagementDialogOpen}
              onClose={() => {
                setGroupManagementDialogOpen(false);
                setCurrentPage("profiles");
              }}
              onGroupManagementComplete={handleGroupManagementComplete}
              subPage={currentPage === "groups"}
            />
          )}

          {extensionManagementDialogOpen && (
            <ExtensionManagementDialog
              isOpen={extensionManagementDialogOpen}
              onClose={() => {
                setExtensionManagementDialogOpen(false);
                setCurrentPage("profiles");
              }}
              limitedMode={false}
              subPage={currentPage === "extensions"}
              initialTab={extensionManagementInitialTab}
            />
          )}

          {importProfileDialogOpen && (
            <ImportProfileDialog
              isOpen={importProfileDialogOpen}
              onClose={() => {
                setImportProfileDialogOpen(false);
                setCurrentPage("profiles");
              }}
              subPage={currentPage === "import"}
              crossOsUnlocked={true}
            />
          )}
        </main>
      </div>

      <CreateProfileDialog
        isOpen={createProfileDialogOpen}
        onClose={() => {
          setCreateProfileDialogOpen(false);
        }}
        onCreateProfile={handleCreateProfile}
        selectedGroupId={selectedGroupId}
        crossOsUnlocked={true}
      />

      <BulkCreateProfileDialog
        isOpen={bulkCreateProfileDialogOpen}
        onClose={() => {
          setBulkCreateProfileDialogOpen(false);
        }}
        onCreated={() => {
          // profiles-changed event will refresh the list automatically
        }}
        selectedGroupId={selectedGroupId}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onAction={runShortcut}
        groupTargets={orderedGroupTargets}
        onSelectGroup={(id) => {
          handleRailNavigate("profiles");
          handleSelectGroup(id);
        }}
        profiles={profiles}
        runningProfileIds={runningProfiles}
        onLaunchProfile={(profile) => {
          void launchProfile(profile);
        }}
        onKillProfile={(profile) => {
          void handleKillProfile(profile);
        }}
        onShowProfileInfo={(profile) => {
          handleRailNavigate("profiles");
          setProfileInfoDialog(profile);
        }}
      />

      {pendingUrls.map((pendingUrl) => (
        <ProfileSelectorDialog
          key={pendingUrl.id}
          isOpen={true}
          onClose={() => {
            setPendingUrls((prev) =>
              prev.filter((u) => u.id !== pendingUrl.id),
            );
          }}
          url={pendingUrl.url}
          isUpdating={isUpdating}
          runningProfiles={runningProfiles}
        />
      ))}

      <PermissionDialog
        isOpen={permissionDialogOpen}
        onClose={() => {
          setPermissionDialogOpen(false);
        }}
        permissionType={currentPermissionType}
        onPermissionGranted={checkNextPermission}
      />

      <WelcomeDialog
        isOpen={welcomeOpen}
        needsSetup={profiles.length === 0}
        onComplete={handleWelcomeComplete}
      />
      <ThankYouDialog
        isOpen={thankYouOpen}
        onClose={() => setThankYouOpen(false)}
      />

      <CloneProfileDialog
        isOpen={!!cloneProfile}
        onClose={() => {
          setCloneProfile(null);
        }}
        profile={cloneProfile}
      />

      <ProfilePasswordDialog
        isOpen={!!passwordDialogProfile}
        onClose={() => {
          pendingLaunchAfterUnlockRef.current = null;
          setPasswordDialogProfile(null);
        }}
        profile={passwordDialogProfile}
        mode={passwordDialogMode}
        onSuccess={(p) => {
          // Resume pending launch after unlock.
          if (
            passwordDialogMode === "unlock" &&
            pendingLaunchAfterUnlockRef.current?.id === p.id
          ) {
            const target = pendingLaunchAfterUnlockRef.current;
            pendingLaunchAfterUnlockRef.current = null;
            void launchProfile(target);
          }
        }}
      />

      <CamoufoxConfigDialog
        isOpen={camoufoxConfigDialogOpen}
        onClose={() => {
          setCamoufoxConfigDialogOpen(false);
        }}
        profile={currentProfileForCamoufoxConfig}
        onSave={handleSaveCamoufoxConfig}
        onSaveCloak={handleSaveCloakConfig}
        isRunning={
          currentProfileForCamoufoxConfig
            ? runningProfiles.has(currentProfileForCamoufoxConfig.id)
            : false
        }
        crossOsUnlocked={true}
      />

      <GroupAssignmentDialog
        isOpen={groupAssignmentDialogOpen}
        onClose={() => {
          setGroupAssignmentDialogOpen(false);
        }}
        selectedProfiles={selectedProfilesForGroup}
        onAssignmentComplete={handleGroupAssignmentComplete}
      />

      <ProxyAssignmentDialog
        isOpen={proxyAssignmentDialogOpen}
        onClose={() => {
          setProxyAssignmentDialogOpen(false);
        }}
        selectedProfiles={selectedProfilesForProxy}
        onAssignmentComplete={handleProxyAssignmentComplete}
        profiles={profiles}
      />

      <ExtensionGroupAssignmentDialog
        isOpen={extensionGroupAssignmentDialogOpen}
        onClose={() => {
          setExtensionGroupAssignmentDialogOpen(false);
        }}
        selectedProfiles={selectedProfilesForExtensionGroup}
        onAssignmentComplete={handleExtensionGroupAssignmentComplete}
      />

      <CookieCopyDialog
        isOpen={cookieCopyDialogOpen}
        onClose={() => {
          setCookieCopyDialogOpen(false);
          setSelectedProfilesForCookies([]);
        }}
        selectedProfiles={selectedProfilesForCookies}
        profiles={profiles}
        runningProfiles={runningProfiles}
        onCopyComplete={() => {
          setSelectedProfilesForCookies([]);
        }}
      />

      <CookieManagementDialog
        isOpen={cookieManagementDialogOpen}
        onClose={() => {
          setCookieManagementDialogOpen(false);
          setCurrentProfileForCookieManagement(null);
        }}
        profile={currentProfileForCookieManagement}
      />

      <DeleteConfirmationDialog
        isOpen={showBulkDeleteConfirmation}
        onClose={() => {
          setShowBulkDeleteConfirmation(false);
        }}
        onConfirm={confirmBulkDelete}
        title={t("profiles.bulkDelete.title")}
        description={t("profiles.bulkDelete.description", {
          count: selectedProfiles.length,
        })}
        confirmButtonText={t("profiles.bulkDelete.confirmButton", {
          count: selectedProfiles.length,
        })}
        isLoading={isBulkDeleting}
        profileIds={selectedProfiles}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
      />

      <WindowResizeWarningDialog
        isOpen={windowResizeWarningOpen}
        browserType={windowResizeWarningBrowserType}
        onResult={(proceed) => {
          setWindowResizeWarningOpen(false);
          windowResizeWarningResolver.current?.(proceed);
          windowResizeWarningResolver.current = null;
        }}
      />
    </div>
  );
}
