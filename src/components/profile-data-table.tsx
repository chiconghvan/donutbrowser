"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Dispatch, SetStateAction } from "react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  LuCheck,
  LuChevronDown,
  LuChevronUp,
  LuCookie,
  LuCopy,
  LuGlobe,
  LuInfo,
  LuList,
  LuLock,
  LuPlay,
  LuPuzzle,
  LuSquare,
  LuTrash2,
  LuTriangleAlert,
  LuUsers,
} from "react-icons/lu";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import {
  ProfileBypassRulesDialog,
  ProfileInfoDialog,
  ProfileLaunchHookDialog,
} from "@/components/profile-info-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBrowserState } from "@/hooks/use-browser-state";
import { useScrollFade } from "@/hooks/use-scroll-fade";
import { useTableSorting } from "@/hooks/use-table-sorting";
import { useTeamLocks } from "@/hooks/use-team-locks";
import {
  getBrowserDisplayName,
  getOSDisplayName,
  isCrossOsProfile,
} from "@/lib/browser-utils";
import { formatRelativeTime } from "@/lib/flag-utils";
import { trimName } from "@/lib/name-utils";
import { cn } from "@/lib/utils";
import type {
  BrowserProfile,
  ExtensionGroup,
  SyncSessionInfo,
  TrafficSnapshot,
  VpnConfig,
} from "@/types";
import { BandwidthMiniChart } from "./bandwidth-mini-chart";
import {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
} from "./data-table-action-bar";

import { TrafficDetailsDialog } from "./traffic-details-dialog";
import { Input } from "./ui/input";
import { RippleButton } from "./ui/ripple";

// Stable table meta type to pass volatile state/handlers into TanStack Table without
// causing column definitions to be recreated on every render.
interface TableMeta {
  t: (key: string, options?: Record<string, unknown>) => string;
  selectedProfiles: string[];
  isClient: boolean;
  runningProfiles: Set<string>;
  launchingProfiles: Set<string>;
  stoppingProfiles: Set<string>;
  isUpdating: (browser: string) => boolean;
  browserState: ReturnType<typeof useBrowserState>;

  // Note editor state
  noteOverrides: Record<string, string | null>;
  openNoteEditorFor: string | null;
  setOpenNoteEditorFor: React.Dispatch<React.SetStateAction<string | null>>;
  setNoteOverrides: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;

  // Proxy display state (inline strings, no stored proxy management)
  proxyOverrides: Record<string, string | null>;

  // VPN selector state
  vpnConfigs: VpnConfig[];
  vpnOverrides: Record<string, string | null>;
  handleVpnSelection: (
    profileId: string,
    vpnId: string | null,
  ) => void | Promise<void>;

  // Extension groups (for Ext column lookup)
  extensionGroups: ExtensionGroup[];

  // Click handlers for inline Ext cell editing
  onAssignExtensionGroup?: (profileIds: string[]) => void;

  // Selection helpers
  isProfileSelected: (id: string) => boolean;
  /** Pointer-down handler to initiate drag selection from the select cell */
  handleSelectPointerDown: (
    e: React.PointerEvent,
    profile: BrowserProfile,
  ) => void;

  // Rename helpers
  handleRename: () => void | Promise<void>;
  setProfileToRename: React.Dispatch<
    React.SetStateAction<BrowserProfile | null>
  >;
  setNewProfileName: React.Dispatch<React.SetStateAction<string>>;
  setRenameError: React.Dispatch<React.SetStateAction<string | null>>;
  profileToRename: BrowserProfile | null;
  newProfileName: string;
  isRenamingSaving: boolean;
  renameError: string | null;

  // Launch/stop helpers
  setLaunchingProfiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStoppingProfiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  onKillProfile: (profile: BrowserProfile) => void | Promise<void>;
  onLaunchProfile: (profile: BrowserProfile) => void | Promise<void>;

  // Overflow actions
  onAssignProfilesToGroup?: (profileIds: string[]) => void;
  onConfigureCamoufox?: (profile: BrowserProfile) => void;
  onCloneProfile?: (profile: BrowserProfile) => void;
  onCopyCookiesToProfile?: (profile: BrowserProfile) => void;
  onOpenCookieManagement?: (profile: BrowserProfile) => void;

  // Traffic snapshots (lightweight real-time data)
  trafficSnapshots: Record<string, TrafficSnapshot>;
  onOpenTrafficDialog?: (profileId: string) => void;

  // Sync
  syncStatuses: Record<string, { status: string; error?: string }>;
  onOpenProfileSyncDialog?: (profile: BrowserProfile) => void;
  onToggleProfileSync?: (profile: BrowserProfile) => void;
  crossOsUnlocked?: boolean;
  syncUnlocked?: boolean;

  // Team locks
  isProfileLockedByAnother: (profileId: string) => boolean;
  getProfileLockEmail: (profileId: string) => string | undefined;

  // Synchronizer
  getProfileSyncInfo: (profileId: string) =>
    | {
        session: SyncSessionInfo;
        isLeader: boolean;
        failedAtUrl: string | null;
      }
    | undefined;
  onLaunchWithSync: (profile: BrowserProfile) => void;
}

interface SyncStatusDot {
  color: string;
  tooltip: string;
  animate: boolean;
  encrypted: boolean;
}

function getProfileSyncStatusDot(
  profile: BrowserProfile,
  liveStatus:
    | "syncing"
    | "waiting"
    | "synced"
    | "error"
    | "disabled"
    | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  errorMessage?: string,
): SyncStatusDot | null {
  const encrypted = profile.sync_mode === "Encrypted";
  const status =
    liveStatus ??
    (profile.sync_mode && profile.sync_mode !== "Disabled"
      ? "synced"
      : "disabled");

  switch (status) {
    case "syncing":
      return {
        color: "bg-warning",
        tooltip: t("profileTable.syncTooltipSyncing"),
        animate: true,
        encrypted,
      };
    case "waiting":
      return {
        color: "bg-warning",
        tooltip: t("profileTable.syncTooltipCloseToSync"),
        animate: false,
        encrypted,
      };
    case "synced":
      return {
        color: "bg-success",
        tooltip: profile.last_sync
          ? t("profileTable.syncTooltipSyncedAt", {
              time: new Date(profile.last_sync * 1000).toLocaleString(),
            })
          : t("profileTable.syncTooltipSynced"),
        animate: false,
        encrypted,
      };
    case "error":
      return {
        color: "bg-destructive",
        tooltip: errorMessage
          ? t("profileTable.syncTooltipErrorWith", { error: errorMessage })
          : t("profileTable.syncTooltipError"),
        animate: false,
        encrypted,
      };
    case "disabled":
      if (profile.last_sync) {
        return {
          color: "bg-muted-foreground",
          tooltip: t("profileTable.syncTooltipDisabledWithLast", {
            time: formatRelativeTime(profile.last_sync),
          }),
          animate: false,
          encrypted: false,
        };
      }
      return null;
    default:
      return null;
  }
}

