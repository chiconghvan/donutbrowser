# UI Design Language

## 1. Design Goal

Donut Browser dùng ngôn ngữ thiết kế desktop app hiện đại, borderless, compact, tối giản, thiên về dashboard/productivity tool. UI ưu tiên mật độ thông tin cao: rail navigation rất hẹp, header 44px, bảng profile chiếm gần toàn bộ vùng content, dialog dùng nhiều form ngắn và action rõ.

Phong cách chính đang dùng nhiều nhất: dark monochrome `Donut Mono`, shadcn/Radix primitives, Tailwind utility classes, CSS variables cho toàn bộ màu. Light mode có tồn tại nhưng dark mode là cảm giác chủ đạo trong code hiện tại.

## 2. Visual Identity

- Hiện đại, sạch, desktop-first.
- Tối giản, ít trang trí, ít màu ngoài status.
- Chủ đạo đen/trắng/xám, accent chủ yếu là `bg-accent` xám đậm hoặc `bg-primary` trắng trong dark mode.
- Bo góc vừa: base radius `--radius: 0.625rem`; component thường `rounded-md`, card/dialog `rounded-lg` hoặc `rounded-xl`.
- Shadow nhẹ: `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg`; chỉ popover/dialog/dropdown/toast dùng shadow rõ.
- Cảm giác native desktop app hơn web app: custom title/header, window drag, rail nav hẹp, full-height layout, body `overflow-hidden`.
- Suy luận từ code: UI muốn giống công cụ automation/browser profile manager, nhiều dữ liệu, thao tác nhanh, ít chrome.

## 3. Color System

Color system dùng CSS variables trong `src/styles/globals.css` và theme runtime trong `src/lib/themes.ts`. Tailwind v4 map token qua `@theme inline`, dùng class như `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`.

Theme mặc định đáng dùng cho project mới nếu muốn giống hiện tại: `Donut Mono`.

| Token | Value / Class | Usage |
|---|---|---|
| Main background | `--background: #070707` / `bg-background` | App shell, main content, dialog background |
| Primary text | `--foreground: #ffffff` / `text-foreground` | Text chính, active states |
| Card background | `--card: #0e0e0e` / `bg-card` | Header, cards, toast, popover-like surfaces |
| Card text | `--card-foreground: #e4e4e4` / `text-card-foreground` | Text trên card/header |
| Popover background | `--popover: #0e0e0e` / `bg-popover` | Dropdown, select content, popover |
| Popover text | `--popover-foreground: #e4e4e4` / `text-popover-foreground` | Text trong floating menus |
| Primary action | `--primary: #ffffff` / `bg-primary` | Button default, checkbox checked, tooltip background |
| Primary action text | `--primary-foreground: #070707` / `text-primary-foreground` | Text/icon trên primary |
| Secondary background | `--secondary: #161616` / `bg-secondary` | Secondary button, muted panels |
| Secondary text | `--secondary-foreground: #e4e4e4` / `text-secondary-foreground` | Text trên secondary |
| Muted background | `--muted: #161616` / `bg-muted` | Table selected, progress track, icon cells |
| Muted text | `--muted-foreground: #a0a0a0` / `text-muted-foreground` | Placeholder, inactive icon, secondary labels |
| Accent background | `--accent: #1f1f1f` / `bg-accent` | Rail active, hover, tabs indicator |
| Accent text | `--accent-foreground: #ffffff` / `text-accent-foreground` | Text on accent hover/active |
| Border | `--border: rgba(255,255,255,0.06)` / `border-border` | App separators, cards, tables |
| Input border | `--input: rgba(255,255,255,0.1)` / `border-input` | Input/select/checkbox border |
| Focus ring | `--ring: #6b6b6b` / `ring-ring` | Focus visible ring |
| Danger | `--destructive: #ec6a5e` / `bg-destructive`, `text-destructive` | Delete, close hover, destructive menu item |
| Danger text | `--destructive-foreground: #070707` / `text-destructive-foreground` | Text on destructive bg |
| Success | `--success: #61c554` / `bg-success`, `text-success` | Success status, valid state |
| Warning | `--warning: #f4be4f` / `bg-warning`, `text-warning` | Warning/syncing status |
| Chart 1-5 | `--chart-1..5` | Mini charts, analytics |
| Sidebar tokens | `--sidebar*` | Defined but main rail uses `bg-background`, not `bg-sidebar` |

