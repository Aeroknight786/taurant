import { ACTIVE_VENUE_KEY, STAFF_AUTH_KEY } from './constants.js';

export const DEFAULT_THEME_KEY = 'default';

export const THEME_PRESETS = {
  default: {
    stylesheet: '',
    fonts: '',
    themeColor: '#141210',
    title: 'Flock',
  },
  craftery: {
    stylesheet: '/craftery-styles.css',
    fonts: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&family=DM+Serif+Text:ital@0;1&family=JetBrains+Mono:wght@400;600&display=swap',
    themeColor: '#1E1A16',
    title: 'The Craftery by Subko',
  },
};

function readVenueSection(venue, sectionKey) {
  return venue?.config?.[sectionKey] || venue?.[sectionKey] || null;
}

export function formatQueueSeatingPreference(preference) {
  switch (preference) {
    case 'INDOOR':
      return 'Indoor';
    case 'OUTDOOR':
      return 'Outdoor';
    case 'FIRST_AVAILABLE':
    default:
      return 'First available';
  }
}

const DEFAULT_VENUE_OPS_CONFIG = {
  queueDispatchMode: 'AUTO_TABLE',
  tableSourceMode: 'MANUAL',
  joinConfirmationMode: 'WHATSAPP',
  readyNotificationChannels: ['WHATSAPP'],
  readyReminderEnabled: false,
  readyReminderOffsetMin: 1,
  expiryNotificationEnabled: false,
  guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
  contentMode: 'DEFAULT',
  arrivalCompletionMode: 'TABLE_ASSIGN',
};

export function resolveVenueOpsConfig(venue) {
  const rawOpsConfig = readVenueSection(venue, 'opsConfig') || {};
  return {
    ...DEFAULT_VENUE_OPS_CONFIG,
    ...rawOpsConfig,
    readyNotificationChannels: Array.isArray(rawOpsConfig.readyNotificationChannels) && rawOpsConfig.readyNotificationChannels.length
      ? rawOpsConfig.readyNotificationChannels
      : DEFAULT_VENUE_OPS_CONFIG.readyNotificationChannels,
  };
}

export function resolveThemePreset(themeKey = DEFAULT_THEME_KEY) {
  return THEME_PRESETS[themeKey] || THEME_PRESETS.default;
}

export function getRouteVenueSlug(pathname = window.location.pathname) {
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments[0] === 'v' && segments[1]) {
    return segments[1];
  }
  return null;
}

export function setActiveVenueSlug(slug, storage = sessionStorage) {
  if (!slug) return;
  storage.setItem(ACTIVE_VENUE_KEY, slug);
}

export function getStoredActiveVenueSlug(storage = sessionStorage) {
  return storage.getItem(ACTIVE_VENUE_KEY);
}

export function clearActiveVenueSlug(storage = sessionStorage) {
  storage.removeItem(ACTIVE_VENUE_KEY);
}

export function getVenueSlugFromStaffAuth(storage = localStorage) {
  try {
    const auth = JSON.parse(storage.getItem(STAFF_AUTH_KEY) || 'null');
    return auth?.venueSlug || null;
  } catch (_error) {
    return null;
  }
}

export function resolveLegacyVenueSlug(pathname = window.location.pathname) {
  return getRouteVenueSlug(pathname) || getVenueSlugFromStaffAuth() || getStoredActiveVenueSlug() || null;
}

export function resolveVenueThemeKey(venue) {
  return readVenueSection(venue, 'brandConfig')?.themeKey || DEFAULT_THEME_KEY;
}

export function resolveVenueDisplayName(venue) {
  return readVenueSection(venue, 'brandConfig')?.displayName || venue?.name || 'Venue';
}

export function isVenueFeatureEnabled(venue, featureKey) {
  return Boolean(readVenueSection(venue, 'featureConfig')?.[featureKey]);
}

