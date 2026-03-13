# Plan 09-01 Summary: Router + AppShell + Sidebar

## What was done

### Task 1: React Router setup
- Installed `react-router-dom` v7
- Created `frontend/src/lib/router.tsx` with routes:
  - `/` → DocumentsPage (existing search/results)
  - `/view/:viewId` → DocumentsPage with saved view
  - `/dashboard` → DashboardPage (placeholder)
  - `/review` → ReviewPage
- All routes nested under AppShell layout component

### Task 2: AppShell + AppNavbar + AppSidebar
- **AppShell** (`components/layout/AppShell.tsx`): Persistent layout with fixed navbar + sidebar + Outlet
- **AppNavbar** (`components/layout/AppNavbar.tsx`): Fixed top bar (h-14) with hamburger (mobile), SearchBar (compact mode), theme toggle, jobs button, export
- **AppSidebar** (`components/layout/AppSidebar.tsx`): Collapsible sidebar with:
  - Slim mode toggle (256px ↔ 50px) persisted to localStorage
  - Mobile drawer with overlay
  - Sections: Navigation (Dashboard, Documents, Review), Saved Views (placeholder), Manage (Settings)
  - Footer with slim toggle + version
  - NavLink active state highlighting
- **SidebarSection** (`components/layout/SidebarSection.tsx`): Collapsible section headers with persisted state
- **SearchBar**: Added `compact` prop for navbar usage (smaller padding, inline result count)

### Refactoring
- **App.tsx**: Simplified to just LanguageProvider + RouterProvider
- **DocumentsPage**: Extracted from App.tsx with all search/filter/detail/selection logic
- **DashboardPage**: Placeholder with Phase 12 note
- **ReviewPage**: Wraps existing ReviewQueue component

### Bug fixes (pre-existing)
- Fixed unused `Square` import in ResultsList.tsx
- Fixed `window.showSaveFilePicker` type error in ExportButton.tsx
- Fixed `erasableSyntaxOnly` error with ApiError class in api.ts

### i18n
- Added translation keys: `toolbar.navigation`, `toolbar.documents`, `toolbar.manage`, `sidebar.noSavedSearches`, `sidebar.collapse`, `sidebar.expand` (de + en)

## Files created
- `frontend/src/lib/router.tsx`
- `frontend/src/pages/DocumentsPage.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/ReviewPage.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/AppNavbar.tsx`
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/components/layout/SidebarSection.tsx`

## Files modified
- `frontend/src/App.tsx` (simplified to router provider)
- `frontend/src/components/SearchBar.tsx` (added compact prop)
- `frontend/src/i18n/translations.ts` (new keys)
- `frontend/src/components/ResultsList.tsx` (unused import fix)
- `frontend/src/components/ExportButton.tsx` (type fix)
- `frontend/src/lib/api.ts` (ApiError fix)
- `frontend/package.json` (+ react-router-dom)

## Verification
- [x] npm run build succeeds (0 errors)
- [x] Router navigates between `/` and `/dashboard`
- [x] Sidebar renders with nav items
- [x] Slim mode toggles between 256px and 50px
- [x] Mobile hamburger toggles sidebar drawer
- [x] SearchBar works in navbar (compact mode)
- [x] Existing search/filter functionality preserved on `/` route