Light mode exists in `:root` with OKLCH tokens. Multiple custom themes exist in `THEMES` (`tokyo-night`, `dracula`, `matchalk`, `houston`, `ayu-*`, etc.). Rule: use semantic tokens only; do not hard-code Tailwind colors.

## 4. Typography

- Font family: `--font-geist-sans` maps to `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Mono font: `--font-geist-mono` maps to `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`.
- App root uses `font-(family-name:--font-geist-sans)` and `antialiased`.
- Common body/control text: `text-sm` for buttons, table, forms.
- Compact toolbar/sidebar text: `text-xs`, `text-[11px]`, `text-[10px]`.
- Dialog title: `text-lg font-semibold leading-none`.
- Card title: `font-semibold leading-none`.
- Labels: `text-sm leading-none font-medium`.
- Muted/description text: `text-sm text-muted-foreground` or compact `text-xs text-muted-foreground`.
- Table header: `text-sm`, `font-medium`, `text-foreground`.
- Use `tabular-nums` for counts and numeric status in compact chips.

## 5. Spacing System

Project dùng Tailwind scale, compact by default.

| Area | Class / Value | Notes |
|---|---|---|
| App height | `h-screen` | Full desktop window |
| Header height | `h-11` | 44px title/header bar |
| Rail width | `w-10` | 40px left navigation |
| Rail padding | `py-2 gap-1` | Very compact |
| Rail item | `size-7` | 28px square icon button |
| Main profile content | `px-3 pt-2.5` | Tight dashboard padding |
| Sub-page content | inline `padding: 12`, `gap: 12` | From `DialogContent` subPage mode |
| Dialog padding | `p-6 gap-4` | Centered modal |
| Card padding | `py-6`, header/content/footer `px-6` | shadcn default card |
| Button default | `h-9 px-4 py-2` | 36px height |
| Button small | `h-8 px-3` | Often overridden to `h-7 px-2.5 text-xs` in toolbar |
| Icon button | `size-9`; rail custom `size-7` | Use smaller for dense toolbar |
| Input default | `h-9 px-3 py-1` | Header search overrides `h-7 w-52 text-xs` |
| Select default | `h-9 px-3 py-2` | `size="sm"` gives `h-8` |
| Table head | `h-8 px-2` | Dense table |
| Table cell | `px-2 py-1` | Dense row style |
| Dropdown menu | `p-1`, item `px-2 py-1.5` | Compact floating menu |
| Toast | `p-3 w-96` | Fixed-width desktop toast |

## 6. Borderless Window

Tauri window config split between `src-tauri/tauri.conf.json` and programmatic builder in `src-tauri/src/lib.rs`.

- Window created programmatically with `WebviewWindowBuilder::new(app, "main", WebviewUrl::default())`.
- Title: `Donut Browser`.
- Size: `.inner_size(880.0, 500.0)`.
- Minimum size: `.min_inner_size(640.0, 400.0)`.
- Resizable: `.resizable(true)`.
- Centered, focused, visible.
- Windows: `.decorations(false)` gives borderless custom window.
- macOS: `set_transparent_titlebar(true)` hides title and makes native titlebar transparent; `disable_native_fullscreen()` disables native fullscreen behavior.
- Linux: `WindowDragArea` returns `null`; system decorations handle window.

Custom title/header bar:

- `HomeHeader` is top bar, `h-11`, `bg-card`, `border-b border-border`, `select-none`.
- Drag behavior in `HomeHeader`: pointer hold/move triggers `getCurrentWindow().startDragging()` after `HOLD_MS = 150` or movement > `DRAG_THRESHOLD_PX = 3`, except text inputs/selects/textareas/contenteditable.
- Dialog overlay preserves draggable zone with `data-tauri-drag-region` at top `h-11` and `data-window-drag-area="true"`.
- macOS header reserves space for traffic lights with three empty circles: `w-[11px] h-[11px] rounded-full`, gap `7px`, no custom close/minimize drawn.
- Windows `WindowDragArea` renders top-right controls fixed `h-11`, two buttons `w-11`: minimize and close.
- Windows minimize hover: `hover:bg-muted/50`, `text-muted-foreground hover:text-foreground`.
- Windows close hover: `hover:bg-destructive/90`, `hover:text-destructive-foreground`.
- App-level outside border not visible in frontend; separators are `border-b` header and `border-r` rail.

## 7. Main Layout

Layout chính trong `src/app/page.tsx`:

```txt
┌────────────────────────────────────────────────────────────┐
│ HomeHeader h-11 bg-card border-b                          │
├──────┬─────────────────────────────────────────────────────┤
│ Rail │ Main content flex-1 overflow-hidden                 │
│ w-10 │ Profiles table or sub-page dialog content           │
│      │                                                     │
└──────┴─────────────────────────────────────────────────────┘
```

- Root: `flex flex-col h-screen bg-background font-(family-name:--font-geist-sans)`.
- Header fixed by flex order, not `position: fixed`.
- Body `overflow-hidden`, app owns scroll inside content/table/dialog.
- Main row: `flex flex-1 min-h-0`.
- Rail: `w-10 shrink-0`.
- Main: `flex-1 min-w-0 flex flex-col overflow-hidden`.
- Profiles page wrapper: `px-3 pt-2.5 flex flex-col flex-1 min-h-0`.
- Sub-pages (settings/extensions/groups/import/integrations): rendered via `Dialog` with `subPage` into main flow, not centered modal.

## 8. Sidebar / Navigation

Main navigation is a left rail, not wide sidebar. Source: `src/components/rail-nav.tsx`.

- Container: `flex flex-col items-center w-10 py-2 gap-1 bg-background border-r border-border shrink-0 relative`.
- Top: logo button `size-7 rounded-md`, icon `size-5`.
- Divider: `w-5 h-px bg-border my-1`.
- Primary nav items: `profiles`, `extensions`, `groups`, `integrations`.
- Bottom items: more menu, settings.
- Item size: `size-7`.
- Icon size: `size-3.5`.
- Radius: `rounded-md`.
- Active: `text-foreground bg-accent` plus left active indicator `absolute left-[-7px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-foreground`.
- Inactive: `text-muted-foreground hover:text-card-foreground hover:bg-accent/50`.
- Transition: `transition-colors duration-100`.
- Tooltip side: right.
- More menu: absolute floating panel `bottom-14 left-11 w-56 bg-card border border-border rounded-lg shadow-2xl p-1 z-40 animate-in fade-in-0 slide-in-from-bottom-1 duration-100`.

Rule tạo rail item mới:

- Thêm item vào `TOP_ITEMS` hoặc `MORE_ITEMS`.
- Dùng icon outline `size-3.5`.
- Dùng translation key cho label/hint.
- Giữ active indicator bên trái và `size-7`.
- Không thêm label trực tiếp trong rail; label nằm trong tooltip hoặc more menu.

## 9. Tabs

Có hai hệ tab:

1. `src/components/ui/tabs.tsx`: shadcn/Radix tabs chung.
2. `src/components/ui/animated-tabs.tsx`: tab pill gọn có indicator animated, dùng nhiều cho sub-page dialog.

Default tabs:

- `TabsList`: `inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground`.
- `TabsTrigger`: `rounded-sm px-3 py-1.5 text-sm font-medium transition-all`.
- Active trigger: `data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm`.
- Content: `mt-2`, focus ring, motion fade/blur duration `0.5s easeInOut`.

Animated tabs:

- List: `relative inline-flex items-center gap-1 rounded-md p-0`.
- Trigger: `h-7 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground`.
- Active: `text-foreground`.
- Indicator: `absolute inset-0 -z-10 rounded-md bg-accent`.
- Indicator transition: spring `{ stiffness: 360, damping: 32 }`.

Sub-page tab exception:

- Project guidelines require transparent tabs in sub-page dialogs: `!bg-transparent !p-0 !h-auto !rounded-none justify-start gap-4` on list and triggers with `!rounded-none !bg-transparent !shadow-none ... !px-1 !py-1 text-xs`.
- Use tabs inside one functional sub-page. Use rail for app-level sections.

## 10. Cards / Panels

Source: `src/components/ui/card.tsx`.

- Card: `bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm`.
- Header: `grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6`.
- Header with action: `has-data-[slot=card-action]:grid-cols-[1fr_auto]`.
- Title: `leading-none font-semibold`.
- Description: `text-muted-foreground text-sm`.
- Content: `px-6`.
- Footer: `flex items-center px-6`; if border top then `pt-6`.

Guideline:

- Dùng card cho isolated settings panels, onboarding panels, summary blocks.
- Với dense dashboard/table, dùng simple bordered container hoặc table, không bọc quá nhiều card.
- Không tăng shadow nếu panel nằm trong main content; `shadow-sm` đủ.
- Dùng `rounded-xl` cho card lớn, `rounded-md` cho inner controls.

## 11. Buttons

Source: `src/components/ui/button.tsx`. Dùng `class-variance-authority`.

Base:

- `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all`.
- Disabled: `disabled:pointer-events-none disabled:opacity-50`.
- Focus: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`.
- SVG default: `size-4`, no pointer events.

| Variant | Class | Usage |
|---|---|---|
| Default / primary | `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90` | Main action, create/save |
| Destructive | `bg-destructive text-white shadow-xs hover:bg-destructive/90 ... dark:bg-destructive/60` | Delete/danger confirm |
| Outline | `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50` | Secondary bordered actions |
| Secondary | `bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80` | Non-primary actions |
| Ghost | `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` | Icon buttons, low emphasis |
| Link | `text-primary underline-offset-4 hover:underline` | Inline links |

Sizes:

- Default: `h-9 px-4 py-2`.
- Small: `h-8 rounded-md gap-1.5 px-3`.
- Large: `h-10 rounded-md px-6`.
- Icon: `size-9`.
- App toolbar often overrides to `h-7 px-2.5 text-xs` with icons `size-3.5`.

Icon button style:

- Rail: custom `size-7 rounded-md`.
- Toolbar: `Button size="icon"` often custom `size-7` or `size-5`.

## 12. Inputs / Forms

Input source: `src/components/ui/input.tsx`.

- Input base: `border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm`.
- Placeholder: `placeholder:text-muted-foreground`.
- Focus: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`.
- Invalid: `aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive`.
- Disabled: `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50`.
- Header search example: `pr-7 pl-8 w-52 h-7 text-xs`, icon absolute left `size-3.5 text-muted-foreground`.

Textarea source: `src/components/ui/textarea.tsx`.

- `min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm`.
- Focus: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

Select source: `src/components/ui/select.tsx`.

- Trigger: `border-input ... rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs`.
- Heights: default `h-9`, sm `h-8`.
- Content: `bg-popover text-popover-foreground ... z-[50000] min-w-[8rem] rounded-md border shadow-md`.
- Item: `rounded-sm py-1.5 pr-8 pl-2 text-sm`, focus `bg-accent text-accent-foreground`.

Checkbox source: `src/components/ui/checkbox.tsx`.

- Size: `size-4`, radius `rounded-[4px]`, border `border-input`, shadow `shadow-xs`.
- Checked: `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary`.
- Icon: `LuCheck size-3.5`.

Label source: `src/components/ui/label.tsx`.

- `flex items-center gap-2 text-sm leading-none font-medium select-none`.

Form guideline:

- Stack fields with `space-y-2` or grid `gap-3`/`gap-4`.
- Labels above controls.
- Help/error text `text-xs text-muted-foreground` or `text-xs text-destructive`.
- Keep forms compact; prefer `h-8`/`h-9` controls.

## 13. Dialog / Modal

Source: `src/components/ui/dialog.tsx`, Radix Dialog + `motion/react`.

Centered modal:

- Overlay: `fixed inset-0 z-9999 bg-background/50`.
- Overlay animation: opacity + blur from `4px` to `0px`, duration `0.2`, ease `easeInOut`.
- Content: `bg-background fixed top-[50%] left-[50%] z-10000 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg`.
- Open animation: opacity 0 -> 1, scale 0.96 -> 1, duration `0.25`, ease `[0.22, 1, 0.36, 1]`.
- Close animation: duration `0.15`, same ease.
- Close X: `absolute top-4 right-4 rounded-xs opacity-70 hover:opacity-100`.
- Header: `flex flex-col gap-2 text-center sm:text-left`.
- Footer: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
- Title: `text-lg font-semibold leading-none`.
- Description: `text-sm text-muted-foreground`.
- Dismissible can be disabled via `dismissible={false}`; then escape/outside click blocked and close hidden.

Sub-page dialog mode:

- Prop: `<Dialog subPage container={...}>`.
- Non-modal: `modal={false}`.
- Renders in-flow with style: `position: relative`, `display: flex`, `flexDirection: column`, `flex: 1`, `width: 100%`, `height: 100%`, `padding: 12`, `gap: 12`, `overflow: auto`, `background: var(--background)`.
- Used for settings/extensions/groups/import/integrations pages.

Danger dialog style:

- Use `Button variant="destructive"` for confirm.
- Body should use `DialogDescription` muted text; explicit destructive detail in `text-destructive` only when needed.

## 14. Toast / Notification

Sources: `src/components/ui/sonner.tsx`, `src/components/custom-toast.tsx`, `src/lib/toast-utils.ts`.

- Library: `sonner`.
- Toaster theme from custom theme provider: `theme={theme}`.
- Toaster CSS variables: `--normal-bg: var(--card)`, `--normal-text: var(--card-foreground)`, `--normal-border: var(--border)`.
- z-index: `10001`; global CSS also forces `.toaster` and `[data-sonner-toast]` to `z-index: 99999` and interactive pointer events.
- Custom toast shell: `flex items-start p-3 w-96 rounded-lg border shadow-lg bg-card border-border text-card-foreground`.
- Icon left: `mr-3 mt-0.5`, icon size `size-4`.
- Title: `text-sm font-semibold leading-tight text-foreground`.
- Description: `mt-1 text-xs leading-tight text-muted-foreground`.
- Cancel button: `p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground`.
- Progress track: `w-full bg-muted rounded-full h-1.5`; bar `bg-foreground h-1.5 rounded-full transition-all duration-150`.

Toast durations:

- Loading: `10000ms`.
- Download active: `Infinity`; download completed: `3000ms`.
- Success: `3000ms`.
- Error: `10000ms`.
- Version update: `15000ms`.
- Sync progress: `Infinity`.
- Default fallback: `5000ms`.

Types: `loading`, `success`, `error`, `download`, `version-update`, `sync-progress`. Warning/info toast variants are not separate in current code; nếu cần, đề xuất dùng cùng shell, icon `LuTriangleAlert` cho warning và semantic `text-warning`/`bg-warning/10` rất nhẹ.

## 15. Tables / Lists

Table source: `src/components/ui/table.tsx`; main implementation: `src/components/profile-data-table.tsx` with TanStack Table + React Virtual.

- Table container: `overflow-visible w-full`.
- Table: `w-full text-sm caption-bottom`.
- Header rows: `[_tr]:border-b`.
- Row: `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`.
- Head cell: `px-2 h-8 font-medium text-left align-middle whitespace-nowrap text-foreground`.
- Cell: `px-2 py-1 align-middle whitespace-nowrap`.
- Footer: `bg-muted/50 border-t font-medium`.
- Caption: `mt-4 text-sm text-muted-foreground`.
- Selection action bar: fixed bottom toolbar `bottom-6`, `rounded-md border bg-background p-2 shadow-sm`, motion y 20 -> 0 duration `0.2`.
- Virtualized table expected for large profile lists.

List/menu item style:

- Floating menu item: `flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover/focus:bg-accent`.
- Compact two-line item in rail more menu: title `text-xs font-medium`, hint `text-[10px] text-muted-foreground`.

Empty state:

- Suy luận từ code: use centered compact muted state, not big illustration. Suggested: container `flex flex-1 items-center justify-center`, panel `text-center`, icon `size-8 text-muted-foreground`, title `text-sm font-medium`, description `text-xs text-muted-foreground`, optional `Button size="sm" className="h-7 text-xs"`.

## 16. Icons

- Main icon libraries: `lucide-react` and `react-icons`.
- Common imports: `Lu*` from `react-icons/lu`, `Go*` from `react-icons/go`, `Fa*` from `react-icons/fa`, `RxCross2` from `react-icons/rx`.
- Style: outline icons, minimal stroke, no filled colorful icon except app logo/flags/status.
- Rail icon size: `size-3.5`.
- Header/search/action icons: `size-3.5`.
- Button default icon: base button forces SVG `size-4` unless explicit `size-*` class.
- Toast icon: `size-4`.
- Logo in rail: `size-5`.
- Icon color usually `text-muted-foreground`, active `text-foreground`, destructive `text-destructive`.
- Do not introduce multi-color icons for core UI; keep semantic token color.

## 17. States

| State | Style |
|---|---|
| Hover | `hover:bg-accent`, `hover:bg-accent/50`, `hover:text-foreground`, `hover:bg-muted/50` |
| Active nav | `bg-accent text-foreground` + 2px left indicator |
| Active tabs | `text-foreground`, `bg-background` or animated `bg-accent` pill |
| Selected row | `data-[state=selected]:bg-muted` |
| Disabled | `disabled:pointer-events-none disabled:opacity-50`, forms also `disabled:cursor-not-allowed` |
| Focus | `focus-visible:ring-ring/50 focus-visible:ring-[3px]`, or `ring-2 ring-ring` in older components |
| Invalid | `aria-invalid:border-destructive` + `aria-invalid:ring-destructive/20` |
| Loading | Spinner: `size-3.5/4 rounded-full border border-current animate-spin border-t-transparent` |
| Empty | Suy luận từ code: muted centered text/icon, optional primary action |
| Error | `text-destructive`, destructive button variant, error toast duration 10s |
| Success | `text-success`/`bg-success` for status; success toast uses same monochrome shell with success icon |
| Warning | `text-warning`/`bg-warning`, warning status dots; avoid hard-coded yellow |

## 18. Animation & Transition

- Global animation import: `tw-animate-css`.
- Reduced motion: all animations/transitions collapse to `0.01ms` in `prefers-reduced-motion: reduce`.
- Default hover/control transition: `transition-colors duration-100` or `transition-all`.
- Header group scroll uses smooth scroll behavior.
- Dialog overlay: fade + blur, `0.2s easeInOut`.
- Dialog content: scale/opacity, open `0.25s`, close `0.15s`, cubic `[0.22, 1, 0.36, 1]`.
- Tabs content: fade + blur, `0.5s easeInOut`.
- Tabs highlight: spring `{ stiffness: 200, damping: 25/30 }`.
- Animated tab indicator: spring `{ stiffness: 360, damping: 32 }`.
- Data table action bar: opacity + y, `0.2s easeInOut`.
- Dropdown/select/tooltip: `animate-in`, `fade-in-0`, `zoom-in-95`, directional slide `slide-in-from-*`, reverse on close.
- Loading spinner: `animate-spin`.
- Logo easter egg uses `animate-[wiggle_0.3s_ease-in-out]`; do not copy for normal UI.

## 19. Scrollbar

Global scrollbar in `src/styles/globals.css`:

- Applies to `*`.
- `scrollbar-width: thin`.
- Light/default thumb: `oklch(0.5 0 0 / 30%)`, track transparent.
- Dark thumb: `oklch(0.8 0 0 / 25%)`, track transparent.
- Some horizontal strips hide scrollbar explicitly: `[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`.
- Scroll fade utility `.scroll-fade` uses mask gradient for top/bottom 24px only when `data-fade-top` / `data-fade-bottom` are true.

## 20. Component Rules

- Use existing primitives from `src/components/ui/`: `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Dialog`, `DropdownMenu`, `Tooltip`, `Tabs`, `AnimatedTabs`, `Card`, `Table`.
- Use `cn()` from `src/lib/utils` for conditional class composition.
- Use semantic color tokens only: `bg-background`, `bg-card`, `bg-popover`, `bg-primary`, `bg-secondary`, `bg-muted`, `bg-accent`, `bg-destructive`, `bg-success`, `bg-warning`, `border-border`, `border-input`, `text-muted-foreground`.
- Do not use hard-coded Tailwind colors like `text-red-500`, `bg-blue-600`, `border-yellow-400`.
- Keep UI compact: prefer `h-7`/`h-8` for toolbar controls, `text-xs` in dense header/rail, `text-sm` for forms/tables.
- Keep border radius consistent: `rounded-md` for controls, `rounded-lg` for modal/popover, `rounded-xl` for card.
- Keep shadows restrained: controls `shadow-xs`, card/action bar `shadow-sm`, dropdown `shadow-md`, dialog/toast `shadow-lg`.
- Use border separators instead of large background blocks.
- Dialogs and popovers must preserve borderless-window drag zone where overlay covers header.
- All user-facing strings in `src/` must use i18n keys via `useTranslation()`, no raw visible English.
- Add new translation keys to all locale files if implementing UI in this project.
- New app-level pages should use rail navigation and sub-page `Dialog` mode when matching settings/management screens.
- New transient actions should use `showToast()`/`UnifiedToast`, not raw Sonner default styling.
- Prefer outline icons from existing libraries; keep `size-3.5` to `size-4`.

## 21. Recommended File Structure For New Project

Adjusted from current project structure:

```txt
src/
  app/
    layout.tsx
    page.tsx
  components/
    ui/
      button.tsx
      input.tsx
      textarea.tsx
      select.tsx
      checkbox.tsx
      dialog.tsx
      dropdown-menu.tsx
      tabs.tsx
      animated-tabs.tsx
      tooltip.tsx
      card.tsx
      table.tsx
      sonner.tsx
    layout/
      app-shell.tsx
      rail-nav.tsx
      home-header.tsx
      window-drag-area.tsx
    dialogs/
      create-item-dialog.tsx
      delete-confirmation-dialog.tsx
    tables/
      data-table.tsx
      data-table-action-bar.tsx
    toast/
      custom-toast.tsx
    icons/
      logo.tsx
  hooks/
    use-scroll-fade.ts
    use-controlled-state.ts
  lib/
    themes.ts
    toast-utils.ts
    utils.ts
  styles/
    globals.css
```

For Tauri desktop:

```txt
src-tauri/
  src/
    lib.rs        # Programmatic window builder and platform titlebar config
  tauri.conf.json # Build/bundle config
```

## 22. Implementation Examples

App shell:

```tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background font-(family-name:--font-geist-sans)">
      <header className="flex h-11 items-center gap-2 border-b border-border bg-card px-3 select-none">
        <div className="text-xs font-semibold text-card-foreground">Dashboard</div>
        <div className="flex-1" />
        <Button size="sm" className="h-7 px-2.5 text-xs">
          New
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2" />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-3 pt-2.5">
          {children}
        </main>
      </div>
    </div>
  );
}
```

Sidebar item:

```tsx
function RailItem({ active, label, Icon, onClick }: RailItemProps) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-current={active ? "page" : undefined}
          onClick={onClick}
          className={cn(
            "relative grid size-7 place-items-center rounded-md transition-colors duration-100",
            active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-card-foreground",
          )}
        >
          {active && (
            <span className="absolute left-[-7px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-foreground" />
          )}
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
```

Button:

```tsx
<Button className="h-7 gap-1.5 px-2.5 text-xs">
  <LuPlus className="size-3.5" />
  Create
