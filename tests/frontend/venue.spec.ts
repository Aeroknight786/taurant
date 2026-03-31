// @vitest-environment jsdom

import {
  buildAdminDashboardPath,
  buildAdminLoginPath,
  buildGuestEntryPath,
  buildGuestPreorderPath,
  buildGuestSessionJoinPath,
  buildStaffDashboardPath,
  buildStaffLoginPath,
  buildVenuePath,
  clearActiveVenueSlug,
  formatQueueSeatingPreference,
  getGuestJourneyStepLabels,
  getRouteVenueSlug,
  getStoredActiveVenueSlug,
  getVenueGuestSurfaceFlags,
  getVenueStaffSurfaceFlags,
  isManualDispatchVenue,
  isQueueOnlyGuestExperience,
  isVenueFeatureEnabled,
  resolveLegacyVenueSlug,
  resolveVenueOpsConfig,
  resolveThemePreset,
  resolveVenueThemeKey,
  shouldLoadVenueBills,
  shouldShowVenueDepositPolicy,
  setActiveVenueSlug,
} from '../../web/modules/venue.js';

describe('frontend venue helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('resolves theme presets and venue feature flags from resolved config', () => {
    expect(resolveThemePreset('craftery')).toMatchObject({
      themeColor: '#1E1A16',
      stylesheet: '/craftery-styles.css',
    });

    const venue = {
      config: {
        brandConfig: { themeKey: 'craftery' },
        opsConfig: {
          queueDispatchMode: 'MANUAL_NOTIFY',
          tableSourceMode: 'MANUAL',
          joinConfirmationMode: 'WEB_ONLY',
          readyNotificationChannels: ['WHATSAPP'],
          guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
          contentMode: 'DEFAULT',
        },
        featureConfig: { staffConsole: true, preOrder: false },
      },
    };

    expect(resolveVenueThemeKey(venue)).toBe('craftery');
    expect(resolveVenueOpsConfig(venue)).toMatchObject({
      queueDispatchMode: 'MANUAL_NOTIFY',
      tableSourceMode: 'MANUAL',
      joinConfirmationMode: 'WEB_ONLY',
      readyNotificationChannels: ['WHATSAPP'],
      readyReminderEnabled: false,
      expiryNotificationEnabled: false,
      guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
      contentMode: 'DEFAULT',
    });
    expect(isManualDispatchVenue(venue)).toBe(true);
    expect(isVenueFeatureEnabled(venue, 'staffConsole')).toBe(true);
    expect(isVenueFeatureEnabled(venue, 'preOrder')).toBe(false);
    expect(formatQueueSeatingPreference('INDOOR')).toBe('Indoor');
    expect(formatQueueSeatingPreference('OUTDOOR')).toBe('Outdoor');

    const publicVenueSummary = {
      brandConfig: { themeKey: 'craftery', displayName: 'The Craftery by Subko' },
      featureConfig: { guestQueue: true, staffConsole: true, adminConsole: true },
    };

    expect(resolveVenueThemeKey(publicVenueSummary)).toBe('craftery');
    expect(isVenueFeatureEnabled(publicVenueSummary, 'guestQueue')).toBe(true);
  });

  it('identifies queue-only venues and hides commerce surfaces for them', () => {
    const venue = {
      brandConfig: { themeKey: 'craftery' },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'MANUAL',
        joinConfirmationMode: 'WEB_ONLY',
      },
      config: {
        featureConfig: {
          guestQueue: true,
          preOrder: false,
          partyShare: false,
          seatedOrdering: false,
          finalPayment: false,
          staffConsole: true,
          adminConsole: true,
        },
      },
    };

    expect(isQueueOnlyGuestExperience(venue)).toBe(true);
    expect(shouldShowVenueDepositPolicy(venue)).toBe(false);
    expect(shouldLoadVenueBills(venue)).toBe(false);
    expect(getGuestJourneyStepLabels(venue)).toEqual(['Join', 'Wait', 'Seated', 'Done']);
    expect(getVenueGuestSurfaceFlags(venue)).toEqual({
      queueOnlyGuestExperience: true,
      manualDispatchMode: true,
      showPreOrderCta: false,
      showInviteAction: false,
      showTableOrdering: false,
      showFinalPayment: false,
      showBillingSignals: false,
    });
    expect(getVenueStaffSurfaceFlags(venue)).toEqual({
      queueOnlyGuestExperience: true,
      manualDispatchMode: true,
      showFlowLog: false,
      showNotifyAction: true,
      showRefundTool: false,
      showOfflineSettleTool: false,
      showBulkClearTool: false,
      showDepositControls: false,
      showBillingSignals: false,
    });
  });

  it('keeps SUBKO wait content mode queue-only and manual-dispatch friendly', () => {
    const venue = {
      brandConfig: { themeKey: 'craftery' },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'MANUAL',
        joinConfirmationMode: 'WEB_ONLY',
        contentMode: 'SUBKO_WAIT_CONTENT',
      },
      config: {
        featureConfig: {
          guestQueue: true,
          preOrder: false,
          partyShare: false,
          seatedOrdering: false,
          finalPayment: false,
          staffConsole: true,
          adminConsole: true,
        },
      },
    };

    expect(resolveVenueOpsConfig(venue)).toMatchObject({
      queueDispatchMode: 'MANUAL_NOTIFY',
      tableSourceMode: 'MANUAL',
      joinConfirmationMode: 'WEB_ONLY',
      contentMode: 'SUBKO_WAIT_CONTENT',
    });
    expect(isQueueOnlyGuestExperience(venue)).toBe(true);
    expect(isManualDispatchVenue(venue)).toBe(true);
  });

  it('persists active venue state and route-derived fallbacks', () => {
    expect(getRouteVenueSlug('/v/the-craftery-koramangala/staff/login')).toBe('the-craftery-koramangala');

    setActiveVenueSlug('the-barrel-room-koramangala');
    expect(getStoredActiveVenueSlug()).toBe('the-barrel-room-koramangala');

    localStorage.setItem('flock_staff_auth', JSON.stringify({ venueSlug: 'the-craftery-koramangala' }));
    expect(resolveLegacyVenueSlug('/staff/login')).toBe('the-craftery-koramangala');

    clearActiveVenueSlug();
    expect(getStoredActiveVenueSlug()).toBeNull();
  });

  it('builds canonical venue-qualified routes', () => {
    expect(buildVenuePath('venue-slug')).toBe('/v/venue-slug');
    expect(buildGuestEntryPath('venue-slug', 'entry_1')).toBe('/v/venue-slug/e/entry_1');
    expect(buildGuestPreorderPath('venue-slug', 'entry_1')).toBe('/v/venue-slug/e/entry_1/preorder');
    expect(buildGuestSessionJoinPath('venue-slug', 'join token')).toBe('/v/venue-slug/session/join%20token');
    expect(buildStaffLoginPath('venue-slug')).toBe('/v/venue-slug/staff/login');
    expect(buildStaffDashboardPath('venue-slug')).toBe('/v/venue-slug/staff/dashboard');
    expect(buildAdminLoginPath('venue-slug')).toBe('/v/venue-slug/admin/login');
    expect(buildAdminDashboardPath('venue-slug')).toBe('/v/venue-slug/admin/dashboard');
  });
});
