# Approved dashboard design implementation

Implement the dashboard mockup approved in this chat. Preserve existing monitoring, billing and report workflows.

- [NEW] `apps/web/src/components/icon.tsx`: shared lightweight outline icons.
- [MODIFY] `apps/web/src/app/(app)/layout.tsx`, `nav-links.tsx`: slate navigation, workspace identity, persistent DEMO label and breadcrumb header.
- [MODIFY] `apps/web/src/app/(app)/page.tsx`, `apps/web/src/lib/data.ts`: real dashboard aggregates and report status.
- [NEW] `apps/web/src/components/store-table.tsx`: searchable, filterable store table with status badges and plan usage.
- [MODIFY] `apps/web/src/app/globals.css`: approved colors, typography, responsive shell, metrics, incidents and table.

Verify with web typecheck, production build, existing tests, and desktop/mobile browser review.