</Button>

<Button variant="secondary" size="sm">
  Secondary
</Button>

<Button variant="destructive" size="sm">
  Delete
</Button>
```

Card:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Profile Sync</CardTitle>
    <CardDescription>Configure automatic sync behavior.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <Label htmlFor="name">Name</Label>
    <Input id="name" placeholder="Profile name" />
  </CardContent>
  <CardFooter className="justify-end gap-2">
    <Button variant="secondary">Cancel</Button>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

Dialog:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Create Profile</DialogTitle>
      <DialogDescription>Choose settings for this browser profile.</DialogDescription>
    </DialogHeader>
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" />
      </div>
    </div>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button>Create</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Toast:

```tsx
showToast({
  type: "success",
  title: t("toasts.saved.title"),
  description: t("toasts.saved.description"),
});
```

Tab:

```tsx
<AnimatedTabs defaultValue="general">
  <AnimatedTabsList>
    <AnimatedTabsTrigger value="general">General</AnimatedTabsTrigger>
    <AnimatedTabsTrigger value="advanced">Advanced</AnimatedTabsTrigger>
  </AnimatedTabsList>
  <AnimatedTabsContent value="general" className="mt-4">
    <Card>...</Card>
  </AnimatedTabsContent>
  <AnimatedTabsContent value="advanced" className="mt-4">
    <Card>...</Card>
  </AnimatedTabsContent>
