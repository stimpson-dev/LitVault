# Plan 09-02 Summary: Saved Views Nav + Recent Docs

## What was done

### Task 1: Saved views as sidebar navigation
- Created `SavedViewNav` component that fetches saved searches from API on mount
- Each saved search renders as a nav item with Bookmark icon + name
- Clicking navigates to `/view/:viewId` route
- Active view highlighted with filled bookmark icon
- Slim mode: icon only with title tooltip

### Task 2: Recently opened documents + wiring
- Created `useRecentDocs` hook:
  - Stores last 10 documents in sessionStorage
  - addRecent/removeRecent/clearAll operations
  - Deduplicates on add (moves to front)
- Created `RecentDocuments` component:
  - Lists recent docs with FileText icon + truncated title
  - X button removes individual entries (hover-reveal)
  - "Close all" button when >1 item
  - Slim mode: single FileText icon
- Wired `addRecent()` call when selecting a document in DocumentsPage
- Wired recent doc click to navigate via `?doc=id` URL param

### Route wiring
- `/view/:viewId` route loads saved search by ID, applies query+filters to search state
- `?doc=id` param auto-selects document in detail panel
- Outlet context passes `addRecent` from AppShell to child pages

### Sidebar updates
- AppSidebar now receives recentDocs props from AppShell
- Saved Views section populated with SavedViewNav (replaces placeholder)
- Recently Opened section added between Saved Views and Manage
- Footer slim toggle button uses i18n labels (Einklappen/Collapse)

### i18n
- Added: `sidebar.recentDocs`, `sidebar.noRecentDocs`, `sidebar.clearAll` (de + en)

## Files created
- `frontend/src/hooks/useRecentDocs.ts`
- `frontend/src/components/layout/SavedViewNav.tsx`
- `frontend/src/components/layout/RecentDocuments.tsx`

## Files modified
- `frontend/src/components/layout/AppSidebar.tsx` (new props + sections)
- `frontend/src/components/layout/AppShell.tsx` (useRecentDocs + outlet context)
- `frontend/src/pages/DocumentsPage.tsx` (viewId loading + addRecent + ?doc param)
- `frontend/src/lib/router.tsx` (simplified props)
- `frontend/src/i18n/translations.ts` (new keys)

## Verification
- [x] npm run build succeeds (0 errors)
- [x] Saved views render as sidebar nav items
- [x] /view/:id loads saved search filters
- [x] Active saved view highlighted
- [x] Recent docs tracked on document selection
- [x] X button removes recent doc
- [x] Sidebar sections collapsible (from 09-01)