// Inline extension-group dropdown for the Ext column. Matches the
// proxy column's Popover-style picker — no nested dialog.
function ExtCell({
  profile,
  meta,
}: {
  profile: BrowserProfile;
  meta: TableMeta;
}) {
  const [open, setOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const groupId = profile.extension_group_id ?? null;
  const group = groupId
    ? meta.extensionGroups.find((g) => g.id === groupId)
    : undefined;
  const label = group?.name ?? meta.t("profiles.table.extDefault");

  const onPick = async (nextId: string | null) => {
    setIsSaving(true);
    try {
      await invoke("assign_extension_group_to_profile", {
        profileId: profile.id,
        extensionGroupId: nextId,
      });
    } catch (err) {
      console.error("Failed to assign extension group:", err);
    } finally {
      setIsSaving(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isSaving}
          className="flex items-center gap-1.5 h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded transition-colors duration-100 w-full text-left disabled:opacity-50"
        >
          <LuPuzzle className="size-3 shrink-0" />
          <span className="truncate flex-1" title={label}>
            {label}
          </span>
          <LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={meta.t("profiles.table.extSearch")} />
          <CommandList>
            <CommandEmpty>{meta.t("profiles.table.extEmpty")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__default__"
                onSelect={() => {
                  void onPick(null);
                }}
              >
                {groupId === null && <LuCheck className="mr-2 size-3.5" />}
                <span className={groupId === null ? "" : "ml-5"}>
                  {meta.t("profiles.table.extDefault")}
                </span>
              </CommandItem>
              {meta.extensionGroups.map((g) => (
                <CommandItem
                  key={g.id}
                  value={g.name}
                  onSelect={() => {
                    void onPick(g.id);
                  }}
                >
                  {groupId === g.id && <LuCheck className="mr-2 size-3.5" />}
                  <span className={groupId === g.id ? "" : "ml-5"}>
                    {g.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const NonHoverableTooltip = React.memo<{
  children: React.ReactNode;
  content: React.ReactNode;
  sideOffset?: number;
  alignOffset?: number;
  horizontalOffset?: number;
}>(
  ({
    children,
    content,
    sideOffset = 4,
    alignOffset = 0,
    horizontalOffset = 0,
  }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger
          asChild
          onMouseEnter={() => {
            setIsOpen(true);
          }}
          onMouseLeave={() => {
            setIsOpen(false);
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          arrowOffset={horizontalOffset}
          onPointerEnter={(e) => {
            e.preventDefault();
          }}
          onPointerLeave={() => {
            setIsOpen(false);
          }}
          className="pointer-events-none"
          style={
            horizontalOffset !== 0
              ? { transform: `translateX(${horizontalOffset}px)` }
              : undefined
          }
        >
          {content}
        </TooltipContent>
      </Tooltip>
    );
  },
);

NonHoverableTooltip.displayName = "NonHoverableTooltip";

const NoteCell = React.memo<{
  profile: BrowserProfile;
  isDisabled: boolean;
  noteOverrides: Record<string, string | null>;
  openNoteEditorFor: string | null;
  setOpenNoteEditorFor: React.Dispatch<React.SetStateAction<string | null>>;
  setNoteOverrides: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
}>(
  ({
    profile,
    isDisabled,
    noteOverrides,
    openNoteEditorFor,
    setOpenNoteEditorFor,
    setNoteOverrides,
  }) => {
    const { t } = useTranslation();
    const effectiveNote: string | null = Object.hasOwn(
      noteOverrides,
      profile.id,
    )
      ? noteOverrides[profile.id]
      : (profile.note ?? null);

    const onNoteChange = React.useCallback(
      async (newNote: string | null) => {
        const trimmedNote = newNote?.trim() ?? null;
        setNoteOverrides((prev) => ({ ...prev, [profile.id]: trimmedNote }));
        try {
          await invoke<BrowserProfile>("update_profile_note", {
            profileId: profile.id,
            note: trimmedNote,
          });
        } catch (error) {
          console.error("Failed to update note:", error);
        }
      },
      [profile.id, setNoteOverrides],
    );

    const editorRef = React.useRef<HTMLDivElement | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [noteValue, setNoteValue] = React.useState(effectiveNote ?? "");

    // Update local state when effective note changes (from outside)
    React.useEffect(() => {
      if (openNoteEditorFor !== profile.id) {
        setNoteValue(effectiveNote ?? "");
      }
    }, [effectiveNote, openNoteEditorFor, profile.id]);

    // Auto-resize textarea on open
    React.useEffect(() => {
      if (openNoteEditorFor === profile.id && textareaRef.current) {
        const textarea = textareaRef.current;
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      }
    }, [openNoteEditorFor, profile.id]);

    const handleTextareaChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setNoteValue(newValue);
        // Auto-resize
        const textarea = e.target;
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      },
      [],
    );

    React.useEffect(() => {
      if (openNoteEditorFor !== profile.id) return;
      const handleClick = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (
          editorRef.current &&
          target &&
          !editorRef.current.contains(target)
        ) {
          const currentValue = textareaRef.current?.value ?? "";
          void onNoteChange(currentValue);
          setOpenNoteEditorFor(null);
        }
      };
      document.addEventListener("mousedown", handleClick);
      return () => {
        document.removeEventListener("mousedown", handleClick);
      };
    }, [openNoteEditorFor, profile.id, setOpenNoteEditorFor, onNoteChange]);

    React.useEffect(() => {
      if (openNoteEditorFor === profile.id && textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, [openNoteEditorFor, profile.id]);

    const displayNote = effectiveNote ?? "";
    const showTooltip = displayNote.length > 0;

    if (openNoteEditorFor !== profile.id) {
      return (
        <div className="w-full min-h-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                className={cn(
                  "flex items-center px-2 py-1 min-h-6 w-full min-w-0 bg-transparent rounded border-none text-left",
                  isDisabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer hover:bg-accent/50",
                )}
                onDoubleClick={() => {
                  if (!isDisabled) {
                    setNoteValue(effectiveNote ?? "");
                    setOpenNoteEditorFor(profile.id);
                  }
                }}
              >
                <span
                  className={cn(
                    "text-sm truncate block w-full",
                    !effectiveNote && "text-muted-foreground",
                  )}
                >
                  {effectiveNote ? displayNote : t("profiles.note.empty")}
                </span>
              </div>
            </TooltipTrigger>
            {showTooltip && (
              <TooltipContent className="max-w-[320px]">
                <p className="whitespace-pre-wrap wrap-break-word">
                  {effectiveNote ?? t("profiles.note.empty")}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "w-full relative",
          isDisabled && "opacity-60 pointer-events-none",
        )}
      >
        <div
          ref={editorRef}
          className="absolute -top-[15px] -left-px z-50 w-60 min-h-6 bg-popover rounded-md shadow-md border"
        >
          <textarea
            ref={textareaRef}
            value={noteValue}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNoteValue(effectiveNote ?? "");
                setOpenNoteEditorFor(null);
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void onNoteChange(noteValue);
                setOpenNoteEditorFor(null);
              }
            }}
            onBlur={() => {
              void onNoteChange(noteValue);
              setOpenNoteEditorFor(null);
            }}
            placeholder={t("profiles.note.placeholder")}
            className="w-full min-h-6 max-h-[200px] px-2 py-1 text-sm bg-transparent border-0 resize-none focus:outline-none focus:ring-0"
            style={{
              overflow: "auto",
            }}
            rows={1}
          />
        </div>
      </div>
    );
  },
);

NoteCell.displayName = "NoteCell";

function isRowSelectionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !target.closest(
    "button,input,textarea,select,a,[data-row-click-ignore]",
  );
}

interface ProfilesDataTableProps {
  profiles: BrowserProfile[];
  onLaunchProfile: (profile: BrowserProfile) => void | Promise<void>;
  onKillProfile: (profile: BrowserProfile) => void | Promise<void>;
  onCloneProfile: (profile: BrowserProfile) => void | Promise<void>;
  onDeleteProfile: (profile: BrowserProfile) => void | Promise<void>;
  onRenameProfile: (profileId: string, newName: string) => Promise<void>;
  onConfigureCamoufox: (profile: BrowserProfile) => void;
  onCopyCookiesToProfile?: (profile: BrowserProfile) => void;
  onOpenCookieManagement?: (profile: BrowserProfile) => void;
  runningProfiles: Set<string>;
  isUpdating: (browser: string) => boolean;
  onDeleteSelectedProfiles: (profileIds: string[]) => Promise<void>;
  onAssignProfilesToGroup: (profileIds: string[]) => void;
  selectedGroupId: string | null;
  selectedProfiles: string[];
  onSelectedProfilesChange: Dispatch<SetStateAction<string[]>>;
  onBulkDelete?: () => void;
  onBulkGroupAssignment?: () => void;
  onBulkProxyAssignment?: () => void;
  onBulkCopySelectedNames?: () => void;
  onBulkCopyCookies?: () => void;
  onBulkExtensionGroupAssignment?: () => void;
  onBulkProxyPasteAssignment?: () => void;
  onAssignExtensionGroup?: (profileIds: string[]) => void;
  onOpenProfileSyncDialog?: (profile: BrowserProfile) => void;
  onToggleProfileSync?: (profile: BrowserProfile) => void;
  crossOsUnlocked?: boolean;
  syncUnlocked?: boolean;
  getProfileSyncInfo?: (profileId: string) =>
    | {
        session: SyncSessionInfo;
        isLeader: boolean;
        failedAtUrl: string | null;
      }
    | undefined;
  onLaunchWithSync?: (profile: BrowserProfile) => void;
  onSetPassword?: (profile: BrowserProfile) => void;
  onChangePassword?: (profile: BrowserProfile) => void;
  onRemovePassword?: (profile: BrowserProfile) => void;
  /**
   * When provided, the info dialog is controlled by the parent. Allows the
   * command palette in page.tsx to open the dialog directly without lifting
   * every other piece of internal table state.
   */
  infoDialogProfile?: BrowserProfile | null;
  onInfoDialogProfileChange?: (profile: BrowserProfile | null) => void;
}

export function ProfilesDataTable({
  profiles,
  onLaunchProfile,
  onKillProfile,
  onCloneProfile,
  onDeleteProfile,
  onRenameProfile,
  onConfigureCamoufox,
  onCopyCookiesToProfile,
  onOpenCookieManagement,
  runningProfiles,
  isUpdating,
  onAssignProfilesToGroup,
  selectedProfiles,
  onSelectedProfilesChange,
  onBulkDelete,
  onBulkGroupAssignment,
  onBulkProxyAssignment,
  onBulkProxyPasteAssignment,
  onBulkCopySelectedNames,
  onBulkCopyCookies,
  onBulkExtensionGroupAssignment,
  onAssignExtensionGroup,
  onOpenProfileSyncDialog,
  onToggleProfileSync,
  crossOsUnlocked = false,
  syncUnlocked = false,
  getProfileSyncInfo,
  onLaunchWithSync,
  onSetPassword,
  onChangePassword,
  onRemovePassword,
  infoDialogProfile,
  onInfoDialogProfileChange,
}: ProfilesDataTableProps) {
  const { t } = useTranslation();
  const { getTableSorting, updateSorting, isLoaded } = useTableSorting();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [_columnVisibility, _setColumnVisibility] =
    React.useState<VisibilityState>({ created_at: false });

  // Sync external selectedProfiles with table's row selection state
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const prevSelectedProfilesRef = React.useRef<string[]>(selectedProfiles);

  // Update row selection when external selectedProfiles changes
  React.useEffect(() => {
    // Only update if selectedProfiles actually changed
    if (
      prevSelectedProfilesRef.current.length !== selectedProfiles.length ||
      !prevSelectedProfilesRef.current.every((id) =>
        selectedProfiles.includes(id),
      )
    ) {
      const newSelection: RowSelectionState = {};
      for (const profileId of selectedProfiles) {
        newSelection[profileId] = true;
      }
      setRowSelection(newSelection);
      prevSelectedProfilesRef.current = selectedProfiles;
    }
  }, [selectedProfiles]);

  // Update external selectedProfiles when table selection changes
  const handleRowSelectionChange = React.useCallback(
    (updater: React.SetStateAction<RowSelectionState>) => {
      setRowSelection((prevSelection) => {
        const newSelection =
          typeof updater === "function" ? updater(prevSelection) : updater;

        const selectedIds = Object.keys(newSelection).filter(
          (id) => newSelection[id],
        );

        // Only update external state if selection actually changed
        const prevIds = Object.keys(prevSelection).filter(
          (id) => prevSelection[id],
        );

        if (
          selectedIds.length !== prevIds.length ||
          !selectedIds.every((id) => prevIds.includes(id))
        ) {
          onSelectedProfilesChange(selectedIds);
        }

        return newSelection;
      });
    },
    [onSelectedProfilesChange],
  );
  const [profileToRename, setProfileToRename] =
    React.useState<BrowserProfile | null>(null);
  const [newProfileName, setNewProfileName] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [isRenamingSaving, setIsRenamingSaving] = React.useState(false);
  const renameContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [profileToDelete, setProfileToDelete] =
    React.useState<BrowserProfile | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [internalInfoDialogProfile, setInternalInfoDialogProfile] =
    React.useState<BrowserProfile | null>(null);
  const isInfoDialogControlled = onInfoDialogProfileChange !== undefined;
  const profileForInfoDialog = isInfoDialogControlled
    ? (infoDialogProfile ?? null)
    : internalInfoDialogProfile;
  const setProfileForInfoDialog = React.useCallback(
    (p: BrowserProfile | null) => {
      if (isInfoDialogControlled) {
        onInfoDialogProfileChange?.(p);
      } else {
        setInternalInfoDialogProfile(p);
      }
    },
    [isInfoDialogControlled, onInfoDialogProfileChange],
  );
  const [bypassRulesProfile, setBypassRulesProfile] =
    React.useState<BrowserProfile | null>(null);
  const [launchHookProfile, setLaunchHookProfile] =
    React.useState<BrowserProfile | null>(null);
  const [launchingProfiles, setLaunchingProfiles] = React.useState<Set<string>>(
    new Set(),
  );
  const [stoppingProfiles, setStoppingProfiles] = React.useState<Set<string>>(
    new Set(),
  );

  const vpnConfigs = React.useMemo(() => [] as any[], []);
  const { isProfileLocked, getLockInfo } = useTeamLocks(undefined);

  const [proxyOverrides, setProxyOverrides] = React.useState<
    Record<string, string | null>
  >({});
  const [vpnOverrides, setVpnOverrides] = React.useState<
    Record<string, string | null>
  >({});
  const [noteOverrides, setNoteOverrides] = React.useState<
    Record<string, string | null>
  >({});
  const [openNoteEditorFor, setOpenNoteEditorFor] = React.useState<
    string | null
  >(null);
  const [trafficSnapshots, setTrafficSnapshots] = React.useState<
    Record<string, TrafficSnapshot>
  >({});
  const [trafficDialogProfile, setTrafficDialogProfile] = React.useState<{
    id: string;
    name?: string;
  } | null>(null);
  const [syncStatuses, setSyncStatuses] = React.useState<
    Record<string, { status: string; error?: string }>
  >({});

  // ── Drag selection refs (declared early — assigned after table init) ────
  const dragSession = React.useRef<{
    active: boolean;
    mode: "add" | "remove" | "replace";
    anchorIndex: number;
    lastIndex: number;
    didDrag: boolean;
    startX: number;
    startY: number;
    baseSelection: string[];
  }>({
    active: false,
    mode: "add",
    anchorIndex: -1,
    lastIndex: -1,
    didDrag: false,
    startX: 0,
    startY: 0,
    baseSelection: [],
  });
  const autoScrollRaf = React.useRef<number | null>(null);
  const lastPointerCoords = React.useRef<{ x: number; y: number } | null>(null);
  const idToIndexRef = React.useRef<Record<string, number>>({});
  const selectedProfilesRef = React.useRef<string[]>(selectedProfiles);
  const sortedRowsRef = React.useRef<any[]>([]);
  const scrollParentRefForDrag = React.useRef<HTMLDivElement | null>(null);
  const suppressClickRef = React.useRef(false);
  const selectionAnchorIdRef = React.useRef<string | null>(null);
  // Stable refs so document listeners always call latest handlers
  const onDragMoveRef = React.useRef<(e: PointerEvent) => void>(() => {});
  const onDragEndRef = React.useRef<(e: PointerEvent) => void>(() => {});

  // Extension groups for the Ext column lookup.
  const [extensionGroups, setExtensionGroups] = React.useState<
    ExtensionGroup[]
  >([]);

  React.useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    const load = async () => {
      try {
        const data = await invoke<ExtensionGroup[]>("list_extension_groups");
        if (mounted) setExtensionGroups(data);
      } catch (e) {
        console.error("Failed to load extension groups:", e);
      }
    };
    void load();
    void listen("extensions-changed", () => {
      void load();
    }).then((u) => {
      if (mounted) unlisten = u;
      else u();
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const handleVpnSelection = React.useCallback(
    async (profileId: string, vpnId: string | null) => {
      try {
        await invoke("update_profile_vpn", {
          profileId,
          vpnId,
        });
        setVpnOverrides((prev) => ({ ...prev, [profileId]: vpnId }));
        setProxyOverrides((prev) => ({ ...prev, [profileId]: null }));
        await emit("profile-updated");
      } catch (error) {
        console.error("Failed to update VPN settings:", error);
      }
    },
    [],
  );

  // Country proxy creation removed — profiles now use inline proxy strings.
  // Use shared browser state hook
  const browserState = useBrowserState(
    profiles,
    runningProfiles,
    isUpdating,
    launchingProfiles,
    stoppingProfiles,
  );

  // Listen for sync status events
  React.useEffect(() => {
    if (!browserState.isClient) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<{
          profile_id: string;
          status: string;
          error?: string;
        }>("profile-sync-status", (event) => {
          const { profile_id, status, error } = event.payload;
          setSyncStatuses((prev) => ({
            ...prev,
            [profile_id]: { status, error },
          }));
        });
      } catch (error) {
        console.error("Failed to listen for sync status events:", error);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [browserState.isClient]);

  // Fetch traffic snapshots for running profiles (lightweight, real-time data)
  // Convert Set to sorted array to avoid Set reference comparison issues in dependencies
  const runningProfileIds = React.useMemo(
    () => Array.from(runningProfiles).sort(),
    [runningProfiles],
  );
  const runningCount = runningProfileIds.length;
  React.useEffect(() => {
    if (!browserState.isClient) return;

    if (runningCount === 0) {
      setTrafficSnapshots({});
      return;
    }

    const fetchTrafficSnapshots = async () => {
      try {
        const allSnapshots = await invoke<TrafficSnapshot[]>(
          "get_all_traffic_snapshots",
        );
        const newSnapshots: Record<string, TrafficSnapshot> = {};
        for (const snapshot of allSnapshots) {
          if (snapshot.profile_id) {
            // Only keep snapshots for profiles that are currently running
            if (runningProfileIds.includes(snapshot.profile_id)) {
              const existing = newSnapshots[snapshot.profile_id];
              if (!existing || snapshot.last_update > existing.last_update) {
                newSnapshots[snapshot.profile_id] = snapshot;
              }
            }
          }
        }
        setTrafficSnapshots(newSnapshots);
      } catch (error) {
        console.error("Failed to fetch traffic snapshots:", error);
      }
    };

    void fetchTrafficSnapshots();
    const interval = setInterval(() => {
      void fetchTrafficSnapshots();
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [browserState.isClient, runningCount, runningProfileIds]);

  // Clean up snapshots for profiles that are no longer running
  React.useEffect(() => {
    if (!browserState.isClient) return;

    setTrafficSnapshots((prev) => {
      const cleaned: Record<string, TrafficSnapshot> = {};
      for (const [profileId, snapshot] of Object.entries(prev)) {
        // Only keep snapshots for profiles that are currently running
        if (runningProfileIds.includes(profileId)) {
          cleaned[profileId] = snapshot;
        }
      }
      // Only update if something was removed
      if (Object.keys(cleaned).length !== Object.keys(prev).length) {
        return cleaned;
      }
      return prev;
    });
  }, [browserState.isClient, runningProfileIds]);

  // Clear launching/stopping spinners when backend reports running status changes
  React.useEffect(() => {
    if (!browserState.isClient) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<{ id: string; is_running: boolean }>(
          "profile-running-changed",
          (event) => {
            const { id } = event.payload;
            // Clear launching state for this profile if present
            setLaunchingProfiles((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            // Clear stopping state for this profile if present
            setStoppingProfiles((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          },
        );
      } catch (error) {
        console.error("Failed to listen for profile running changes:", error);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [browserState.isClient]);

  // Stored proxy events removed — profiles carry proxy inline.

  // Automatically deselect profiles that become running, updating, launching, or stopping
  React.useEffect(() => {
    const newSet = new Set(selectedProfiles);
    let hasChanges = false;

    for (const profileId of selectedProfiles) {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        const isRunning =
          browserState.isClient && runningProfiles.has(profile.id);
        const isLaunching = launchingProfiles.has(profile.id);
        const isStopping = stoppingProfiles.has(profile.id);

        if (isRunning || isLaunching || isStopping) {
          newSet.delete(profileId);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      onSelectedProfilesChange(Array.from(newSet));
    }
  }, [
    profiles,
    runningProfiles,
    launchingProfiles,
    stoppingProfiles,
    browserState.isClient,
    onSelectedProfilesChange,
    selectedProfiles,
  ]);

  // Update local sorting state when settings are loaded
  React.useEffect(() => {
    if (isLoaded && browserState.isClient) {
      setSorting(getTableSorting());
    }
  }, [isLoaded, getTableSorting, browserState.isClient]);

  // Handle sorting changes
  const handleSortingChange = React.useCallback(
    (updater: React.SetStateAction<SortingState>) => {
      if (!browserState.isClient) return;
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(newSorting);
      updateSorting(newSorting);
    },
    [browserState.isClient, sorting, updateSorting],
  );

  const handleRename = React.useCallback(async () => {
    if (!profileToRename || !newProfileName.trim()) return;

    try {
      setIsRenamingSaving(true);
      await onRenameProfile(profileToRename.id, newProfileName.trim());
      setProfileToRename(null);
      setNewProfileName("");
      setRenameError(null);
    } catch (error) {
      setRenameError(
        error instanceof Error
          ? error.message
          : t("errors.renameProfileFailed", { error: String(error) }),
      );
    } finally {
      setIsRenamingSaving(false);
    }
  }, [profileToRename, newProfileName, onRenameProfile, t]);

  // Cancel inline rename on outside click
  React.useEffect(() => {
    if (!profileToRename) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        renameContainerRef.current &&
        !renameContainerRef.current.contains(target)
      ) {
        setProfileToRename(null);
        setNewProfileName("");
        setRenameError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileToRename]);

  const handleDelete = async () => {
    if (!profileToDelete) return;

    setIsDeleting(true);
    // Minimum loading time for visual feedback
    const minLoadingTime = new Promise((r) => setTimeout(r, 300));
    try {
      await Promise.all([onDeleteProfile(profileToDelete), minLoadingTime]);
      setProfileToDelete(null);
    } catch (error) {
      console.error("Failed to delete profile:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getSelectableRangeIds = React.useCallback(
    (fromId: string, toId: string) => {
      const rows = sortedRowsRef.current;
      const fromIndex = idToIndexRef.current[fromId];
      const toIndex = idToIndexRef.current[toId];
      if (fromIndex < 0 || toIndex < 0) return [];

      const lo = Math.min(fromIndex, toIndex);
      const hi = Math.max(fromIndex, toIndex);
      const ids: string[] = [];
      for (let i = lo; i <= hi; i++) {
        const profile = rows[i]?.original as BrowserProfile | undefined;
        if (profile && browserState.canSelectProfile(profile)) {
          ids.push(profile.id);
        }
      }
      return ids;
    },
    [browserState],
  );

  const applySelection = React.useCallback(
    (ids: string[]) => {
      onSelectedProfilesChange(ids);
    },
    [onSelectedProfilesChange],
  );

  const selectProfileLikeExcel = React.useCallback(
    (
      profile: BrowserProfile,
      event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">,
    ) => {
      if (!browserState.canSelectProfile(profile)) return;

      const useToggle = event.ctrlKey || event.metaKey;
      const useRange = event.shiftKey;
      const current = selectedProfilesRef.current;
      let next: string[];

      if (useRange) {
        const anchorId =
          selectionAnchorIdRef.current ?? current[0] ?? profile.id;
        const rangeIds = getSelectableRangeIds(anchorId, profile.id);
        if (useToggle) {
          const set = new Set(current);
          const allRangeSelected = rangeIds.every((id) => set.has(id));
          for (const id of rangeIds) {
            if (allRangeSelected) set.delete(id);
            else set.add(id);
          }
          next = Array.from(set);
        } else {
          next = rangeIds;
        }
      } else if (useToggle) {
        const set = new Set(current);
        if (set.has(profile.id)) set.delete(profile.id);
        else set.add(profile.id);
        next = Array.from(set);
        selectionAnchorIdRef.current = profile.id;
      } else {
        next = [profile.id];
        selectionAnchorIdRef.current = profile.id;
      }

      applySelection(next);
    },
    [applySelection, browserState, getSelectableRangeIds],
  );

  // ── Drag selection helpers ──────────────────────────────────────────────
  // Uses refs for sortedRows and scrollParent to avoid TDZ; these refs are
  // synced after table init in the render section above.

  const applyDragRange = React.useCallback(
    (currentIndex: number) => {
      const session = dragSession.current;
      if (session.lastIndex === currentIndex) return;
      session.lastIndex = currentIndex;

      const lo = Math.min(session.anchorIndex, currentIndex);
      const hi = Math.max(session.anchorIndex, currentIndex);

      const rows = sortedRowsRef.current;
      const ids: string[] = [];
      for (let i = lo; i <= hi; i++) {
        const row = rows[i];
        if (!row) continue;
        const profile = row.original;
        if (browserState.canSelectProfile(profile)) {
          ids.push(profile.id);
        }
      }

      const newSet = new Set(session.baseSelection);
      if (session.mode === "replace") {
        newSet.clear();
        for (const id of ids) newSet.add(id);
      } else if (session.mode === "add") {
        for (const id of ids) newSet.add(id);
      } else {
        for (const id of ids) newSet.delete(id);
      }

      const arr = Array.from(newSet);
      const currentSelected = selectedProfilesRef.current;
      if (
        arr.length !== currentSelected.length ||
        arr.some((id) => !currentSelected.includes(id))
      ) {
        applySelection(arr);
      }
    },
    [applySelection, browserState],
  );

  // Auto-scroll while dragging past the scroll-container edge.
  // Uses scrollParentRefForDrag which is synced in the render section.
  const startDragAutoScroll = React.useCallback(() => {
    const scrollEl = scrollParentRefForDrag.current;
    if (!scrollEl) return;

    const loop = () => {
      if (!dragSession.current.active) return;
      autoScrollRaf.current = requestAnimationFrame(loop);

      const coords = lastPointerCoords.current;
      if (!coords) return;

      const rect = scrollEl.getBoundingClientRect();
      const edgeZone = 40;
      const maxSpeed = 12;
      let delta = 0;

      const distTop = coords.y - rect.top;
      const distBottom = rect.bottom - coords.y;

      if (distTop < edgeZone && distTop >= 0) {
        delta = -maxSpeed * (1 - distTop / edgeZone);
        delta = Math.max(delta, -maxSpeed);
      } else if (distBottom < edgeZone && distBottom >= 0) {
        delta = maxSpeed * (1 - distBottom / edgeZone);
        delta = Math.min(delta, maxSpeed);
      }

      if (delta !== 0) {
        scrollEl.scrollTop += delta;
        const el = document.elementFromPoint(coords.x, coords.y);
        if (el) {
          const rowEl = el.closest("[data-profile-id]");
          if (rowEl) {
            const id = rowEl.getAttribute("data-profile-id");
            if (id) {
              const idx = idToIndexRef.current[id];
              if (idx >= 0) {
                applyDragRange(idx);
              }
            }
          }
        }
      }
    };
    autoScrollRaf.current = requestAnimationFrame(loop);
  }, [applyDragRange]);

  const stopDragAutoScroll = React.useCallback(() => {
    if (autoScrollRaf.current !== null) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  }, []);

  // ── Drag pointer event handlers ─────────────────────────────────────────

  const handleSelectPointerDown = React.useCallback(
    (e: React.PointerEvent, profile: BrowserProfile) => {
      if (e.button !== 0) return;
      if (e.altKey) return;
      if (!isRowSelectionTarget(e.target)) return;
      if (!browserState.canSelectProfile(profile)) return;

      const idx = idToIndexRef.current[profile.id];
      if (idx < 0) return;

      suppressClickRef.current = false;

      const current = selectedProfilesRef.current;
      const anchorId = e.shiftKey
        ? (selectionAnchorIdRef.current ?? current[0] ?? profile.id)
        : profile.id;
      const anchorIndex = idToIndexRef.current[anchorId] ?? idx;
      const isToggleDrag = e.ctrlKey || e.metaKey;
      const isSelected = current.includes(profile.id);

      const session = dragSession.current;
      session.active = true;
      session.didDrag = false;
      session.anchorIndex = anchorIndex >= 0 ? anchorIndex : idx;
      session.lastIndex = -1;
      session.mode = e.shiftKey
        ? isToggleDrag && isSelected
          ? "remove"
          : isToggleDrag
            ? "add"
            : "replace"
        : isToggleDrag && isSelected
          ? "remove"
          : isToggleDrag
            ? "add"
            : "replace";
      session.startX = e.clientX;
      session.startY = e.clientY;
      session.baseSelection = e.shiftKey || isToggleDrag ? current : [];

      lastPointerCoords.current = { x: e.clientX, y: e.clientY };
    },
    [browserState],
  );

  const handleRowClick = React.useCallback(
    (e: React.MouseEvent, profile: BrowserProfile) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (!isRowSelectionTarget(e.target)) return;
      selectProfileLikeExcel(profile, e.nativeEvent);
    },
    [selectProfileLikeExcel],
  );

  // These are called by stable document listeners (wired via onDragMoveRef /
  // onDragEndRef) so they must avoid stale closures by reading from refs.
  const _endDrag = React.useCallback(() => {
    const session = dragSession.current;
    if (!session.active) return;
    if (session.didDrag) {
      suppressClickRef.current = true;
      // Schedule clear of the suppress flag after the click has been
      // consumed (or on the next animation frame if no click fires).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          suppressClickRef.current = false;
        });
      });
    }
    session.active = false;
    stopDragAutoScroll();
  }, [stopDragAutoScroll]);

  const _onDragPointerMove = React.useCallback(
    (e: PointerEvent) => {
      const session = dragSession.current;
      if (!session.active) return;

      lastPointerCoords.current = { x: e.clientX, y: e.clientY };

      // Movement threshold before drag activates (4px)
      if (!session.didDrag) {
        const dx = e.clientX - session.startX;
        const dy = e.clientY - session.startY;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

        session.didDrag = true;
        startDragAutoScroll();

        // Apply the anchor row as well — in case the user started on
        // a selected row (remove mode) the anchor also becomes part of
        // the range.
        applyDragRange(session.anchorIndex);
      }

      // Resolve row from pointer position
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el) {
        const rowEl = el.closest("[data-profile-id]");
        if (rowEl) {
          const id = rowEl.getAttribute("data-profile-id");
          if (id) {
            const idx = idToIndexRef.current[id];
            if (idx >= 0) {
              applyDragRange(idx);
            }
          }
        }
      }
    },
    [startDragAutoScroll, applyDragRange],
  );

  // Stable refs keep current selection for drag math.
  React.useEffect(() => {
    selectedProfilesRef.current = selectedProfiles;
  });

  // Stable document-level listeners for pointer move/up during drag.
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragSession.current.active) return;
      e.preventDefault();
      onDragMoveRef.current(e);
    };
    const onEnd = (e: PointerEvent) => {
      if (!dragSession.current.active) return;
      e.preventDefault();
      onDragEndRef.current(e);
    };
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onEnd, { passive: false });
    document.addEventListener("pointercancel", onEnd, { passive: false });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };
  }, []);

  // Build table meta from volatile state so columns can stay stable
  const tableMeta = React.useMemo<TableMeta>(
    () => ({
      t,
      selectedProfiles,
      isClient: browserState.isClient,
      runningProfiles,
      launchingProfiles,
      stoppingProfiles,
      isUpdating,
      browserState,

      // Note editor state
      noteOverrides,
      openNoteEditorFor,
      setOpenNoteEditorFor,
      setNoteOverrides,

      // Proxy overrides for optimistic UI
      proxyOverrides,

      // VPN selector state
      vpnConfigs,
      vpnOverrides,
      handleVpnSelection,

      // Extension groups
      extensionGroups,
      onAssignExtensionGroup,

      // Selection helpers
      isProfileSelected: (id: string) => selectedProfiles.includes(id),
      handleSelectPointerDown,

      // Rename helpers
      handleRename,
      setProfileToRename,
      setNewProfileName,
      setRenameError,
      profileToRename,
      newProfileName,
      isRenamingSaving,
      renameError,

      // Launch/stop helpers
      setLaunchingProfiles,
      setStoppingProfiles,
      onKillProfile,
      onLaunchProfile,

      // Overflow actions
      onAssignProfilesToGroup,
      onCloneProfile: onCloneProfile
        ? (profile: BrowserProfile) => {
            void onCloneProfile(profile);
          }
        : undefined,
      onConfigureCamoufox,
      onCopyCookiesToProfile,
      onOpenCookieManagement,

      // Traffic snapshots (lightweight real-time data)
      trafficSnapshots,
      onOpenTrafficDialog: (profileId: string) => {
        const profile = profiles.find((p) => p.id === profileId);
        setTrafficDialogProfile({ id: profileId, name: profile?.name });
      },

      // Sync
      syncStatuses,
      onOpenProfileSyncDialog,
      onToggleProfileSync,
      crossOsUnlocked,
      syncUnlocked,

      // Team locks
      isProfileLockedByAnother: isProfileLocked,
      getProfileLockEmail: (profileId: string) =>
        getLockInfo(profileId)?.lockedByEmail,

      // Synchronizer
      getProfileSyncInfo: getProfileSyncInfo ?? (() => undefined),
      onLaunchWithSync:
        onLaunchWithSync ??
        (() => {
          /* empty */
        }),
    }),
    [
      t,
      selectedProfiles,
      browserState.isClient,
      runningProfiles,
      launchingProfiles,
      stoppingProfiles,
      isUpdating,
      browserState,
      noteOverrides,
      openNoteEditorFor,
      proxyOverrides,
      vpnConfigs,
      vpnOverrides,
      handleVpnSelection,
      extensionGroups,
      onAssignExtensionGroup,
      handleSelectPointerDown,
      handleRename,
      profileToRename,
      newProfileName,
      isRenamingSaving,
      trafficSnapshots,
      profiles,
      renameError,
      onKillProfile,
      onLaunchProfile,
      onAssignProfilesToGroup,
      onCloneProfile,
      onConfigureCamoufox,
      onCopyCookiesToProfile,
      onOpenCookieManagement,
      syncStatuses,
      onOpenProfileSyncDialog,
      onToggleProfileSync,
      crossOsUnlocked,
      syncUnlocked,
      isProfileLocked,
      getLockInfo,
      getProfileSyncInfo,
      onLaunchWithSync,
    ],
  );

  const columns: ColumnDef<BrowserProfile>[] = React.useMemo(
    () => [
      {
        id: "actions",
        size: 48,
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original;
          const isRunning =
            meta.isClient && meta.runningProfiles.has(profile.id);
          const isLaunching = meta.launchingProfiles.has(profile.id);
          const isStopping = meta.stoppingProfiles.has(profile.id);
          const isLockedByAnother = meta.isProfileLockedByAnother(profile.id);
          const isSyncing = meta.syncStatuses[profile.id]?.status === "syncing";
          const canLaunch =
            meta.browserState.canLaunchProfile(profile) &&
            !isLockedByAnother &&
            !isSyncing;
          const lockEmail = meta.getProfileLockEmail(profile.id);
          const tooltipContent = isLockedByAnother
            ? meta.t("sync.team.cannotLaunchLocked", { email: lockEmail })
            : meta.browserState.getLaunchTooltipContent(profile);

          const handleProfileStop = async (profile: BrowserProfile) => {
            meta.setStoppingProfiles((prev: Set<string>) =>
              new Set(prev).add(profile.id),
            );
            try {
              await meta.onKillProfile(profile);
            } catch (error) {
              meta.setStoppingProfiles((prev: Set<string>) => {
                const next = new Set(prev);
                next.delete(profile.id);
                return next;
              });
              throw error;
            }
          };

          const handleProfileLaunch = async (profile: BrowserProfile) => {
            meta.setLaunchingProfiles((prev: Set<string>) =>
              new Set(prev).add(profile.id),
            );
            try {
              await meta.onLaunchProfile(profile);
            } finally {
              // Always clear launching state — the running state is tracked
              // separately via profile-running-changed events
              meta.setLaunchingProfiles((prev: Set<string>) => {
                const next = new Set(prev);
                next.delete(profile.id);
                return next;
              });
            }
          };

          const syncInfo = meta.getProfileSyncInfo(profile.id);
          const isLeader = syncInfo?.isLeader === true;
          const isFollower = syncInfo?.isLeader === false;
          const isDesynced = isFollower && syncInfo.failedAtUrl != null;
          const stopTooltip = isLeader
            ? meta.t("profiles.synchronizer.stopLeader")
            : isFollower
              ? meta.t("profiles.synchronizer.stopFollower", {
                  leaderName: syncInfo.session.leader_profile_name ?? "",
                })
              : tooltipContent;

          const handleStop = async () => {
            if (isLeader && syncInfo) {
              // Stop leader: invoke stop_sync_session which kills leader + all followers
              try {
                await invoke("stop_sync_session", {
                  sessionId: syncInfo.session.id,
                });
              } catch (error) {
                console.error("Failed to stop sync session:", error);
              }
            } else if (isFollower && syncInfo) {
              // Stop follower: remove from session
              try {
                await invoke("remove_sync_follower", {
                  sessionId: syncInfo.session.id,
                  followerProfileId: profile.id,
                });
              } catch (error) {
                console.error("Failed to remove sync follower:", error);
              }
            } else {
              await handleProfileStop(profile);
            }
          };

          const buttonVariant = isRunning
            ? isFollower
              ? "secondary"
              : "destructive"
            : "default";

          return (
            <div className="flex gap-2 items-center">
              {isDesynced && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <LuTriangleAlert className="size-4 text-warning" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {meta.t("profiles.synchronizer.desyncedTooltip", {
                      url: syncInfo?.failedAtUrl ?? "",
                    })}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <RippleButton
                      variant={buttonVariant}
                      size="sm"
                      disabled={!canLaunch || isLaunching || isStopping}
                      aria-label={
                        isRunning
                          ? meta.t("profiles.actions.stop")
                          : meta.t("profiles.actions.launch")
                      }
                      className={cn(
                        "size-7 p-0 grid place-items-center",
                        !canLaunch && "opacity-50 cursor-not-allowed",
                        canLaunch && "cursor-pointer",
                        isFollower && "border-accent",
                        isRunning &&
                          "bg-destructive/10 text-destructive hover:bg-destructive/20",
                      )}
                      onClick={() =>
                        isRunning
                          ? void handleStop()
                          : void handleProfileLaunch(profile)
                      }
                    >
                      {isLaunching || isStopping ? (
                        <div className="size-3 rounded-full border border-current animate-spin border-t-transparent" />
                      ) : isRunning ? (
                        <LuSquare className="size-3.5 fill-current" />
                      ) : (
                        <LuPlay className="size-3.5 fill-current" />
                      )}
                    </RippleButton>
                  </span>
                </TooltipTrigger>
                {(stopTooltip || tooltipContent) && (
                  <TooltipContent>
                    {isRunning ? stopTooltip : tooltipContent}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          );
        },
      },
      {
        // Hidden, sort-only column so profiles can be sorted by creation date
        // without showing a Created column in the table (issue #454). Kept
        // hidden via columnVisibility; sorting still works on hidden columns.
        id: "created_at",
        accessorFn: (row) => row.created_at ?? 0,
        enableSorting: true,
        enableHiding: true,
        sortingFn: "basic",
        header: () => null,
        cell: () => null,
      },
      {
        accessorKey: "name",
        // The only column without a fixed width: table-fixed hands it all
        // remaining space as the window grows or shrinks.
        meta: { flexWidth: true },
        // The Name header doubles as the sort control: clicking opens a menu to
        // sort by name (A–Z / Z–A) or by creation date (newest / oldest), so
        // creation-date sorting needs no visible column.
        header: ({ table }) => {
          const meta = table.options.meta as TableMeta;
          const sort = table.getState().sorting[0];
          const isActive = (id: string, desc: boolean) =>
            sort?.id === id && !!sort.desc === desc;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="justify-start p-0 h-auto font-semibold text-left cursor-pointer"
                >
                  {meta.t("common.labels.name")}
                  {isActive("name", false) ? (
                    <LuChevronUp className="ml-2 size-4" />
                  ) : isActive("name", true) ? (
                    <LuChevronDown className="ml-2 size-4" />
                  ) : (
                    <LuChevronDown className="ml-2 size-4 opacity-50" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() =>
                    table.setSorting([{ id: "name", desc: false }])
                  }
                >
                  {isActive("name", false) && (
                    <LuCheck className="mr-2 size-3.5" />
                  )}
                  {meta.t("profiles.sort.nameAsc")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => table.setSorting([{ id: "name", desc: true }])}
                >
                  {isActive("name", true) && (
                    <LuCheck className="mr-2 size-3.5" />
                  )}
                  {meta.t("profiles.sort.nameDesc")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    table.setSorting([{ id: "created_at", desc: true }])
                  }
                >
                  {isActive("created_at", true) && (
                    <LuCheck className="mr-2 size-3.5" />
                  )}
                  {meta.t("profiles.sort.newest")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    table.setSorting([{ id: "created_at", desc: false }])
                  }
                >
                  {isActive("created_at", false) && (
                    <LuCheck className="mr-2 size-3.5" />
                  )}
                  {meta.t("profiles.sort.oldest")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: true,
        sortingFn: "alphanumeric",
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original as BrowserProfile;
          const rawName: string = row.getValue("name");
          const name = getBrowserDisplayName(rawName);
          const isEditing = meta.profileToRename?.id === profile.id;

          if (isEditing) {
            return (
              <div
                ref={renameContainerRef}
                className="overflow-visible relative"
              >
                <Input
                  autoFocus
                  value={meta.newProfileName}
                  onChange={(e) => {
                    meta.setNewProfileName(e.target.value);
                    if (meta.renameError) meta.setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
                      void meta.handleRename();
                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      void meta.handleRename();
                    } else if (e.key === "Escape") {
                      meta.setProfileToRename(null);
                      meta.setNewProfileName("");
                      meta.setRenameError(null);
                    }
                  }}
                  onBlur={() => {
                    if (
                      meta.newProfileName.trim().length > 0 &&
                      meta.newProfileName.trim() !== profile.name
                    ) {
                      void meta.handleRename();
                    } else {
                      meta.setProfileToRename(null);
                      meta.setNewProfileName("");
                      meta.setRenameError(null);
                    }
                  }}
                  className="select-text w-30 h-6 px-2 py-1 text-sm font-medium leading-none border-0 shadow-none focus-visible:ring-0"
                />
              </div>
            );
          }

          const display =
            name.length < 14 ? (
              <div className="font-medium text-left leading-none truncate">
                {name}
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="leading-none block truncate">
                    {trimName(name, 14)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{name}</TooltipContent>
              </Tooltip>
            );

          const isCrossOs = isCrossOsProfile(profile);
          const isCrossOsBlocked = isCrossOs;
          const isRunning =
            meta.isClient && meta.runningProfiles.has(profile.id);
          const isLaunching = meta.launchingProfiles.has(profile.id);
          const isStopping = meta.stoppingProfiles.has(profile.id);
          const isDisabled =
            isRunning || isLaunching || isStopping || isCrossOsBlocked;
          const lockedEmail = meta.getProfileLockEmail(profile.id);
          const isLocked = meta.isProfileLockedByAnother(profile.id);

          return (
            <div className="flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
              <div
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                className={cn(
                  "px-2 py-1 mr-auto text-left bg-transparent rounded border-none h-6 min-w-0 max-w-full overflow-hidden",
                  isDisabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer hover:bg-accent/50",
                )}
                onDoubleClick={() => {
                  if (isDisabled) return;
                  meta.setProfileToRename(profile);
                  meta.setNewProfileName(profile.name);
                  meta.setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (isDisabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    meta.setProfileToRename(profile);
                    meta.setNewProfileName(profile.name);
                    meta.setRenameError(null);
                  }
                }}
              >
                {display}
              </div>
              {isLocked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <LuLock className="size-3 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {meta.t("sync.team.profileLocked", { email: lockedEmail })}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
      },
      {
        id: "note",
        size: 80,
        header: ({ table }) => {
          const meta = table.options.meta as TableMeta;
          return meta.t("profileTable.noteHeader");
        },
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original;
          const isCrossOs = isCrossOsProfile(profile);
          const isCrossOsBlocked = isCrossOs;
          const isRunning =
            meta.isClient && meta.runningProfiles.has(profile.id);
          const isLaunching = meta.launchingProfiles.has(profile.id);
          const isStopping = meta.stoppingProfiles.has(profile.id);
          const isDisabled =
            isRunning || isLaunching || isStopping || isCrossOsBlocked;

          return (
            <NoteCell
              profile={profile}
              isDisabled={isDisabled}
              noteOverrides={meta.noteOverrides ?? {}}
              openNoteEditorFor={meta.openNoteEditorFor ?? null}
              setOpenNoteEditorFor={meta.setOpenNoteEditorFor}
              setNoteOverrides={meta.setNoteOverrides}
            />
          );
        },
      },
      {
        id: "proxy",
        size: 110,
        header: ({ table }) => {
          const meta = table.options.meta as TableMeta;
          return meta.t("profiles.table.proxy");
        },
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original;
          const isCrossOs = isCrossOsProfile(profile);
          const isCrossOsBlocked = isCrossOs;
          const isRunning =
            meta.isClient && meta.runningProfiles.has(profile.id);
          const isLaunching = meta.launchingProfiles.has(profile.id);
          const isStopping = meta.stoppingProfiles.has(profile.id);
          const isDisabled =
            isRunning || isLaunching || isStopping || isCrossOsBlocked;

          const hasProxyOverride = Object.hasOwn(
            meta.proxyOverrides,
            profile.id,
          );
          const effectiveProxyId = hasProxyOverride
            ? meta.proxyOverrides[profile.id]
            : (profile.proxy ?? null);

          const hasVpnOverride = Object.hasOwn(meta.vpnOverrides, profile.id);
          const effectiveVpnId = hasVpnOverride
            ? meta.vpnOverrides[profile.id]
            : (profile.vpn_id ?? null);
          const effectiveVpn = effectiveVpnId
            ? (meta.vpnConfigs.find((v) => v.id === effectiveVpnId) ?? null)
            : null;

          const hasAssignment = Boolean(effectiveProxyId || effectiveVpn);
          const displayName = effectiveVpn
            ? effectiveVpn.name
            : effectiveProxyId
              ? effectiveProxyId
              : meta.t("profiles.table.notSelected");
          const vpnBadge = effectiveVpn ? "WG" : null;
          const tooltipText = hasAssignment ? displayName : null;
          // When profile is running, show bandwidth chart instead of proxy selector
          if (isRunning && meta.trafficSnapshots) {
            const snapshot = meta.trafficSnapshots[profile.id];
            const bandwidthData = snapshot?.recent_bandwidth
              ? [...snapshot.recent_bandwidth]
              : [];
            const currentBandwidth =
              (snapshot?.current_bytes_sent ?? 0) +
              (snapshot?.current_bytes_received ?? 0);

            return (
              <div className="overflow-hidden min-w-0" data-row-click-ignore>
                <BandwidthMiniChart
                  key={`${profile.id}-${snapshot?.last_update ?? 0}-${bandwidthData.length}`}
                  data={bandwidthData}
                  currentBandwidth={currentBandwidth}
                  onClick={() => meta.onOpenTrafficDialog?.(profile.id)}
                />
              </div>
            );
          }

          return (
            <div className="flex overflow-hidden gap-2 items-center min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "flex gap-2 items-center px-2 py-1 rounded text-sm",
                      isDisabled
                        ? "opacity-60 cursor-not-allowed pointer-events-none"
                        : "",
                      !hasAssignment && "text-muted-foreground",
                    )}
                  >
                    {vpnBadge && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 leading-tight"
                      >
                        {vpnBadge}
                      </Badge>
                    )}
                    <span>
                      {hasAssignment ? trimName(displayName, 16) : displayName}
                    </span>
                  </span>
                </TooltipTrigger>
                {tooltipText && <TooltipContent>{tooltipText}</TooltipContent>}
              </Tooltip>
            </div>
          );
        },
      },
      {
        id: "ext",
        size: 95,
        header: ({ table }) => {
          const meta = table.options.meta as TableMeta;
          return meta.t("profiles.table.ext");
        },
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original;
          return <ExtCell profile={profile} meta={meta} />;
        },
      },
      {
        id: "sync",
        header: "",
        size: 28,
        cell: ({ row, table }) => {
          const profile = row.original;
          const meta = table.options.meta as TableMeta;
          const syncEntry = meta.syncStatuses[profile.id];
          const liveStatus = syncEntry?.status as
            | "syncing"
            | "waiting"
            | "synced"
            | "error"
            | "disabled"
            | undefined;

          const dot = getProfileSyncStatusDot(
            profile,
            liveStatus,
            meta.t,
            syncEntry?.error,
          );
          if (!dot) return null;

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex justify-center items-center h-9 w-full">
                  {dot.encrypted ? (
                    <LuLock
                      className={`size-3 ${dot.color.replace("bg-", "text-")}${dot.animate ? " animate-pulse" : ""}`}
                    />
                  ) : (
                    <span
                      className={`size-2 rounded-full ${dot.color}${dot.animate ? " animate-pulse" : ""}`}
                    />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{dot.tooltip}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "settings",
        size: 32,
        cell: ({ row, table }) => {
          const meta = table.options.meta as TableMeta;
          const profile = row.original;

          return (
            <div className="flex justify-end items-center h-9 w-full">
              <Button
                variant="ghost"
                className="p-0 size-7"
                disabled={!meta.isClient}
                onClick={() => {
                  setProfileForInfoDialog(profile);
                }}
              >
                <span className="sr-only">
                  {t("profiles.aria.profileInfo")}
                </span>
                <LuInfo className="size-4" />
              </Button>
            </div>
          );
        },
      },
      {
        id: "created_at",
        accessorFn: (row) => row.created_at ?? 0,
        enableSorting: true,
        enableHiding: true,
        sortingFn: "basic",
        header: () => null,
        cell: () => null,
      },
    ],
    [t, setProfileForInfoDialog],
  );

  // Low-priority columns leave the table as the container narrows (most
  // expendable first); their data stays reachable via the profile info
  // dialog. Visibility (not CSS hiding) so table-fixed reclaims the width.
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({ created_at: false });

  // Content columns grow proportionally with the container but never drop
  // below the compact-layout floor; the name column takes the remainder.
  // Computed in px from the observed container width because fixed table
  // layout ignores max()/calc() column widths.
  const [_containerWidth, setContainerWidth] = React.useState(0);

  const table = useReactTable({
    data: profiles,
    columns,
    state: {
      sorting,
      rowSelection,
      columnVisibility,
    },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: handleRowSelectionChange,
    enableRowSelection: (row) => {
      const profile = row.original;
      const isRunning =
        browserState.isClient && runningProfiles.has(profile.id);
      const isLaunching = launchingProfiles.has(profile.id);
      const isStopping = stoppingProfiles.has(profile.id);
      return !isRunning && !isLaunching && !isStopping;
    },
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    meta: tableMeta,
  });

  const scrollParentRef = React.useRef<HTMLDivElement | null>(null);
  const sortedRows = table.getRowModel().rows;
  useScrollFade(scrollParentRef);

  React.useEffect(() => {
    sortedRowsRef.current = sortedRows;
    idToIndexRef.current = Object.fromEntries(
      sortedRows.map((row, index) => [row.original.id, index]),
    );
    scrollParentRefForDrag.current = scrollParentRef.current;
    onDragMoveRef.current = _onDragPointerMove;
    onDragEndRef.current = _endDrag;
  }, [sortedRows, _onDragPointerMove, _endDrag]);

  React.useEffect(() => {
    const el = scrollParentRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      setContainerWidth(Math.round(w / 8) * 8);
      setColumnVisibility((prev) => {
        const next: VisibilityState = {
          // Always hidden — sort-only column (issue #454).
          created_at: false,
          ext: w >= 672,
          note: w >= 576,
        };
        return Object.keys(next).every((k) => prev[k] === next[k])
          ? prev
          : next;
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  // Compact 36px row from the redesign spec; estimateSize must match the
  // actual rendered row height or virtualizer placement drifts under scroll.
  const ROW_HEIGHT = 36;

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <>
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollParentRef}
          className="overflow-auto relative flex-1 min-h-0 scroll-fade select-none"
          style={
            {
              // Sticky table header is 32px tall (h-8); shift the top
              // fade band below it so the header stays fully opaque and
              // only body rows fade as they scroll past.
              "--scroll-fade-top-offset": "32px",
            } as React.CSSProperties
          }
        >
          <Table className="table-fixed">
            <TableHeader className="overflow-visible sticky top-0 z-10 bg-background [&_tr]:border-0">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="overflow-visible !border-0"
                >
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        style={{
                          width: header.column.columnDef.size
                            ? `${header.column.getSize()}px`
                            : undefined,
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="overflow-visible">
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    {t("profiles.table.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <tr style={{ height: `${paddingTop}px` }}>
                      <td colSpan={columns.length} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = sortedRows[virtualRow.index];
                    const rowIsCrossOs = isCrossOsProfile(row.original);
                    const crossOsTitle = rowIsCrossOs
                      ? t("crossOs.viewOnly", {
                          os: getOSDisplayName(
                            row.original.host_os ||
                              row.original.camoufox_config?.os ||
                              row.original.cloak_config?.platform ||
                              "",
                          ),
                        })
                      : undefined;
                    return (
                      <TableRow
                        key={row.id}
                        data-profile-id={row.id}
                        data-state={row.getIsSelected() && "selected"}
                        title={crossOsTitle}
                        style={{ height: `${ROW_HEIGHT}px` }}
                        onPointerDown={(e) => {
                          handleSelectPointerDown(e, row.original);
                        }}
                        onClick={(e) => {
                          handleRowClick(e, row.original);
                        }}
                        className={cn(
                          "overflow-visible hover:bg-accent/50 !border-0 cursor-default",
                          rowIsCrossOs && "opacity-60",
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="overflow-visible py-0"
                            style={{
                              width: cell.column.columnDef.size
                                ? `${cell.column.getSize()}px`
                                : undefined,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr style={{ height: `${paddingBottom}px` }}>
                      <td colSpan={columns.length} />
                    </tr>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DeleteConfirmationDialog
        isOpen={profileToDelete !== null}
        onClose={() => {
          setProfileToDelete(null);
        }}
        onConfirm={handleDelete}
        title={t("profiles.delete.title")}
        description={t("profiles.delete.description", {
          profileName: profileToDelete?.name ?? "",
        })}
        confirmButtonText={t("profiles.delete.confirmButton")}
        isLoading={isDeleting}
      />
      {profileForInfoDialog &&
        (() => {
          const infoProfile =
            profiles.find((p) => p.id === profileForInfoDialog.id) ??
            profileForInfoDialog;
          const infoIsRunning =
            browserState.isClient && runningProfiles.has(infoProfile.id);
          const infoIsLaunching = launchingProfiles.has(infoProfile.id);
          const infoIsStopping = stoppingProfiles.has(infoProfile.id);
          const infoIsCrossOs = isCrossOsProfile(infoProfile);
          const infoIsDisabled =
            infoIsRunning || infoIsLaunching || infoIsStopping || infoIsCrossOs;
          return (
            <ProfileInfoDialog
              isOpen={profileForInfoDialog !== null}
              onClose={() => {
                setProfileForInfoDialog(null);
              }}
              profile={infoProfile}
              storedProxies={[]}
              vpnConfigs={vpnConfigs}
              onOpenTrafficDialog={(profileId) => {
                const profile = profiles.find((p) => p.id === profileId);
                setTrafficDialogProfile({ id: profileId, name: profile?.name });
              }}
              onOpenProfileSyncDialog={onOpenProfileSyncDialog}
              onAssignProfilesToGroup={onAssignProfilesToGroup}
              onConfigureCamoufox={onConfigureCamoufox}
              onCopyCookiesToProfile={onCopyCookiesToProfile}
              onOpenCookieManagement={onOpenCookieManagement}
              onAssignExtensionGroup={onAssignExtensionGroup}
              onOpenBypassRules={(profile) => {
                setBypassRulesProfile(profile);
              }}
              onOpenLaunchHook={(profile) => {
                setLaunchHookProfile(profile);
              }}
              onCloneProfile={onCloneProfile}
              onLaunchWithSync={onLaunchWithSync}
              onSetPassword={onSetPassword}
              onChangePassword={onChangePassword}
              onRemovePassword={onRemovePassword}
              onDeleteProfile={(profile) => {
                setProfileForInfoDialog(null);
                setProfileToDelete(profile);
              }}
              crossOsUnlocked={crossOsUnlocked}
              isRunning={infoIsRunning}
              isDisabled={infoIsDisabled}
              isCrossOs={infoIsCrossOs}
              syncStatuses={syncStatuses}
            />
          );
        })()}
      <DataTableActionBar table={table}>
        <DataTableActionBarSelection table={table} />
        {onBulkGroupAssignment && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.assignToGroup")}
            onClick={onBulkGroupAssignment}
            size="icon"
          >
            <LuUsers />
          </DataTableActionBarAction>
        )}
        {onBulkProxyAssignment && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.assignProxy")}
            onClick={onBulkProxyAssignment}
            size="icon"
          >
            <LuGlobe />
          </DataTableActionBarAction>
        )}
        {onBulkProxyPasteAssignment && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.assignProxyBulk")}
            onClick={onBulkProxyPasteAssignment}
            size="icon"
          >
            <LuList />
          </DataTableActionBarAction>
        )}
        {onBulkCopySelectedNames && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.copySelectedNames")}
            onClick={onBulkCopySelectedNames}
            size="icon"
          >
            <LuCopy />
          </DataTableActionBarAction>
        )}
        {onBulkExtensionGroupAssignment && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.assignExtensionGroup")}
            onClick={onBulkExtensionGroupAssignment}
            size="icon"
          >
            <LuPuzzle />
          </DataTableActionBarAction>
        )}
        {onBulkCopyCookies && (
          <DataTableActionBarAction
            tooltip={t("profiles.actionBar.copyCookies")}
            onClick={onBulkCopyCookies}
            size="icon"
          >
            <LuCookie />
          </DataTableActionBarAction>
        )}
        {onBulkDelete && (
          <DataTableActionBarAction
            tooltip={t("common.buttons.delete")}
            onClick={onBulkDelete}
            size="icon"
            variant="destructive"
            className="border-destructive bg-destructive/50 hover:bg-destructive/70"
          >
            <LuTrash2 />
          </DataTableActionBarAction>
        )}
      </DataTableActionBar>
      {trafficDialogProfile && (
        <TrafficDetailsDialog
          isOpen={trafficDialogProfile !== null}
          onClose={() => {
            setTrafficDialogProfile(null);
          }}
          profileId={trafficDialogProfile.id}
          profileName={trafficDialogProfile.name}
        />
      )}
      <ProfileBypassRulesDialog
        isOpen={bypassRulesProfile !== null}
        onClose={() => {
          setBypassRulesProfile(null);
        }}
        profileId={bypassRulesProfile?.id ?? null}
        initialRules={bypassRulesProfile?.proxy_bypass_rules ?? []}
      />
      <ProfileLaunchHookDialog
        isOpen={launchHookProfile !== null}
        onClose={() => {
          setLaunchHookProfile(null);
        }}
        profileId={launchHookProfile?.id ?? null}
        currentLaunchHook={launchHookProfile?.launch_hook ?? null}
      />
    </>
  );
}
