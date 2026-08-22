# ZESRouter Dashboard Full Rebuild - Arena Agent Prompt

## Objective
Rebuild ZESRouter dashboard (Next.js 16 + Tailwind v4 + Zustand) using ZES Frost Glassmorphic Design System with OmniRoute-grade provider management.

- Dashboard: port 20128 (ZESRouter-app)
- Gateway: port 4050 (BitRouter)
- Control panel: port 8080 (server.py)

## Reference Files
All OmniRoute source at: https://github.com/ZESCODE/zesrouter/tree/main/omniroute-provider-source

Key files to study:
- pages/providers-page.tsx (84KB) - Full provider list
- pages/ProviderDetailPageClient.tsx (36KB) - Provider detail
- components/list/ProviderCard.tsx (28KB) - Provider card
- components/detail/ConnectionRow.tsx (38KB) - Connection row
- components/detail/ConnectionsListPanel.tsx - Connections list
- components/shared/Card.tsx - Base card
- components/shared/Badge.tsx - Badge variants
- constants/providers.ts - Provider registry
- types/domain-types.ts - TypeScript types
- utils/providerPageUtils.ts - Page utilities

## ZES Frost Design System v1.0

### CSS Classes
.glass - background: rgba(255,255,255,0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px;
.glass-strong - background: rgba(255,255,255,0.06); backdrop-filter: blur(20px);
.glass-card - glass + padding: 24px;
.glass-btn-primary - background: rgba(59,130,246,0.15); color: #60a5fa; border-radius: 12px;
.glass-btn-success - background: rgba(34,197,94,0.15); color: #4ade80;
.glass-btn-destructive - background: rgba(239,68,68,0.15); color: #f87171;
.glass-input - background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
.glass-frost-blue/green/orange/red - color variants

## Current ZESRouter Structure

### Existing Routes (25 pages)
page.js, MonitoringDashboard.js, providers/page.js, providers/[id]/page.js,
providers/new/page.js, models/page.js, usage/page.js, endpoint/page.js,
settings/page.js, health/page.js, combos/page.js, traffic/page.js,
playground/page.js, quota/page.js, skills/page.js, console-log/page.js,
activity/page.js, autopilot/page.js, basic-chat/page.js, cli-tools/page.js,
media-providers/, mitm/page.js, proxy-pools/page.js, pxpipe/page.js,
token-saver/page.js, translator/page.js

### Existing Shared Components (55 files)
Card.js, Button.js, Badge.js, Toggle.js, Input.js, Modal.js, Loading.js,
Pagination.js, Select.js, Tooltip.js, Drawer.js, Header.js, Sidebar.js,
Footer.js, ThemeToggle.js, ProviderIcon.js, ProviderInfoCard.js,
NoAuthProxyCard.js, OAuthModal.js, EditConnectionModal.js,
ModelSelectModal.js, monitoring/FrostCard.js, monitoring/LiveConsole.js

### Backend API (server.py - 24 endpoints)
GET /api/health, /api/status, /api/models, /api/providers, /api/policy,
/api/requests, /api/stats/dashboard, /api/stats/costs, /api/logs,
/api/backups, /api/config, /api/keys
POST /api/route, /api/providers/key, /api/providers/add, /api/providers/remove,
/api/providers/test, /api/backups/create, /api/backups/restore,
/api/config/save, /api/config/validate, /api/keys/create, /api/keys/revoke,
/api/daemon

## Upgrade Features

### Phase 1: Provider Card Upgrade
Source: components/list/ProviderCard.tsx
1. Service kind badges (LLM, Embedding, Image, TTS, STT, Web Search, Video)
2. Error classification engine (AUTH, RUNTIME, RATE_LIMITED, SERVER, NETWORK)
3. Cooldown timer with live countdown
4. Connection count badges (connected/total)
5. Provider health status (healthy/degraded/offline)
6. Quick actions (test, configure, view logs)
7. Display mode toggle (All/Configured/Compact)

### Phase 2: Connection Management
Source: components/detail/ConnectionRow.tsx, ConnectionsListPanel.tsx
1. Paginated connection list with search/filter
2. Connection row with inline actions
3. Error type inference from testStatus, lastErrorType, HTTP codes
4. Bulk operations (select, test all, delete)
5. Connection reordering (drag to reorder priority)
6. Proxy per connection toggle
7. Token refresh on-demand
8. Quota visibility toggle

### Phase 3: Provider Registry
Source: constants/providers.ts
1. Dynamic provider registry from API
2. Provider categories (OAuth, API Key, Free, Compatible, No-Auth)
3. Provider family aliases
4. Service kind mapping
5. Provider metadata (name, color, icon, website)
6. Free tier tracking

### Phase 4: Error Classification Engine
Source: ProviderCard.tsx getConnectionErrorTag()
AUTH (401/403) -> red, RATE_LIMITED (429) -> orange,
SERVER (5xx) -> red, NETWORK (timeout) -> yellow,
RUNTIME (model_not_found) -> blue, UNKNOWN -> gray

### Phase 5: Dashboard Stats Upgrade
Source: pages/provider-stats-page.tsx
1. Provider performance ranking
2. Model usage heatmap
3. Cost trend chart (14-day)
4. Error rate trend
5. Latency distribution (p50/p95/p99)
6. Provider comparison
7. Real-time metrics (WebSocket/SSE)

### Phase 6: Settings Upgrade
1. Provider priority ordering (drag)
2. Rate limiting config per provider
3. Cost thresholds per provider
4. Fallback chains config
5. Health check intervals

## File Structure to Create
src/app/(dashboard)/dashboard/providers/
  page.js - REBUILD with rich cards
  components/ProviderCard.js - Rich provider card
  components/ConnectionRow.js - Rich connection row
  components/ConnectionsListPanel.js - Paginated list
  components/ErrorClassificationBadge.js - Error badge
  components/CooldownTimer.js - Live countdown
  components/ServiceKindBadge.js - Service kind
  components/BatchTestModal.js - Batch test results
  [id]/ProviderDetailClient.js - Detail page

src/shared/constants/
  providerRegistry.js - Dynamic registry
  serviceKinds.js - Service kinds
  errorTypes.js - Error types
  statusColors.js - Status colors

src/shared/hooks/
  useProviderConnections.js - Connection hook
  useErrorClassification.js - Error hook

src/shared/utils/
  errorClassifier.js - Error engine
  providerPageUtils.js - Page utils

## Implementation Rules
1. All components MUST use ZES Frost Design System classes
2. All components MUST support dark mode
3. All new pages MUST be in nav.ts
4. All API calls through server.py
5. State management with Zustand
6. Charts with Recharts + frost colors
7. Modals with glass-strong backdrop
8. Tables responsive with horizontal scroll
9. Error states use classification system
10. Loading states use glass skeleton

## Build
cd ~/zesrouter/zrouter-app
node node_modules/.bin/next build --webpack
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
PORT=20128 node node_modules/.bin/next start -p 20128

## Verification
1. All pages return 200
2. Frost CSS loads on all pages
3. Provider cards show service kind badges
4. Error classification works
5. Connection list paginated
6. Dark mode toggles
7. Mobile responsive
