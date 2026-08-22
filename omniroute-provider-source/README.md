# OmniRoute Provider Pages Source

Source files extracted from [OmniRoute v3.8.50](https://github.com/diegosouzapw/OmniRoute/tree/release/v3.8.50) for reference and adaptation.

## Structure

```
update/
├── pages/                    # Page components
│   ├── providers-page.tsx           # Main provider list (84KB)
│   ├── provider-detail-page.tsx     # Detail page wrapper
│   ├── ProviderDetailPageClient.tsx # Detail page client (36KB)
│   ├── provider-new-page.tsx        # New provider wizard
│   └── provider-stats-page.tsx      # Provider statistics
├── components/
│   ├── list/                 # List page components (13 files)
│   │   ├── ProviderCard.tsx         # Main provider card (28KB)
│   │   ├── ProviderSummaryCard.tsx  # Summary stats card
│   │   ├── HighlightableProviderCard.tsx
│   │   ├── ProviderCountBadge.tsx
│   │   ├── ProviderDisplayModeControl.tsx
│   │   ├── CategoryDot.tsx
│   │   ├── NoAuthProvidersSection.tsx
│   │   ├── AddCompatibleProviderModal.tsx
│   │   ├── ImportProvidersFromFileModal.tsx
│   │   ├── RiskNoticeModal.tsx
│   │   ├── CodexCliGuideModal.tsx
│   │   ├── parseProviderImportFile.ts
│   │   └── useImportProvidersFromFile.ts
│   ├── detail/               # Detail page components (15 files)
│   │   ├── ConnectionRow.tsx        # Connection row (38KB)
│   │   ├── ConnectionsListPanel.tsx # Paginated connections
│   │   ├── ConnectionsHeaderToolbar.tsx
│   │   ├── ProviderModelsSection.tsx
│   │   ├── CustomModelsSection.tsx
│   │   ├── ProviderModalsPanel.tsx
│   │   ├── ProviderPageHeader.tsx
│   │   ├── CompatibleNodeCard.tsx
│   │   ├── CoolingConnectionsPanel.tsx
│   │   ├── EmptyConnectionsPlaceholder.tsx
│   │   ├── ProviderExtraPanels.tsx
│   │   ├── UpstreamProxyCard.tsx
│   │   ├── SearchProviderCard.tsx
│   │   ├── NoAuthProviderControls.tsx
│   │   └── AnonymousFallbackToggle.tsx
│   └── shared/               # Shared UI components (12 files)
│       ├── Card.tsx
│       ├── Toggle.tsx
│       ├── Badge.tsx
│       ├── ProviderIcon.tsx
│       ├── NoAuthProviderCard.tsx
│       ├── NoAuthProviderToggle.tsx
│       ├── NoAuthAccountCard.tsx
│       ├── ProviderTestSlideOver.tsx
│       ├── OAuthModal.tsx
│       ├── DistributeProxiesButton.tsx
│       ├── TokenHealthBadge.tsx
│       └── DegradationBadge.tsx
├── hooks/                    # React hooks (5 files)
│   ├── useApiKey.ts
│   ├── useProviderModels.ts
│   ├── useProviderUrlFilters.ts
│   ├── useRiskAcknowledged.ts
│   └── useSyncedModelsByProvider.ts
├── types/                    # TypeScript types
│   └── domain-types.ts
├── constants/                # Constants & config (5 files)
│   ├── providers.ts
│   ├── statusColors.ts
│   ├── webSessionCredentials.ts
│   └── lobeProviderIcons.ts
└── utils/                    # Utility functions (7 files)
    ├── providerPageUtils.ts
    ├── providerPageStorage.ts
    ├── providerCompactMode.ts
    ├── providerPageHighlightUtils.ts
    ├── featuredProviders.ts
    └── openRouterProviderStatsContext.tsx
```

## Key Interfaces

```typescript
interface ProviderEntry {
  providerId: string;
  provider: Record<string, unknown>;
  stats: ProviderStatsSnapshot;
  displayAuthType: "oauth" | "apikey" | "compatible" | "no-auth";
}

interface ProviderStatsSnapshot {
  total?: number;
  connected?: number;
  error?: number;
  warning?: number;
  allDisabled?: boolean;
  expiryStatus?: "expired" | "expiring_soon" | null;
}
```

## Source

- Repo: https://github.com/diegosouzapw/OmniRoute
- Branch: release/v3.8.50
- License: MIT
