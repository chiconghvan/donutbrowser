import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import i18n from "@/i18n";
import type { StoredProxy } from "@/types";

/**
 * Custom hook to manage proxy-related state and listen for backend events.
 * Stored proxy management is deprecated — profiles carry proxy strings inline.
 * This hook now only tracks proxy usage counts per inline proxy string.
 */
export function useProxyEvents() {
  const [storedProxies] = useState<StoredProxy[]>([]);
  const [proxyUsage, setProxyUsage] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load proxy usage (how many profiles are using each inline proxy string)
  const loadProxyUsage = useCallback(async () => {
    try {
      const profiles = await invoke<{ proxy?: string }[]>(
        "list_browser_profiles",
      );
      const counts: Record<string, number> = {};
      for (const p of profiles) {
        if (p.proxy) counts[p.proxy] = (counts[p.proxy] ?? 0) + 1;
      }
      setProxyUsage(counts);
    } catch (err) {
      console.error("Failed to load proxy usage:", err);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    let profilesUnlisten: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        await loadProxyUsage();

        // Listen for profile changes to update proxy usage counts
        profilesUnlisten = await listen("profiles-changed", () => {
          void loadProxyUsage();
        });
      } catch (err) {
        console.error("Failed to setup proxy event listeners:", err);
        setError(
          i18n.t("errors.setupProxyListenersFailed", {
            error: JSON.stringify(err),
          }),
        );
      } finally {
        setIsLoading(false);
      }
    };

    void setupListeners();

    return () => {
      if (profilesUnlisten) profilesUnlisten();
    };
  }, [loadProxyUsage]);

  return {
    storedProxies,
    proxyUsage,
    isLoading,
    error,
    loadProxies: loadProxyUsage,
    clearError,
  };
}