</AnimatedTabs>
```

Table:

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="font-medium">Profile 1</TableCell>
      <TableCell className="text-muted-foreground">Ready</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7">
          <LuMoreHorizontal className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## 23. Do / Don't

| Do | Don't |
|---|---|
| Use `bg-background`, `bg-card`, `text-muted-foreground`, `border-border` | Add `bg-zinc-*`, `text-red-*`, `border-blue-*` directly |
| Keep toolbar controls `h-7`/`text-xs` when dense | Use large web-dashboard buttons in header |
| Use `Button`, `Input`, `Dialog`, `DropdownMenu`, `AnimatedTabs` | Build one-off unstyled primitives |
| Use rail item `size-7` with tooltip | Add wide labels into rail |
| Use `rounded-md` controls and `rounded-lg` modal/popover | Mix random radius values |
| Use `shadow-sm`/`shadow-md` sparingly | Add heavy shadows to every panel |
| Use `transition-colors duration-100` for hover | Add slow decorative animations to controls |
| Use centered modal for blocking workflows | Use modal for app-level management pages that should be sub-pages |
| Use `showToast()` with `UnifiedToast` | Use raw `toast()` default styling |
| Keep empty states muted and compact | Add large colorful illustrations unless new brand requires it |
| Use existing icon libraries and `size-3.5`/`size-4` | Mix filled/color icons randomly |
| Add all user-visible strings through i18n in this project | Hard-code visible English/Vietnamese in JSX |

## 24. Source References

- `package.json`
- `tailwind.config.js`
- `src/styles/globals.css`
- `src/lib/themes.ts`
- `src/lib/utils.ts`
- `src/lib/toast-utils.ts`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/components/client-providers.tsx`
- `src/components/theme-provider.tsx`
- `src/components/window-drag-area.tsx`
- `src/components/home-header.tsx`
- `src/components/rail-nav.tsx`
- `src/components/profile-data-table.tsx`
- `src/components/data-table-action-bar.tsx`
- `src/components/custom-toast.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/animated-tabs.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/sonner.tsx`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