export function isQueueOnlyGuestExperience(venue) {
  return isVenueFeatureEnabled(venue, 'guestQueue')
    && !isVenueFeatureEnabled(venue, 'preOrder')
    && !isVenueFeatureEnabled(venue, 'partyShare')
    && !isVenueFeatureEnabled(venue, 'seatedOrdering')
    && !isVenueFeatureEnabled(venue, 'finalPayment');
}

export function shouldShowVenueDepositPolicy(venue) {
  return isVenueFeatureEnabled(venue, 'preOrder') || isVenueFeatureEnabled(venue, 'finalPayment');
}

export function shouldLoadVenueBills(venue) {
  return isVenueFeatureEnabled(venue, 'preOrder')
    || isVenueFeatureEnabled(venue, 'seatedOrdering')
    || isVenueFeatureEnabled(venue, 'finalPayment');
}

export function isManualDispatchVenue(venue) {
  return resolveVenueOpsConfig(venue).queueDispatchMode === 'MANUAL_NOTIFY';
}

export function isWaitlistOnlyVenue(venue) {
  const opsConfig = resolveVenueOpsConfig(venue);
  return opsConfig.tableSourceMode === 'DISABLED' || opsConfig.arrivalCompletionMode === 'QUEUE_COMPLETE';
}

export function getGuestJourneyStepLabels(venue) {
  return isQueueOnlyGuestExperience(venue) || isWaitlistOnlyVenue(venue)
    ? ['Join', 'Wait', 'Called']
    : ['Queue', 'Pre-order', 'Seated', 'Pay'];
}

export function getVenueGuestSurfaceFlags(venue) {
  return {
    queueOnlyGuestExperience: isQueueOnlyGuestExperience(venue),
    waitlistOnlyVenue: isWaitlistOnlyVenue(venue),
    manualDispatchMode: isManualDispatchVenue(venue),
    showPreOrderCta: isVenueFeatureEnabled(venue, 'preOrder'),
    showInviteAction: isVenueFeatureEnabled(venue, 'partyShare'),
    showTableOrdering: isVenueFeatureEnabled(venue, 'seatedOrdering'),
    showFinalPayment: isVenueFeatureEnabled(venue, 'finalPayment'),
    showBillingSignals: shouldLoadVenueBills(venue),
  };
}

export function getVenueStaffSurfaceFlags(venue) {
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  return {
    queueOnlyGuestExperience: isQueueOnlyGuestExperience(venue),
    waitlistOnlyVenue,
    manualDispatchMode: isManualDispatchVenue(venue),
    showNotifyAction: isManualDispatchVenue(venue),
    showFlowLog: isVenueFeatureEnabled(venue, 'flowLog'),
    showRefundTool: isVenueFeatureEnabled(venue, 'refunds'),
    showOfflineSettleTool: isVenueFeatureEnabled(venue, 'offlineSettle'),
    showBulkClearTool: isVenueFeatureEnabled(venue, 'bulkClear'),
    showDepositControls: shouldShowVenueDepositPolicy(venue),
    showBillingSignals: shouldLoadVenueBills(venue),
    showTablesSurface: !waitlistOnlyVenue,
    showSeatSurface: !waitlistOnlyVenue,
    showSeatedSurface: !waitlistOnlyVenue,
  };
}

export function buildVenuePath(slug) {
  return `/v/${slug}`;
}

export function buildGuestEntryPath(slug, entryId) {
  return `/v/${slug}/e/${entryId}`;
}

export function buildGuestPreorderPath(slug, entryId) {
  return `${buildGuestEntryPath(slug, entryId)}/preorder`;
}

export function buildGuestSessionJoinPath(slug, joinToken) {
  return `/v/${slug}/session/${encodeURIComponent(joinToken)}`;
}

export function buildStaffLoginPath(slug) {
  return `/v/${slug}/staff/login`;
}

export function buildStaffDashboardPath(slug) {
  return `/v/${slug}/staff/dashboard`;
}

export function buildAdminLoginPath(slug) {
  return `/v/${slug}/admin/login`;
}

export function buildAdminDashboardPath(slug) {
  return `/v/${slug}/admin/dashboard`;
}
