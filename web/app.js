import {
  ADMIN_PENDING_PHONE_KEY,
  API_BASE,
  createDefaultPartyPollState,
  EMPTY_VENUE_STATS,
  STAFF_AUTH_KEY,
  STAFF_PENDING_PHONE_KEY,
} from './modules/constants.js';
import {
  buildCartSummary,
  bucketItemsToCart,
  cartToBucketItems,
  menuItemTotal,
  normaliseDraftCart,
  serialiseDraftCart,
} from './modules/cart.js';
import {
  describeClientError,
  extractErrorText,
  isAuthErrorMessage,
  isTransientServiceErrorMessage,
  normaliseApiError,
  renderDependencyWarnings,
} from './modules/errors.js';
import {
  escapeHtml,
  formatMoney,
  formatRelativeStamp,
  renderStatusBadge,
} from './modules/format.js';
import {
  computePartyPollBackoff,
  computeScheduledPartyPollDelay,
} from './modules/polling.js';
import { runHostedPayment } from './modules/payments.js';
import {
  buildStaffDashboardFetchPlan,
  resolveStaffDashboardRefreshMs,
} from './modules/staff-dashboard.js';
import {
  clearGuestEntryId,
  clearGuestSession,
  clearStaffAuth,
  consumeFlash,
  getCart,
  getGuestEntryId,
  getGuestSession,
  getStaffAuth,
  getTableCart,
  normalisePhone,
  setCart,
  setFlash,
  setGuestEntryId,
  setGuestSession,
  setTableCart,
  updateCart,
  updateTableCart,
} from './modules/storage.js';
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
  getVenueStaffSurfaceFlags,
  isManualDispatchVenue,
  isQueueOnlyGuestExperience,
  isWaitlistOnlyVenue,
  getVenueSlugFromStaffAuth,
  isVenueFeatureEnabled,
  resolveLegacyVenueSlug,
  resolveVenueOpsConfig,
  resolveThemePreset,
  resolveVenueDisplayName,
  resolveVenueThemeKey,
  setActiveVenueSlug,
  shouldLoadVenueBills,
  shouldShowVenueDepositPolicy,
} from './modules/venue.js';

function applyThemePreset(themePreset) {
  const fontLinkId = 'flock-theme-fonts';
  const stylesheetId = 'flock-theme-stylesheet';
  const existingFontLink = document.getElementById(fontLinkId);
  const existingStylesheet = document.getElementById(stylesheetId);

  if (themePreset.fonts) {
    if (existingFontLink) {
      existingFontLink.href = themePreset.fonts;
    } else {
      const fontLink = document.createElement('link');
      fontLink.id = fontLinkId;
      fontLink.rel = 'stylesheet';
      fontLink.href = themePreset.fonts;
      document.head.prepend(fontLink);
    }
  } else {
    existingFontLink?.remove();
  }

  if (themePreset.stylesheet) {
    if (existingStylesheet) {
      existingStylesheet.href = themePreset.stylesheet;
    } else {
      const styleLink = document.createElement('link');
      styleLink.id = stylesheetId;
      styleLink.rel = 'stylesheet';
      styleLink.href = themePreset.stylesheet;
      document.head.appendChild(styleLink);
    }
  } else {
    existingStylesheet?.remove();
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.content = themePreset.themeColor;
  }
}

function applyDefaultTheme() {
  applyThemePreset(resolveThemePreset());
}

function applyVenueThemeForVenue(venue) {
  applyThemePreset(resolveThemePreset(resolveVenueThemeKey(venue)));
  if (venue?.slug) {
    setActiveVenueSlug(venue.slug);
  }
}

function resolveActiveVenueSlug() {
  return getRouteVenueSlug() || getVenueSlugFromStaffAuth() || getStoredActiveVenueSlug() || null;
}

applyDefaultTheme();

const appRoot = document.getElementById('app');
const uiState = {
  timerId: null,
  partyPollerId: null,
  nextRenderResetScroll: false,
  guestJoinSubmitting: false,
  guestLeaveSubmitting: false,
  preorderSubmitting: false,
  tableOrderSubmitting: false,
  paymentSubmitting: false,
  guestSessionRestoring: false,
  guestTray: 'menu',
  guestTrayUserChosen: false,
  guestMenuActiveCategory: null,
  activeGuestView: null,
  activePartySessionId: null,
  partySessionMeta: null,
  partyParticipants: [],
  shareContext: null,
  shareSheetOpen: false,
  shareQrLoading: false,
  shareQrKey: '',
  shareQrSrc: '',
  shareLink: '',
  sessionJoinSubmitting: false,
  sessionJoinError: '',
  partyPoll: createDefaultPartyPollState(),
  partyBucket: {
    cart: {},
    serverItems: [],
    lastSyncedAt: 0,
    lastSyncError: '',
    isLoading: false,
    isSyncing: false,
    pendingSyncTimer: null,
    dirty: false,
  },
  staffTab: 'queue',
  staffSeat: {
    otpDigits: ['', '', '', '', '', ''],
    tableId: '',
    prefilledFromQueueId: null,
    suggestedTableId: null,
    entrySummary: null,
    error: '',
    success: '',
    isSubmitting: false,
  },
  staffSeatedBills: {},
  staffLastUpdatedAt: 0,
  staffStats: null,
  staffStatsFetchedAt: 0,
  staffTables: [],
  staffTablesFetchedAt: 0,
  staffRecentTableEvents: [],
  staffRecentTableEventsFetchedAt: 0,
  staffHistory: [],
  staffHistoryLoadedAt: 0,
  staffDashboardRefreshToken: 0,
  adminTab: 'menu',
  adminMenu: {
    categories: [],
    isLoading: false,
    error: '',
  },
  adminContentBlocks: [],
  adminTables: [],
};

document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-nav]');
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute('href') || '/');
    return;
  }

  const seatButton = event.target.closest('[data-prefill-seat]');
  if (seatButton) {
    event.preventDefault();
    prefillStaffSeatFromButton(seatButton);
    return;
  }

  const arriveButton = event.target.closest('[data-mark-arrived]');
  if (arriveButton) {
    event.preventDefault();
    openArrivalSheet({
      entryId: arriveButton.getAttribute('data-mark-arrived'),
      guestName: arriveButton.closest('.q-row')?.querySelector('.q-row-name')?.childNodes?.[0]?.textContent?.trim() || 'Guest',
      initialOtp: arriveButton.getAttribute('data-entry-otp') || '',
      entrySummary: {
        guestName: arriveButton.getAttribute('data-guest-name') || 'Guest',
        partySize: Number(arriveButton.getAttribute('data-party-size') || 0),
        preferenceLabel: arriveButton.getAttribute('data-preference-label') || 'First available',
        guestNotes: arriveButton.getAttribute('data-guest-notes') || '',
        stateLabel: arriveButton.getAttribute('data-entry-state-label') || 'Called',
      },
    });
    return;
  }

  const cancelButton = event.target.closest('[data-cancel-entry]');
  if (cancelButton) {
    event.preventDefault();
    handleStaffQueueMutation({
      key: `cancel-${cancelButton.getAttribute('data-cancel-entry')}`,
      request: () => apiRequest(`/queue/${cancelButton.getAttribute('data-cancel-entry')}`, { method: 'DELETE', auth: true }),
      successMessage: 'Queue entry cancelled.',
    });
    return;
  }

  const notifyButton = event.target.closest('[data-open-notify-sheet]');
  if (notifyButton) {
    event.preventDefault();
    openNotifyWindowSheet({
      entryId: notifyButton.getAttribute('data-open-notify-sheet'),
      guestName: notifyButton.closest('.q-row')?.querySelector('.q-row-name')?.childNodes?.[0]?.textContent?.trim() || 'Guest',
    });
    return;
  }

  const nudgeButton = event.target.closest('[data-nudge-entry]');
  if (nudgeButton) {
    event.preventDefault();
    handleStaffQueueMutation({
      key: `nudge-${nudgeButton.getAttribute('data-nudge-entry')}`,
      request: () => apiRequest(`/queue/${nudgeButton.getAttribute('data-nudge-entry')}/nudge`, { method: 'POST', auth: true }),
      successMessage: 'Reminder sent.',
    });
    return;
  }

  const reorderButton = event.target.closest('[data-reorder-entry]');
  if (reorderButton) {
    event.preventDefault();
    handleStaffQueueMutation({
      key: `reorder-${reorderButton.getAttribute('data-reorder-entry')}-${reorderButton.getAttribute('data-reorder-direction')}`,
      request: () => apiRequest(`/queue/${reorderButton.getAttribute('data-reorder-entry')}/reorder`, {
        method: 'POST',
        auth: true,
        body: { direction: reorderButton.getAttribute('data-reorder-direction') },
      }),
      successMessage: `Guest moved ${String(reorderButton.getAttribute('data-reorder-direction') || '').toLowerCase()}.`,
    });
    return;
  }

  const checkoutButton = event.target.closest('[data-checkout-entry]');
  if (checkoutButton) {
    event.preventDefault();
    handleStaffQueueMutation({
      key: `checkout-${checkoutButton.getAttribute('data-checkout-entry')}`,
      request: () => apiRequest(`/queue/${checkoutButton.getAttribute('data-checkout-entry')}/checkout`, { method: 'POST', auth: true }),
      successMessage: 'Guest checked out.',
    });
    return;
  }

  const flowButton = event.target.closest('[data-view-flow]');
  if (flowButton) {
    event.preventDefault();
    const entryId = flowButton.getAttribute('data-view-flow');
    guardedAction(`flow-${entryId}`, async () => {
      try {
        const events = await apiRequest(`/queue/${entryId}/flow`, { auth: true });
        showFlowLogModal(entryId, events);
      } catch (error) {
        setFlash('red', `Could not load flow log: ${error.message}`);
        await renderStaffDashboard();
      }
    })();
    return;
  }

  const tableButton = event.target.closest('[data-table-status]');
  if (tableButton) {
    event.preventDefault();
    const tableId = tableButton.getAttribute('data-table-id');
    const status = tableButton.getAttribute('data-table-status');
    handleStaffQueueMutation({
      key: `table-${tableId}-${status}`,
      request: () => apiRequest(`/tables/${tableId}/status`, { method: 'PATCH', auth: true, body: { status } }),
      successMessage: 'Table status updated.',
    });
  }
});

window.addEventListener('popstate', () => {
  uiState.nextRenderResetScroll = true;
  renderRoute().catch(handleFatalError);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && uiState.activePartySessionId && !uiState.partyPollerId) {
    // Don't reset backoff here — only reset on a successful poll response
    // This prevents a tab-switch from clearing failure backoff state
    const savedDelay = uiState.partyPoll.nextDelayMs;
    startPartySessionPolling();
    uiState.partyPoll.nextDelayMs = savedDelay;
  }
});

renderRoute().catch(handleFatalError);

function clearTimer() {
  if (uiState.timerId) {
    window.clearTimeout(uiState.timerId);
    uiState.timerId = null;
  }
}

function clearPartySessionPolling() {
  if (uiState.partyPollerId) {
    window.clearTimeout(uiState.partyPollerId);
    uiState.partyPollerId = null;
  }
}

function clearPartyBucketSyncTimer() {
  if (uiState.partyBucket.pendingSyncTimer) {
    window.clearTimeout(uiState.partyBucket.pendingSyncTimer);
    uiState.partyBucket.pendingSyncTimer = null;
  }
}

function resetPartyBucketState() {
  clearPartyBucketSyncTimer();
  uiState.partyBucket = {
    cart: {},
    serverItems: [],
    lastSyncedAt: 0,
    lastSyncError: '',
    isLoading: false,
    isSyncing: false,
    pendingSyncTimer: null,
    dirty: false,
  };
}

function resetActiveGuestShellState() {
  clearPartySessionPolling();
  uiState.activeGuestView = null;
  uiState.activePartySessionId = null;
  uiState.partySessionMeta = null;
  uiState.partyParticipants = [];
  resetPartyBucketState();
}

function scheduleRefresh(fn, delayMs) {
  clearTimer();
  uiState.timerId = window.setTimeout(() => {
    fn().catch(handleBackgroundRefreshError);
  }, delayMs);
}

function navigate(path, options = {}) {
  clearTimer();
  if (window.location.pathname === path) {
    renderRoute().catch(handleFatalError);
    return;
  }
  uiState.nextRenderResetScroll = true;
  if (options.replace) {
    history.replaceState({}, '', path);
  } else {
    history.pushState({}, '', path);
  }
  renderRoute().catch(handleFatalError);
}

function navigateToVenueSelector(options = {}) {
  navigate('/', options);
}

function navigateToStaffLogin(slug, options = {}) {
  if (!slug) {
    navigateToVenueSelector(options);
    return;
  }
  navigate(buildStaffLoginPath(slug), options);
}

function navigateToStaffDashboard(slug, options = {}) {
  if (!slug) {
    navigateToVenueSelector(options);
    return;
  }
  navigate(buildStaffDashboardPath(slug), options);
}

function navigateToAdminLogin(slug, options = {}) {
  if (!slug) {
    navigateToVenueSelector(options);
    return;
  }
  navigate(buildAdminLoginPath(slug), options);
}

function navigateToAdminDashboard(slug, options = {}) {
  if (!slug) {
    navigateToVenueSelector(options);
    return;
  }
  navigate(buildAdminDashboardPath(slug), options);
}

function getCurrentGuestRouteContext() {
  const segments = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments[0] === 'v' && segments[2] === 'e' && segments[1] && segments[3]) {
    return {
      slug: segments[1],
      entryId: segments[3],
    };
  }
  return null;
}

function isStaffDashboardRouteForSlug(slug) {
  return Boolean(slug) && window.location.pathname === buildStaffDashboardPath(slug);
}

function shouldApplyStaffLiveRefresh({ activeSlug, scheduledTab, refreshToken }) {
  return (
    Boolean(getStaffAuth())
    && isStaffDashboardRouteForSlug(activeSlug)
    && uiState.staffTab === scheduledTab
    && uiState.staffDashboardRefreshToken === refreshToken
  );
}

function captureStaffLiveScrollAnchor() {
  const anchors = Array.from(document.querySelectorAll('#staff-live-panel [data-staff-live-anchor]'));
  const visibleAnchor = anchors.find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }) || anchors.find((node) => node.getBoundingClientRect().top >= 0) || null;

  return {
    windowScrollY: window.scrollY,
    anchorId: visibleAnchor?.getAttribute('data-staff-live-anchor') || null,
    anchorTop: visibleAnchor?.getBoundingClientRect().top || 0,
  };
}

function findStaffLiveAnchor(anchorId) {
  if (!anchorId) {
    return null;
  }

  return Array.from(document.querySelectorAll('#staff-live-panel [data-staff-live-anchor]'))
    .find((node) => node.getAttribute('data-staff-live-anchor') === anchorId) || null;
}

function preserveStaffLiveScroll(fn) {
  const scrollState = captureStaffLiveScrollAnchor();
  const restore = () => {
    const anchor = findStaffLiveAnchor(scrollState.anchorId);
    if (anchor) {
      const delta = anchor.getBoundingClientRect().top - scrollState.anchorTop;
      if (Math.abs(delta) > 1) {
        window.scrollTo({
          top: window.scrollY + delta,
          behavior: 'auto',
        });
      }
      return;
    }

    window.scrollTo({
      top: scrollState.windowScrollY,
      behavior: 'auto',
    });
  };

  fn();
  restore();
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 32);
  window.setTimeout(restore, 96);
}

function renderPage(html, title = 'Flock') {
  clearTimer();
  clearPartySessionPolling();
  document.title = title;
  const previousScrollY = window.scrollY;
  const shouldResetScroll = uiState.nextRenderResetScroll;
  uiState.nextRenderResetScroll = false;
  appRoot.innerHTML = html;
  window.scrollTo({
    top: shouldResetScroll ? 0 : previousScrollY,
    behavior: 'auto',
  });
}

const _actionGuards = new Set();
function guardedAction(key, fn) {
  return async function (...args) {
    if (_actionGuards.has(key)) return;
    _actionGuards.add(key);
    try { await fn.apply(this, args); } finally { _actionGuards.delete(key); }
  };
}

function prefillStaffSeatFromButton(button) {
  const otp = button.getAttribute('data-prefill-seat') || '';
  const entryId = button.getAttribute('data-entry-id') || null;
  const suggestedTableId = button.getAttribute('data-suggested-table') || '';
  setSeatOtpFromString(otp);
  uiState.staffSeat.prefilledFromQueueId = entryId;
  uiState.staffSeat.suggestedTableId = suggestedTableId || null;
  uiState.staffSeat.tableId = suggestedTableId || uiState.staffSeat.tableId;
  uiState.staffSeat.entrySummary = {
    entryId,
    guestName: button.getAttribute('data-guest-name') || 'Guest',
    partySize: Number(button.getAttribute('data-party-size') || 0),
    preferenceLabel: button.getAttribute('data-preference-label') || 'First available',
    guestNotes: button.getAttribute('data-guest-notes') || '',
    stateLabel: button.getAttribute('data-entry-state-label') || 'Waiting',
  };
  uiState.staffSeat.error = '';
  uiState.staffSeat.success = entryId ? 'Guest OTP prefilled from the queue. Confirm the table and seat them.' : '';
  uiState.staffTab = 'seat';
  renderStaffDashboard().catch(handleFatalError);
}

function handleStaffQueueMutation({ key, request, successMessage, nextTab = null }) {
  guardedAction(key, async () => {
    try {
      await request();
      uiState.staffHistory = [];
      uiState.staffHistoryLoadedAt = 0;
      if (nextTab) {
        uiState.staffTab = nextTab;
      }
      setFlash('green', successMessage);
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  })();
}

function closeNotifyWindowSheet() {
  document.getElementById('notify-sheet-backdrop')?.remove();
}

function openNotifyWindowSheet({ entryId, guestName }) {
  closeNotifyWindowSheet();
  const backdrop = document.createElement('div');
  backdrop.id = 'notify-sheet-backdrop';
  backdrop.className = 'share-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="share-sheet-panel notify-sheet-panel">
      <div class="share-sheet-handle"></div>
      <div class="section-head share-sheet-head">
        <div class="section-title">Notify ${escapeHtml(guestName || 'guest')}</div>
        <div class="section-sub">Choose the response window for this host-desk call.</div>
      </div>
      <form id="notify-sheet-form">
        <div class="notify-sheet-grid">
          <button class="btn btn-secondary notify-window-btn active" type="button" data-notify-window-option="3">3 min</button>
          <button class="btn btn-secondary notify-window-btn" type="button" data-notify-window-option="5">5 min</button>
          <button class="btn btn-secondary notify-window-btn" type="button" data-notify-window-option="10">10 min</button>
        </div>
        <div class="form-group" style="margin-top:14px;">
          <label class="form-label" for="notify-window-custom">Custom minutes</label>
          <input class="form-input" id="notify-window-custom" type="number" min="1" max="60" placeholder="Optional">
        </div>
        <div class="row" style="margin-top:16px;">
          <button class="btn btn-primary btn-full" type="submit">Send notify</button>
          <button class="btn btn-secondary btn-full" id="notify-sheet-close" type="button">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  let selectedWindowMin = 3;
  backdrop.querySelectorAll('[data-notify-window-option]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedWindowMin = Number(button.getAttribute('data-notify-window-option') || 3);
      backdrop.querySelectorAll('[data-notify-window-option]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
      });
      const customInput = backdrop.querySelector('#notify-window-custom');
      if (customInput) {
        customInput.value = '';
      }
    });
  });

  backdrop.querySelector('#notify-sheet-close')?.addEventListener('click', () => closeNotifyWindowSheet());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeNotifyWindowSheet();
    }
  });

  backdrop.querySelector('#notify-sheet-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const customValue = Number(backdrop.querySelector('#notify-window-custom')?.value || 0);
    const windowMin = Number.isFinite(customValue) && customValue > 0 ? customValue : selectedWindowMin;
    closeNotifyWindowSheet();
    handleStaffQueueMutation({
      key: `notify-${entryId}-${windowMin}`,
      request: () => apiRequest(`/queue/${entryId}/notify`, {
        method: 'POST',
        auth: true,
        body: { windowMin },
      }),
      successMessage: `Guest notified with a ${windowMin} minute window.`,
    });
  });
}

function closeArrivalSheet() {
  document.getElementById('arrival-sheet-backdrop')?.remove();
}

function openArrivalSheet({ entryId, guestName, initialOtp = '', entrySummary = null }) {
  closeArrivalSheet();
  const backdrop = document.createElement('div');
  backdrop.id = 'arrival-sheet-backdrop';
  backdrop.className = 'share-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="share-sheet-panel notify-sheet-panel arrival-sheet-panel">
      <div class="share-sheet-handle"></div>
      <div class="section-head share-sheet-head">
        <div class="section-title">Mark ${escapeHtml(guestName || 'guest')} arrived</div>
        <div class="section-sub">Enter the guest OTP to complete the queue journey. No table selection is needed for this venue.</div>
      </div>
      ${entrySummary ? `
        <div class="seat-context-card" style="margin-bottom:16px;">
          <div class="seat-context-top">
            <div class="seat-context-title">${escapeHtml(entrySummary.guestName || guestName || 'Guest')}</div>
            <div class="seat-context-state">${escapeHtml(entrySummary.stateLabel || 'Called')}</div>
          </div>
          <div class="seat-context-meta">${entrySummary.partySize || 0} pax · ${escapeHtml(entrySummary.preferenceLabel || 'First available')}</div>
          ${entrySummary.guestNotes ? `<div class="seat-context-notes">Notes: ${escapeHtml(entrySummary.guestNotes)}</div>` : ''}
        </div>
      ` : ''}
      <form id="arrival-sheet-form">
        <div class="form-group">
          <label class="form-label" for="arrival-sheet-otp">Guest OTP</label>
          <input class="form-input mono" id="arrival-sheet-otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code" value="${escapeHtml(initialOtp)}" placeholder="123456">
        </div>
        <div class="row" style="margin-top:16px;">
          <button class="btn btn-primary btn-full" type="submit">Mark arrived</button>
          <button class="btn btn-secondary btn-full" id="arrival-sheet-close" type="button">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeArrivalSheet();
    }
  });

  backdrop.querySelector('#arrival-sheet-close')?.addEventListener('click', () => closeArrivalSheet());
  backdrop.querySelector('#arrival-sheet-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const otp = String(backdrop.querySelector('#arrival-sheet-otp')?.value || '').trim();
    if (!otp) {
      return;
    }
    closeArrivalSheet();
    handleStaffQueueMutation({
      key: `arrival-${entryId}-${otp}`,
      request: () => apiRequest('/queue/seat', {
        method: 'POST',
        auth: true,
        body: { entryId, otp },
      }),
      successMessage: 'Guest marked arrived.',
      nextTab: 'history',
    });
  });
}

function handleFatalError(error) {
  const message = describeClientError(error);
  renderPage(renderShell({
    pill: 'System',
    body: `
      <div class="section-head">
        <div class="section-title">Something went wrong</div>
        <div class="section-sub">${escapeHtml(message)}</div>
      </div>
      <div class="card">
        <div class="card-sub">The frontend hit an unrecoverable error while loading this route.</div>
        <div class="row">
          <a class="btn btn-primary" data-nav href="/">Return home</a>
          <button class="btn btn-secondary" id="retry-page">Retry</button>
        </div>
      </div>
    `,
  }));

  document.getElementById('retry-page')?.addEventListener('click', () => {
    renderRoute().catch(handleFatalError);
  });
}

function handleBackgroundRefreshError(error) {
  const message = describeClientError(error);
  console.warn('Background refresh failed:', message);

  const staleBanners = document.querySelectorAll('[data-transient-error="true"]');
  staleBanners.forEach((node) => node.remove());

  const shell = appRoot.querySelector('.app-shell');
  if (shell) {
    const banner = document.createElement('div');
    banner.className = 'alert alert-red';
    banner.dataset.transientError = 'true';
    banner.style.marginBottom = '18px';
    banner.innerHTML = `<div>${escapeHtml(message)} Retrying automatically.</div>`;
    shell.prepend(banner);
  }

  scheduleRefresh(() => renderRoute(), 5000);
}

async function renderRoute() {
  closeShareSheet({ keepState: false });
  resetActiveGuestShellState();
  const segments = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const routeVenueSlug = getRouteVenueSlug(window.location.pathname);
  if (routeVenueSlug) {
    setActiveVenueSlug(routeVenueSlug);
  }

  if (segments.length === 0) {
    await renderHome();
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments.length === 2) {
    await renderVenueLanding(segments[1]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'session' && segments[3] && segments.length === 4) {
    await renderGuestSessionJoin(segments[1], decodeURIComponent(segments[3]));
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'e' && segments[3] && segments[4] === 'preorder' && segments.length === 5) {
    await renderPreorder(segments[1], segments[3]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'e' && segments[3] && segments.length === 4) {
    await renderGuestEntry(segments[1], segments[3]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'staff' && segments[3] === 'login' && segments.length === 4) {
    await renderStaffLogin(segments[1]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'staff' && segments[3] === 'dashboard' && segments.length === 4) {
    await renderStaffDashboard(segments[1]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'admin' && segments[3] === 'login' && segments.length === 4) {
    await renderAdminLogin(segments[1]);
    return;
  }

  if (segments[0] === 'v' && segments[1] && segments[2] === 'admin' && segments[3] === 'dashboard' && segments.length === 4) {
    await renderAdminDashboard(segments[1]);
    return;
  }

  if (segments[0] === 'staff' && segments[1] === 'login') {
    redirectLegacyOperatorRoute('staff', 'login');
    return;
  }

  if (segments[0] === 'staff' && segments[1] === 'dashboard') {
    redirectLegacyOperatorRoute('staff', 'dashboard');
    return;
  }

  if (segments[0] === 'admin' && segments[1] === 'login') {
    redirectLegacyOperatorRoute('admin', 'login');
    return;
  }

  if (segments[0] === 'admin' && segments[1] === 'dashboard') {
    redirectLegacyOperatorRoute('admin', 'dashboard');
    return;
  }

  applyDefaultTheme();
  renderPage(renderShell({
    pill: 'Flock',
    body: `
      <div class="section-head">
        <div class="section-title">Route not found</div>
        <div class="section-sub">This path is not part of the closed pilot build.</div>
      </div>
      <a class="btn btn-primary" data-nav href="/">Go to landing</a>
    `,
  }), 'Flock | Missing');
}

function redirectLegacyOperatorRoute(kind, view) {
  const slug = resolveLegacyVenueSlug();
  if (!slug) {
    navigate('/', { replace: true });
    return;
  }

  if (kind === 'staff') {
    navigate(view === 'dashboard' ? buildStaffDashboardPath(slug) : buildStaffLoginPath(slug), { replace: true });
    return;
  }

  navigate(view === 'dashboard' ? buildAdminDashboardPath(slug) : buildAdminLoginPath(slug), { replace: true });
}

function renderVenueSelectorCard(venue) {
  const actions = [];

  if (isVenueFeatureEnabled(venue, 'guestQueue')) {
    actions.push(`<a class="btn btn-primary btn-sm" data-nav href="${buildVenuePath(venue.slug)}">Guest flow</a>`);
  }

  if (isVenueFeatureEnabled(venue, 'staffConsole')) {
    actions.push(`<a class="btn btn-secondary btn-sm" data-nav href="${buildStaffLoginPath(venue.slug)}">Staff</a>`);
  }

  if (isVenueFeatureEnabled(venue, 'adminConsole')) {
    actions.push(`<a class="btn btn-secondary btn-sm" data-nav href="${buildAdminLoginPath(venue.slug)}">Admin</a>`);
  }

  return `
    <div class="role-card" style="cursor:default">
      <span class="role-card-icon">${escapeHtml(venue.city || 'Venue')}</span>
      <div class="role-card-title">${escapeHtml(venue.brandConfig.displayName || venue.name)}</div>
      <div class="role-card-desc">${escapeHtml(venue.brandConfig.tagline || 'Venue experience')}</div>
      <div class="muted" style="margin-bottom:14px;">${escapeHtml(venue.name)}${venue.isQueueOpen ? ' · Queue open' : ' · Queue closed'}</div>
      <div class="row" style="margin-top:auto; flex-wrap:wrap;">${actions.length ? actions.join('') : '<span class="muted">No public modules enabled.</span>'}</div>
    </div>
  `;
}

async function renderHome() {
  applyDefaultTheme();
  const venues = await apiRequest('/venues/public');

  renderPage(`
    <main id="landing">
      <div class="brand">
        <div class="brand-name">fl<em>o</em>ck</div>
        <div class="brand-tag">Select a venue and open only the modules that venue actually uses.</div>
      </div>
      <div class="role-cards">
        ${venues.length ? venues.map((venue) => renderVenueSelectorCard(venue)).join('') : `
          <div class="role-card" style="cursor:default">
            <span class="role-card-icon">Setup</span>
            <div class="role-card-title">No venues available</div>
            <div class="role-card-desc">Create or seed a venue first, then the selector will expose the enabled modules here.</div>
            <div class="role-card-cta">•</div>
          </div>
        `}
      </div>
    </main>
  `, 'Flock');
}

async function renderVenueLanding(slug) {
  const venue = await apiRequest(`/venues/${slug}`);
  applyVenueThemeForVenue(venue);
  const activeEntryId = getGuestEntryId(slug);
  const flash = consumeFlash();
  const guestQueueEnabled = isVenueFeatureEnabled(venue, 'guestQueue');
  const queueOnlyGuestExperience = isQueueOnlyGuestExperience(venue);
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  const manualDispatchEnabled = isManualDispatchVenue(venue);
  const canContinueEntry = guestQueueEnabled && venue.config?.uiConfig?.showContinueEntry && activeEntryId;
  const venueName = resolveVenueDisplayName(venue);
  const venueSummary = shouldShowVenueDepositPolicy(venue)
    ? `${venue.address}, ${venue.city}. Deposit default: ${venue.depositPercent}%.`
    : resolveVenueLandingSummary(venue);
  const guestJoinTitle = queueOnlyGuestExperience || waitlistOnlyVenue ? 'Join the waitlist' : 'Join the queue';
  const guestJoinAction = queueOnlyGuestExperience || waitlistOnlyVenue ? 'Join waitlist' : 'Join queue';

  renderPage(`
    <main id="landing">
      <div class="brand">
        <div class="brand-name">fl<em>o</em>ck</div>
        <div class="brand-tag">${escapeHtml(venue.config?.brandConfig?.tagline || (waitlistOnlyVenue ? 'Waitlist · host call · live updates' : manualDispatchEnabled ? 'Waitlist · host nudge · live updates' : 'Queue · Pre-order · Pay'))}</div>
      </div>
      <div class="role-cards">
        <div class="role-card" style="cursor:default">
          <span class="role-card-icon">Venue</span>
          <div class="role-card-title">${escapeHtml(venueName)}</div>
          <div class="role-card-desc">${escapeHtml(venueSummary)}</div>
          <div class="role-card-cta">${venue.isQueueOpen ? 'Open' : 'Closed'}</div>
        </div>
        <div class="role-card" style="cursor:default; max-width:360px; min-width:300px;">
          <div class="role-card-title">${guestQueueEnabled ? guestJoinTitle : 'Guest queue unavailable'}</div>
          <div class="role-card-desc" style="margin-bottom:16px;">${escapeHtml(resolveGuestJoinCopy(venue))}</div>
          ${flash ? renderInlineFlash(flash) : ''}
          ${canContinueEntry ? `
            <div class="alert alert-blue">
              <div>Active queue entry found for this device.</div>
            </div>
            <a class="btn btn-secondary btn-full" data-nav href="${buildGuestEntryPath(slug, activeEntryId)}" style="margin-bottom:14px;">Continue existing entry</a>
          ` : ''}
          ${guestQueueEnabled ? `
            <form id="join-form">
              <div class="form-group">
                <label class="form-label" for="guest-name">Guest name</label>
                <input class="form-input" id="guest-name" required maxlength="80" placeholder="Asha">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="guest-phone">Phone</label>
                  <input class="form-input" id="guest-phone" required placeholder="9876543210" inputmode="numeric">
                </div>
                <div class="form-group">
                  <label class="form-label" for="party-size">Party size</label>
                  <input class="form-input" id="party-size" required type="number" min="1" max="20" value="2">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="guest-seating-preference">Seating preference</label>
                  <select class="form-select" id="guest-seating-preference">
                    <option value="FIRST_AVAILABLE">First available</option>
                    <option value="INDOOR">Indoor</option>
                    <option value="OUTDOOR">Outdoor</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="guest-notes">Guest notes</label>
                  <textarea class="form-input guest-notes-input" id="guest-notes" maxlength="240" rows="3" placeholder="Optional notes for the host desk."></textarea>
                </div>
              </div>
              <button class="btn btn-primary btn-full" type="submit" ${venue.isQueueOpen ? '' : 'disabled'}>
                ${venue.isQueueOpen ? guestJoinAction : 'Queue closed'}
              </button>
            </form>
          ` : `
            <div class="alert alert-blue">
              <div>This venue is configured without the guest queue module. Use the venue selector to enter any enabled staff or admin tools instead.</div>
            </div>
            <div class="row" style="flex-wrap:wrap;">
              ${isVenueFeatureEnabled(venue, 'staffConsole') ? `<a class="btn btn-secondary" data-nav href="${buildStaffLoginPath(slug)}">Open staff console</a>` : ''}
              ${isVenueFeatureEnabled(venue, 'adminConsole') ? `<a class="btn btn-secondary" data-nav href="${buildAdminLoginPath(slug)}">Open admin console</a>` : ''}
            </div>
          `}
        </div>
      </div>
    </main>
  `, `Flock | ${venueName}`);

  document.getElementById('join-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uiState.guestJoinSubmitting) return;

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    uiState.guestJoinSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Joining...';
    }

    const name = document.getElementById('guest-name').value.trim();
    const phone = normalisePhone(document.getElementById('guest-phone').value);
    const partySize = Number(document.getElementById('party-size').value);
    const seatingPreference = document.getElementById('guest-seating-preference')?.value || 'FIRST_AVAILABLE';
    const guestNotes = document.getElementById('guest-notes')?.value.trim() || '';

    try {
      const entry = await apiRequest('/queue', {
        method: 'POST',
        body: {
          venueId: venue.id,
          guestName: name,
          guestPhone: phone,
          partySize,
          seatingPreference,
          guestNotes: guestNotes || undefined,
        },
      });
      setGuestEntryId(slug, entry.id);
      setGuestSession({
        entryId: entry.id,
        venueSlug: slug,
        venueId: venue.id,
        guestToken: entry.guestToken,
        otp: entry.otp,
      });
      setFlash('green', `Joined queue. OTP ${entry.otp} issued.`);
      navigate(buildGuestEntryPath(slug, entry.id));
    } catch (error) {
      setFlash('red', error.message);
      await renderVenueLanding(slug);
    } finally {
      uiState.guestJoinSubmitting = false;
    }
  });
}

async function renderGuestEntry(slug, entryId) {
  const guestSession = getGuestSession(entryId);
  const venue = await apiRequest(`/venues/${slug}`);
  applyVenueThemeForVenue(venue);
  const venueName = resolveVenueDisplayName(venue);
  const partyShareEnabled = isVenueFeatureEnabled(venue, 'partyShare');
  const finalPaymentEnabled = isVenueFeatureEnabled(venue, 'finalPayment');
  const queueOnlyGuestExperience = isQueueOnlyGuestExperience(venue);
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  const leaveWaitlist = async (options = {}) => {
    const {
      serverSide = true,
      successMessage = 'You left the waitlist.',
    } = options;

    if (uiState.guestLeaveSubmitting) {
      return;
    }

    uiState.guestLeaveSubmitting = true;
    try {
      const activeSession = getGuestSession(entryId);
      if (serverSide && activeSession?.guestToken) {
        await apiRequest(`/queue/${entryId}/leave`, {
          method: 'DELETE',
          auth: 'guest',
          guestToken: activeSession.guestToken,
        });
      }

      clearGuestSession(entryId);
      clearGuestEntryId(slug);
      setTableCart(entryId, {});
      setFlash('green', successMessage);
      navigate(buildVenuePath(slug));
    } catch (error) {
      setFlash('red', error.message || 'Unable to leave the waitlist right now.');
      await renderGuestEntry(slug, entryId);
    } finally {
      uiState.guestLeaveSubmitting = false;
    }
  };

  if (!guestSession?.guestToken) {
    const flash = consumeFlash();
    renderPage(renderShell({
      pill: 'Guest',
      body: `
        ${flash ? renderInlineFlash(flash) : ''}
        <div class="card">
          <div class="card-title">Restore your guest session</div>
          <div class="card-sub">This device no longer has the active guest session token. Enter the seating OTP once to recover the queue entry securely.</div>
          <form id="recover-guest-session-form">
            <div class="form-group">
                <label class="form-label" for="guest-session-otp">Seating OTP</label>
                <input class="form-input" id="guest-session-otp" required maxlength="6" placeholder="123456">
              </div>
              <button class="btn btn-secondary btn-full" type="submit">Restore session</button>
          </form>
          <div style="margin-top:14px; border-top:1px solid var(--border); padding-top:14px;">
            <div class="card-sub" style="margin-bottom:10px;">Wrong device or stale state? Clear the saved session on this device and start again.</div>
            <button class="btn btn-ghost btn-full" id="clear-guest-session-btn" type="button">Clear saved session</button>
          </div>
        </div>
      `,
      right: `<a class="btn btn-secondary btn-sm" data-nav href="${buildVenuePath(slug)}">Venue</a>`,
    }), `Flock | ${venueName}`);

    document.getElementById('recover-guest-session-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (uiState.guestSessionRestoring) return;

      const submitButton = event.currentTarget.querySelector('button[type="submit"]');
      uiState.guestSessionRestoring = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Restoring...';
      }

      const otp = document.getElementById('guest-session-otp').value.trim();

      try {
        const session = await apiRequest(`/queue/${entryId}/session`, {
          method: 'POST',
          body: { otp },
        });
        setGuestSession({
          entryId,
          venueSlug: slug,
          venueId: venue.id,
          guestToken: session.guestToken,
          otp,
        });
        setFlash('green', 'Guest session restored.');
        await renderGuestEntry(slug, entryId);
      } catch (error) {
        setFlash('red', error.message);
        await renderGuestEntry(slug, entryId);
      } finally {
        uiState.guestSessionRestoring = false;
      }
    });

    document.getElementById('clear-guest-session-btn')?.addEventListener('click', () => {
      leaveWaitlist({
        serverSide: false,
        successMessage: 'Saved session cleared from this device.',
      }).catch(handleFatalError);
    });

    return;
  }

  let entry;
  try {
    entry = await apiRequest(`/queue/${entryId}`, {
      auth: 'guest',
      guestToken: guestSession.guestToken,
    });
  } catch (error) {
    if (/Unauthorized|expired|invalid/i.test(error.message)) {
      clearGuestSession(entryId);
      setFlash('amber', 'Your guest session expired on this device. Restore it with the seating OTP.');
      await renderGuestEntry(slug, entryId);
      return;
    }

    renderPage(renderShell({
      pill: 'Guest',
      body: `
        <div class="section-head">
          <div class="section-title">Guest session unavailable</div>
          <div class="section-sub">${escapeHtml(error.message || 'We could not refresh this table session right now.')}</div>
        </div>
        <div class="card">
          <div class="card-sub">Your guest token is still kept on this device. This looks like a temporary server issue, not a lost session.</div>
          <div class="row">
            <button class="btn btn-primary" id="retry-guest-route" type="button">Retry</button>
            <a class="btn btn-secondary" data-nav href="${buildVenuePath(slug)}">Venue</a>
          </div>
        </div>
      `,
      right: `<a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>`,
    }), `Flock | ${venueName}`);

    document.getElementById('retry-guest-route')?.addEventListener('click', () => {
      renderGuestEntry(slug, entryId).catch(handleFatalError);
    });
    return;
  }

  setGuestEntryId(slug, entryId);
  if (entry.status === 'SEATED' && partyShareEnabled) {
    await loadPartySessionState(entry, guestSession);
  } else {
    uiState.activePartySessionId = null;
    uiState.partySessionMeta = null;
    uiState.partyParticipants = [];
    resetPartyBucketState();
  }
  const flash = consumeFlash();
  const tableCart = getTableCart(entryId);
  const tableCartSummary = buildCartSummary(venue.menuCategories || [], tableCart);
  const bill = shouldLoadVenueBills(venue) && (entry.status === 'SEATED' || entry.status === 'COMPLETED')
    ? await apiRequest(`/orders/bill/${entryId}`, {
      auth: 'guest',
      guestToken: guestSession.guestToken,
    }).catch(() => null)
    : null;

  const hasDeposit = entry.depositPaid > 0;
  const activeStep = queueOnlyGuestExperience
    ? (entry.status === 'WAITING' ? 2 : 3)
    : entry.status === 'COMPLETED'
      ? 5
      : entry.status === 'SEATED'
        ? 4
        : hasDeposit
          ? 2
          : 1;
  const stepLabels = getGuestJourneyStepLabels(venue);

  const waitContentHtml = renderSubkoWaitContentBlock(venue, entry);
  const body = entry.status === 'SEATED' && !queueOnlyGuestExperience && !waitlistOnlyVenue
    ? `
      ${renderStepBar(activeStep, stepLabels)}
      ${flash ? renderInlineFlash(flash) : ''}
      ${renderSeatedGuestShell({ entry, venue, bill, guestSession })}
    `
    : `
      <div id="guest-live-banner">${entry.status === 'NOTIFIED' ? `<div class="banner">${queueOnlyGuestExperience ? 'Called' : `Table ready${entry.table?.label ? ` · ${escapeHtml(entry.table.label)}` : ''}`} · Show your OTP to staff now</div>` : ''}</div>
      <div id="guest-live-stepbar">${renderStepBar(activeStep, stepLabels)}</div>
      ${flash ? renderInlineFlash(flash) : ''}
      <div id="guest-live-primary">
        <div id="guest-live-hero">${renderGuestStateHero(entry, guestSession, venue)}</div>
        <div id="guest-live-cards">${renderGuestStateCards({ slug, entry, venue, bill, guestSession, tableCartSummary })}</div>
        ${waitContentHtml ? `<div id="guest-live-content">${waitContentHtml}</div>` : ''}
      </div>
    `;

  const showShareAction = ['WAITING', 'NOTIFIED', 'SEATED'].includes(entry.status)
    && partyShareEnabled
    && Boolean(entry.partySession?.joinToken);

  renderPage(renderShell({
    pill: 'Guest',
    body,
    right: `
      ${showShareAction ? '<button class="btn btn-secondary btn-sm" id="guest-invite-cta" type="button">Invite others</button>' : ''}
      <a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>
    `,
  }), `Flock | ${venueName}`);

  if (showShareAction) {
    preloadPartyInviteQr(slug, entry.partySession.joinToken, 240);
    document.getElementById('guest-invite-cta')?.addEventListener('click', () => {
      openShareSheet({ slug, joinToken: entry.partySession.joinToken });
    });
  }

  if (entry.status === 'SEATED' && !queueOnlyGuestExperience) {
    if (!['menu', 'bucket', 'ordered'].includes(uiState.guestTray)) {
      uiState.guestTray = venue.config?.uiConfig?.defaultGuestTray || 'menu';
    }
    if (!uiState.guestTrayUserChosen) {
      uiState.guestTray = venue.config?.uiConfig?.defaultGuestTray || 'menu';
    }
    mountSeatedGuestExperience({ slug, entry, venue, bill, guestSession });
    return;
  }

  document.getElementById('preorder-cta')?.addEventListener('click', () => {
    navigate(buildGuestPreorderPath(slug, entryId));
  });

  document.getElementById('leave-waitlist-cta')?.addEventListener('click', () => {
    leaveWaitlist().catch(handleFatalError);
  });

  document.getElementById('final-pay-cta')?.addEventListener('click', async () => {
    if (!finalPaymentEnabled) return;
    if (uiState.paymentSubmitting) return;

    const button = document.getElementById('final-pay-cta');
    uiState.paymentSubmitting = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparing payment...';
    }

    try {
      await runHostedPayment({
        title: 'Flock final bill',
        initiatePath: '/payments/final/initiate',
        initiateBody: {
          venueId: venue.id,
          queueEntryId: entryId,
        },
        capturePath: '/payments/final/capture',
        prefill: {
          name: entry.guestName,
          contact: entry.guestPhone,
        },
        auth: 'guest',
        guestToken: guestSession.guestToken,
        apiRequest,
      });
      setFlash('green', 'Final payment captured.');
      await renderGuestEntry(slug, entryId);
    } catch (error) {
      setFlash('red', error.message);
      await renderGuestEntry(slug, entryId);
    } finally {
      uiState.paymentSubmitting = false;
    }
  });

  document.getElementById('guest-done-cta')?.addEventListener('click', () => {
    clearGuestSession(entryId);
    clearGuestEntryId(slug);
    setTableCart(entryId, {});
    navigate(buildVenuePath(slug));
  });

  document.getElementById('recover-guest-session-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uiState.guestSessionRestoring) return;

    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    uiState.guestSessionRestoring = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Restoring...';
    }

    const otp = document.getElementById('guest-session-otp').value.trim();

    try {
      const session = await apiRequest(`/queue/${entryId}/session`, {
        method: 'POST',
        body: { otp },
      });
      setGuestSession({
        entryId,
        venueSlug: slug,
        venueId: venue.id,
        guestToken: session.guestToken,
        otp: guestSession?.otp || otp,
      });
      setFlash('green', 'Guest ordering session restored.');
      await renderGuestEntry(slug, entryId);
    } catch (error) {
      setFlash('red', error.message);
      await renderGuestEntry(slug, entryId);
    } finally {
      uiState.guestSessionRestoring = false;
    }
  });

  if (['WAITING', 'NOTIFIED'].includes(entry.status)) {
    if (!uiState.shareSheetOpen) {
      scheduleRefresh(() => refreshGuestLiveView(slug, entryId), 5000);
    }
  }
}

async function refreshGuestLiveView(slug, entryId) {
  const routeContext = getCurrentGuestRouteContext();
  if (!routeContext || routeContext.slug !== slug || routeContext.entryId !== entryId) {
    return;
  }

  const guestSession = getGuestSession(entryId);
  if (!guestSession?.guestToken) {
    await renderGuestEntry(slug, entryId);
    return;
  }

  const [venue, entry] = await Promise.all([
    apiRequest(`/venues/${slug}`),
    apiRequest(`/queue/${entryId}`, {
      auth: 'guest',
      guestToken: guestSession.guestToken,
    }),
  ]);

  if (!isQueueOnlyGuestExperience(venue) || !['WAITING', 'NOTIFIED'].includes(entry.status)) {
    await renderGuestEntry(slug, entryId);
    return;
  }

  const heroHost = document.getElementById('guest-live-hero');
  const cardsHost = document.getElementById('guest-live-cards');
  const contentHost = document.getElementById('guest-live-content');
  const stepbarHost = document.getElementById('guest-live-stepbar');
  const bannerHost = document.getElementById('guest-live-banner');

  if (!heroHost || !cardsHost || !contentHost || !stepbarHost || !bannerHost) {
    await renderGuestEntry(slug, entryId);
    return;
  }

  applyVenueThemeForVenue(venue);

  const activeStep = entry.status === 'WAITING' ? 2 : 3;
  const stepLabels = getGuestJourneyStepLabels(venue);

  bannerHost.innerHTML = entry.status === 'NOTIFIED'
    ? `<div class="banner">${isWaitlistOnlyVenue(venue) ? 'Called' : `Table ready${entry.table?.label ? ` · ${escapeHtml(entry.table.label)}` : ''}`} · Show your OTP to staff now</div>`
    : '';
  stepbarHost.innerHTML = renderStepBar(activeStep, stepLabels);
  heroHost.innerHTML = renderGuestStateHero(entry, guestSession, venue);
  cardsHost.innerHTML = renderGuestStateCards({
    slug,
    entry,
    venue,
    bill: null,
    guestSession,
    tableCartSummary: null,
  });
  if (contentHost) {
    const waitContentHtml = renderSubkoWaitContentBlock(venue, entry);
    contentHost.innerHTML = waitContentHtml;
  }

  document.getElementById('leave-waitlist-cta')?.addEventListener('click', () => {
    const currentSession = getGuestSession(entryId);
    if (!currentSession?.guestToken || uiState.guestLeaveSubmitting) {
      return;
    }
    uiState.guestLeaveSubmitting = true;
    apiRequest(`/queue/${entryId}/leave`, {
      method: 'DELETE',
      auth: 'guest',
      guestToken: currentSession.guestToken,
    }).then(() => {
      clearGuestSession(entryId);
      clearGuestEntryId(slug);
      setTableCart(entryId, {});
      setFlash('green', 'You left the waitlist.');
      navigate(buildVenuePath(slug));
    }).catch(async (error) => {
      uiState.guestLeaveSubmitting = false;
      setFlash('red', error.message || 'Unable to leave the waitlist right now.');
      await renderGuestEntry(slug, entryId);
    });
  });

  scheduleRefresh(() => refreshGuestLiveView(slug, entryId), 5000);
}

async function renderGuestSessionJoin(slug, joinToken) {
  const venue = await apiRequest(`/venues/${slug}`);
  applyVenueThemeForVenue(venue);
  const venueName = resolveVenueDisplayName(venue);
  const flash = consumeFlash();

  if (!isVenueFeatureEnabled(venue, 'partyShare')) {
    renderPage(renderShell({
      pill: 'Join',
      body: `
        <div class="card join-session-card">
          <div class="card-title">Shared table sessions unavailable</div>
          <div class="card-sub">${escapeHtml(venueName)} is currently configured without the shared party module.</div>
          <a class="btn btn-primary btn-full" data-nav href="${buildVenuePath(slug)}">Back to venue</a>
        </div>
      `,
      right: `<a class="btn btn-secondary btn-sm" data-nav href="${buildVenuePath(slug)}">Venue</a>`,
    }), `Flock | ${venueName}`);
    return;
  }

  renderPage(renderShell({
    pill: 'Join',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      <div class="card join-session-card">
        <div class="card-title">Join this table session</div>
        <div class="card-sub">Enter your name to join the active table and order with the group.</div>
        <form id="join-party-session-form">
          <div class="form-group">
            <label class="form-label" for="join-display-name">Your name</label>
            <input class="form-input" id="join-display-name" required maxlength="48" placeholder="Aditi">
          </div>
          <div id="join-party-session-error"></div>
          <div class="row">
            <a class="btn btn-secondary" data-nav href="${buildVenuePath(slug)}">Back to venue</a>
            <button class="btn btn-primary" id="join-party-session-submit" type="submit">
              ${uiState.sessionJoinSubmitting ? 'Joining...' : 'Join table'}
            </button>
          </div>
        </form>
      </div>
    `,
    right: `<a class="btn btn-secondary btn-sm" data-nav href="${buildVenuePath(slug)}">Venue</a>`,
  }), `Flock | Join ${venueName}`);

  document.getElementById('join-party-session-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uiState.sessionJoinSubmitting) return;

    const nameInput = document.getElementById('join-display-name');
    const errorHost = document.getElementById('join-party-session-error');
    const submitButton = document.getElementById('join-party-session-submit');
    const displayName = nameInput?.value.trim();

    if (!displayName) {
      if (errorHost) {
        errorHost.innerHTML = renderInlineFlash({ kind: 'red', message: 'Enter your name to continue.' });
      }
      return;
    }

    uiState.sessionJoinSubmitting = true;
    uiState.sessionJoinError = '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Joining...';
    }
    if (errorHost) {
      errorHost.innerHTML = '';
    }

    try {
      const payload = await apiRequest(`/party-sessions/join/${encodeURIComponent(joinToken)}`, {
        method: 'POST',
        body: { displayName },
      });
      const existingSession = getGuestSession(payload.queueEntryId);
      setGuestEntryId(slug, payload.queueEntryId);
      setGuestSession({
        entryId: payload.queueEntryId,
        venueSlug: slug,
        venueId: payload.venueId,
        guestToken: payload.guestToken,
        otp: existingSession?.otp || '',
        isPartyJoiner: true,
        partySessionId: payload.sessionId,
        participantId: payload.participant?.id || null,
      });
      setFlash('green', `Joined ${venueName}.`);
      navigate(buildGuestEntryPath(slug, payload.queueEntryId));
    } catch (error) {
      const message = /invalid|expired/i.test(error.message)
        ? 'This invite is invalid or expired.'
        : error.message;
      uiState.sessionJoinError = message;
      if (errorHost) {
        errorHost.innerHTML = renderInlineFlash({ kind: 'red', message });
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Join table';
      }
    } finally {
      uiState.sessionJoinSubmitting = false;
    }
  });
}

function buildPartyInviteUrl(slug, joinToken) {
  return `${window.location.origin}${buildGuestSessionJoinPath(slug, joinToken)}`;
}

function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      if (!ok) {
        reject(new Error('Clipboard unavailable'));
        return;
      }
      resolve();
    } catch (error) {
      document.body.removeChild(input);
      reject(error);
    }
  });
}

async function copyPartyInviteLink(slug, joinToken) {
  const inviteUrl = buildPartyInviteUrl(slug, joinToken);
  await copyToClipboard(inviteUrl);
  setFlash('green', 'Invite link copied');
  uiState.shareLink = inviteUrl;
}

function buildInviteQrImageUrl(inviteUrl, size = 240) {
  return `${API_BASE}/share/qr?data=${encodeURIComponent(inviteUrl)}&size=${size}`;
}

function preloadPartyInviteQr(slug, joinToken, size = 240) {
  const inviteUrl = buildPartyInviteUrl(slug, joinToken);
  const qrUrl = buildInviteQrImageUrl(inviteUrl, size);

  if (uiState.shareQrKey === inviteUrl && uiState.shareQrSrc === qrUrl) {
    return qrUrl;
  }

  uiState.shareQrKey = inviteUrl;
  uiState.shareQrSrc = qrUrl;

  const image = new Image();
  image.decoding = 'async';
  image.loading = 'eager';
  image.src = qrUrl;

  return qrUrl;
}

async function renderPartyInviteQr(targetEl, inviteUrl, size = 240) {
  if (!targetEl) return;

  uiState.shareQrLoading = true;
  targetEl.innerHTML = '<div class="share-qr-loading">Loading QR…</div>';

  try {
    const image = new Image();
    image.className = 'share-qr-image';
    image.alt = 'Invite QR code';
    image.decoding = 'async';
    image.loading = 'lazy';
    image.addEventListener('load', () => {
      uiState.shareQrLoading = false;
      targetEl.innerHTML = '';
      targetEl.appendChild(image);
    }, { once: true });
    image.addEventListener('error', () => {
      uiState.shareQrLoading = false;
      targetEl.innerHTML = '<div class="alert alert-amber"><div>QR is unavailable right now, but the invite link still works.</div></div>';
    }, { once: true });
    image.src = uiState.shareQrSrc || buildInviteQrImageUrl(inviteUrl, size);
  } catch (_error) {
    uiState.shareQrLoading = false;
    targetEl.innerHTML = '<div class="alert alert-amber"><div>QR is unavailable right now, but the invite link still works.</div></div>';
  }
}

async function sharePartyInvite(slug, joinToken) {
  const inviteUrl = buildPartyInviteUrl(slug, joinToken);
  if (typeof navigator.share !== 'function') {
    throw new Error('Native sharing is unavailable on this browser');
  }

  await navigator.share({
    title: 'Join this Flock table session',
    text: 'Join this table session and order with the group.',
    url: inviteUrl,
  });
}

function renderShareSheetContent() {
  const inviteUrl = uiState.shareLink;
  const canUseNativeShare = typeof navigator.share === 'function';

  return `
    <div class="share-sheet-panel">
      <div class="share-sheet-handle"></div>
      <div class="section-head share-sheet-head">
        <div class="section-title">Invite others</div>
        <div class="section-sub">Invite others to join this table session.</div>
      </div>
      <div class="share-link-row">
        <div class="share-link-preview">${escapeHtml(inviteUrl)}</div>
        <button class="btn btn-secondary" id="share-copy-link" type="button">Copy</button>
      </div>
      <div class="share-qr-panel">
        <div class="share-qr-frame" id="share-qr-inline-host"></div>
      </div>
      ${canUseNativeShare ? `
        <button class="btn btn-secondary btn-full" id="share-native-share" type="button">Share</button>
      ` : ''}
      <button class="btn btn-secondary btn-full" id="share-close-sheet" type="button">Close</button>
    </div>
  `;
}

function mountShareSheet() {
  const existingBackdrop = document.getElementById('share-sheet-backdrop');
  existingBackdrop?.remove();

  if (!uiState.shareSheetOpen || !uiState.shareContext) {
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'share-sheet-backdrop';
  backdrop.className = 'share-sheet-backdrop';
  backdrop.innerHTML = renderShareSheetContent();
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeShareSheet();
    }
  });

  backdrop.querySelector('#share-close-sheet')?.addEventListener('click', () => closeShareSheet());
  backdrop.querySelector('#share-copy-link')?.addEventListener('click', async () => {
    try {
      await copyPartyInviteLink(uiState.shareContext.slug, uiState.shareContext.joinToken);
    } catch (_error) {
      backdrop.querySelector('.share-sheet-head')?.insertAdjacentHTML(
        'afterend',
        renderInlineFlash({ kind: 'amber', message: 'Copy failed. Select the invite link manually.' }),
      );
    }
  });
  backdrop.querySelector('#share-native-share')?.addEventListener('click', async () => {
    try {
      await sharePartyInvite(uiState.shareContext.slug, uiState.shareContext.joinToken);
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }
      backdrop.querySelector('.share-sheet-head')?.insertAdjacentHTML(
        'afterend',
        renderInlineFlash({ kind: 'amber', message: 'Sharing is unavailable right now. Copy the invite link instead.' }),
      );
    }
  });

  renderPartyInviteQr(
    backdrop.querySelector('#share-qr-inline-host'),
    uiState.shareLink,
    240,
  );
}

function openShareSheet({ slug, joinToken }) {
  clearTimer();
  uiState.shareContext = { slug, joinToken };
  uiState.shareLink = buildPartyInviteUrl(slug, joinToken);
  preloadPartyInviteQr(slug, joinToken, 240);
  uiState.shareSheetOpen = true;
  mountShareSheet();
}

function closeShareSheet(options = {}) {
  const keepState = options.keepState === true;
  uiState.shareSheetOpen = false;
  if (!keepState) {
    uiState.shareLink = '';
    uiState.shareQrKey = '';
    uiState.shareQrSrc = '';
    uiState.shareContext = null;
  }
  document.getElementById('share-sheet-backdrop')?.remove();
}

async function renderPreorder(slug, entryId) {
  const guestSession = getGuestSession(entryId);
  if (!guestSession?.guestToken) {
    setFlash('amber', 'Restore the guest session before placing a pre-order.');
    navigate(buildGuestEntryPath(slug, entryId));
    return;
  }

  const [venue, entry] = await Promise.all([
    apiRequest(`/venues/${slug}`),
    apiRequest(`/queue/${entryId}`, {
      auth: 'guest',
      guestToken: guestSession.guestToken,
    }),
  ]);
  applyVenueThemeForVenue(venue);

  if (!isVenueFeatureEnabled(venue, 'preOrder')) {
    setFlash('amber', 'Pre-order is disabled for this venue.');
    navigate(buildGuestEntryPath(slug, entryId));
    return;
  }

  if (!['WAITING', 'NOTIFIED'].includes(entry.status)) {
    setFlash('amber', 'Pre-order is only available while the guest is still in queue.');
    navigate(buildGuestEntryPath(slug, entryId));
    return;
  }

  if (entry.depositPaid > 0) {
    setFlash('amber', 'A deposit-backed pre-order already exists for this entry.');
    navigate(buildGuestEntryPath(slug, entryId));
    return;
  }

  const flash = consumeFlash();
  const cart = getCart(entryId);
  const cartSummary = buildCartSummary(venue.menuCategories || [], cart);

  renderPage(renderShell({
    pill: 'Pre-order',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      <div class="preorder-page-shell">
        <div class="section-head">
          <div class="section-title">Pre-order while waiting</div>
          <div class="section-sub">Build the deposit-backed round here. The summary stays reachable on mobile while you browse.</div>
        </div>
        <div class="grid grid-2 preorder-grid">
          <div class="preorder-menu-shell">
            ${(venue.menuCategories || []).length ? renderGuestCategoryTabs(venue.menuCategories || [], uiState.guestMenuActiveCategory || venue.menuCategories?.[0]?.id || null) : ''}
            ${renderMenuSections(venue.menuCategories || [], cart)}
          </div>
          <div class="card preorder-summary-card">
            <div class="card-title">Order summary</div>
            <div class="card-sub">Deposit required: ${venue.depositPercent}% of the GST-inclusive order value.</div>
            ${cartSummary.lines.length ? cartSummary.lines.map((line) => `
              <div class="order-line">
                <div>
                  <div class="order-line-name">${escapeHtml(line.name)}</div>
                  <div class="order-line-qty">${line.quantity} x ${formatMoney(line.unitTotal)}</div>
                </div>
                <div class="order-line-price">${formatMoney(line.total)}</div>
              </div>
            `).join('') : '<div class="empty-state">Add items to build the pre-order.</div>'}
            <div class="order-total">
              <div class="order-total-label">Total incl GST</div>
              <div class="order-total-val">${formatMoney(cartSummary.total)}</div>
            </div>
            <div class="row" style="margin-top:16px;">
              <a class="btn btn-secondary" data-nav href="/v/${slug}/e/${entryId}">Back</a>
              <button class="btn btn-primary" data-submit-preorder ${cartSummary.lines.length ? '' : 'disabled'}>${uiState.preorderSubmitting ? 'Preparing payment...' : 'Pay deposit'}</button>
            </div>
          </div>
        </div>
        <div class="mobile-order-dock">
          <div class="mobile-order-dock-main">
            <div class="mobile-order-dock-meta">${cartSummary.lines.reduce((sum, line) => sum + line.quantity, 0)} items · Deposit ${venue.depositPercent}%</div>
            <div class="mobile-order-dock-total">${formatMoney(cartSummary.total)}</div>
          </div>
          <button class="btn btn-primary" data-submit-preorder ${cartSummary.lines.length ? '' : 'disabled'}>${uiState.preorderSubmitting ? 'Preparing payment...' : 'Pay deposit'}</button>
        </div>
      </div>
    `,
    right: `<a class="btn btn-secondary btn-sm" data-nav href="/v/${slug}/e/${entryId}">Back</a>`,
  }), `Flock | Pre-order`);

  document.querySelectorAll('[data-category-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const categoryId = button.getAttribute('data-category-jump');
      uiState.guestMenuActiveCategory = categoryId;
      const target = document.getElementById(`guest-category-${categoryId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  mountGuestCategoryTracking();

  document.querySelectorAll('[data-cart-item]').forEach((button) => {
    button.addEventListener('click', () => {
      const menuItemId = button.getAttribute('data-item-id');
      const delta = Number(button.getAttribute('data-delta'));
      updateCart(entryId, menuItemId, delta);
      renderPreorder(slug, entryId).catch(handleFatalError);
    });
  });

  document.querySelectorAll('[data-submit-preorder]').forEach((submitButton) => submitButton.addEventListener('click', async () => {
    if (uiState.preorderSubmitting) return;

    uiState.preorderSubmitting = true;
    document.querySelectorAll('[data-submit-preorder]').forEach((button) => {
      button.disabled = true;
      button.textContent = 'Preparing payment...';
    });

    try {
      const order = await apiRequest('/orders/preorder', {
        method: 'POST',
        auth: 'guest',
        guestToken: guestSession.guestToken,
        body: {
          queueEntryId: entryId,
          items: cartSummary.lines.map((line) => ({
            menuItemId: line.id,
            quantity: line.quantity,
          })),
        },
      });

      await runHostedPayment({
        title: 'Flock deposit',
        initiatePath: '/payments/deposit/initiate',
        initiateBody: {
          venueId: venue.id,
          queueEntryId: entryId,
          orderId: order.id,
        },
        capturePath: '/payments/deposit/capture',
        prefill: {
          name: entry.guestName,
          contact: entry.guestPhone,
        },
        auth: 'guest',
        guestToken: guestSession.guestToken,
        apiRequest,
      });

      setCart(entryId, {});
      setFlash('green', 'Deposit captured. Your pre-order is now locked in.');
      navigate(`/v/${slug}/e/${entryId}`);
    } catch (error) {
      setFlash('red', error.message);
      await renderPreorder(slug, entryId);
    } finally {
      uiState.preorderSubmitting = false;
    }
  }));
}

async function renderStaffLogin(slug = resolveActiveVenueSlug()) {
  if (!slug) {
    navigate('/', { replace: true });
    return;
  }

  const venue = await apiRequest(`/venues/${slug}`);
  applyVenueThemeForVenue(venue);
  const venueName = resolveVenueDisplayName(venue);
  const pendingPhone = sessionStorage.getItem(STAFF_PENDING_PHONE_KEY) || '';
  const flash = consumeFlash();

  if (getStaffAuth()) {
    navigate(buildStaffDashboardPath(getStaffAuth().venueSlug || slug), { replace: true });
    return;
  }

  if (!isVenueFeatureEnabled(venue, 'staffConsole')) {
    renderPage(renderShell({
      pill: 'Staff',
      body: `
        <div class="card">
          <div class="card-title">Staff console unavailable</div>
          <div class="card-sub">${escapeHtml(venueName)} is currently configured without the staff console module.</div>
          <a class="btn btn-primary btn-full" data-nav href="/">Return to venue selector</a>
        </div>
      `,
      right: `<a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>`,
    }), `Flock | ${venueName}`);
    return;
  }

  renderPage(renderShell({
    pill: 'Staff',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      <div class="section-head">
        <div class="section-title">Staff sign in</div>
        <div class="section-sub">${escapeHtml(venueName)} host console.</div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Send code</div>
          <div class="card-sub">Enter your staff phone number to continue.</div>
          <form id="staff-send-form">
            <div class="form-group">
              <label class="form-label" for="staff-phone">Phone</label>
              <input class="form-input" id="staff-phone" required placeholder="9876543210" value="${escapeHtml(pendingPhone)}">
            </div>
            <button class="btn btn-primary btn-full" type="submit">Send code</button>
          </form>
        </div>
        <div class="card">
          <div class="card-title">Enter code</div>
          <div class="card-sub">If demo OTP is enabled for this venue, it will appear here automatically.</div>
          <form id="staff-verify-form">
            <div class="form-group">
              <label class="form-label" for="staff-code">OTP code</label>
              <input class="form-input" id="staff-code" required maxlength="6" placeholder="123456">
            </div>
            <button class="btn btn-secondary btn-full" type="submit">Verify &amp; enter</button>
          </form>
        </div>
      </div>
    `,
    right: `<a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>`,
  }), `Flock | ${venueName} staff`);

  document.getElementById('staff-send-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalisePhone(document.getElementById('staff-phone').value);
    try {
      const result = await apiRequest('/auth/staff/otp/send', {
        method: 'POST',
        body: { phone, venueId: venue.id },
      });
      sessionStorage.setItem(STAFF_PENDING_PHONE_KEY, phone);
      if (result?.mockOtp) {
        sessionStorage.setItem('flock_staff_mock_otp', result.mockOtp);
        setFlash('green', '[Demo] Code auto-filled for this session.');
      } else {
        setFlash('green', 'Code sent. Enter it to access the console.');
      }
      await renderStaffLogin(slug);
      if (result?.mockOtp) {
        const codeInput = document.getElementById('staff-code');
        if (codeInput) codeInput.value = result.mockOtp;
      }
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffLogin(slug);
    }
  });

  document.getElementById('staff-verify-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalisePhone(sessionStorage.getItem(STAFF_PENDING_PHONE_KEY) || document.getElementById('staff-phone').value);
    const code = document.getElementById('staff-code').value.trim();
    try {
      const auth = await apiRequest('/auth/staff/otp/verify', {
        method: 'POST',
        body: { phone, code, venueId: venue.id },
      });
      localStorage.setItem(STAFF_AUTH_KEY, JSON.stringify({ ...auth, venueSlug: venue.slug, venueId: venue.id }));
      sessionStorage.removeItem(STAFF_PENDING_PHONE_KEY);
      navigate(buildStaffDashboardPath(venue.slug));
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffLogin(slug);
    }
  });
}

async function renderAdminLogin(slug = resolveActiveVenueSlug()) {
  if (!slug) {
    navigate('/', { replace: true });
    return;
  }

  const venue = await apiRequest(`/venues/${slug}`);
  applyVenueThemeForVenue(venue);
  const venueName = resolveVenueDisplayName(venue);
  const pendingPhone = sessionStorage.getItem(ADMIN_PENDING_PHONE_KEY) || '';
  const flash = consumeFlash();

  if (getStaffAuth() && isManagerRole(getStaffAuth().staff?.role)) {
    navigate(buildAdminDashboardPath(getStaffAuth().venueSlug || slug), { replace: true });
    return;
  }

  if (!isVenueFeatureEnabled(venue, 'adminConsole')) {
    renderPage(renderShell({
      pill: 'Admin',
      body: `
        <div class="card">
          <div class="card-title">Admin console unavailable</div>
          <div class="card-sub">${escapeHtml(venueName)} is currently configured without the admin console module.</div>
          <a class="btn btn-primary btn-full" data-nav href="/">Return to venue selector</a>
        </div>
      `,
      right: `<a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>`,
    }), `Flock | ${venueName}`);
    return;
  }

  renderPage(renderShell({
    pill: 'Admin',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      <div class="section-head">
        <div class="section-title">Admin sign in</div>
        <div class="section-sub">${escapeHtml(venueName)} admin tools.</div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Send code</div>
          <div class="card-sub">Enter a manager or owner phone number to continue.</div>
          <form id="admin-send-form">
            <div class="form-group">
              <label class="form-label" for="admin-phone">Phone</label>
              <input class="form-input" id="admin-phone" required placeholder="9876543210" value="${escapeHtml(pendingPhone)}">
            </div>
            <button class="btn btn-primary btn-full" type="submit">Send code</button>
          </form>
        </div>
        <div class="card">
          <div class="card-title">Enter code</div>
          <div class="card-sub">If demo OTP is enabled for this venue, it will appear here automatically. Only manager and owner roles can continue.</div>
          <form id="admin-verify-form">
            <div class="form-group">
              <label class="form-label" for="admin-code">OTP code</label>
              <input class="form-input" id="admin-code" required maxlength="6" placeholder="123456">
            </div>
            <button class="btn btn-secondary btn-full" type="submit">Verify &amp; enter</button>
          </form>
        </div>
      </div>
    `,
    right: `<a class="btn btn-secondary btn-sm" data-nav href="/">Exit</a>`,
  }), `Flock | ${venueName} admin`);

  document.getElementById('admin-send-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalisePhone(document.getElementById('admin-phone').value);
    try {
      const result = await apiRequest('/auth/staff/otp/send', {
        method: 'POST',
        body: { phone, venueId: venue.id },
      });
      sessionStorage.setItem(ADMIN_PENDING_PHONE_KEY, phone);
      if (result?.mockOtp) {
        setFlash('green', '[Demo] Code auto-filled for this session.');
      } else {
        setFlash('green', 'Code sent. Only manager and owner roles can continue.');
      }
      await renderAdminLogin(slug);
      if (result?.mockOtp) {
        const codeInput = document.getElementById('admin-code');
        if (codeInput) codeInput.value = result.mockOtp;
      }
    } catch (error) {
      setFlash('red', error.message);
      await renderAdminLogin(slug);
    }
  });

  document.getElementById('admin-verify-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalisePhone(sessionStorage.getItem(ADMIN_PENDING_PHONE_KEY) || document.getElementById('admin-phone').value);
    const code = document.getElementById('admin-code').value.trim();

    try {
      const auth = await apiRequest('/auth/staff/otp/verify', {
        method: 'POST',
        body: { phone, code, venueId: venue.id },
      });

      if (!isManagerRole(auth.staff?.role)) {
        sessionStorage.removeItem(ADMIN_PENDING_PHONE_KEY);
        setFlash('red', 'This staff role cannot open the admin console.');
        await renderAdminLogin(slug);
        return;
      }

      localStorage.setItem(STAFF_AUTH_KEY, JSON.stringify({ ...auth, venueSlug: venue.slug, venueId: venue.id }));
      sessionStorage.removeItem(ADMIN_PENDING_PHONE_KEY);
      navigate(buildAdminDashboardPath(venue.slug));
    } catch (error) {
      setFlash('red', error.message);
      await renderAdminLogin(slug);
    }
  });
}

async function renderStaffDashboard(routeSlug = resolveActiveVenueSlug()) {
  const auth = getStaffAuth();
  const activeSlug = auth?.venueSlug || routeSlug || resolveActiveVenueSlug();
  if (!auth) {
    navigateToStaffLogin(activeSlug, { replace: true });
    return;
  }

  if (routeSlug && auth.venueSlug && routeSlug !== auth.venueSlug) {
    navigateToStaffDashboard(auth.venueSlug, { replace: true });
    return;
  }
  const refreshToken = ++uiState.staffDashboardRefreshToken;
  let venue = {
    name: 'Venue unavailable',
    isQueueOpen: true,
    depositPercent: 75,
    tableReadyWindowMin: 10,
    config: {
      featureConfig: {},
    },
  };
  let queue = [];
  let currentTab = uiState.staffTab;
  let tables = uiState.staffTables || [];
  let stats = uiState.staffStats || EMPTY_VENUE_STATS;
  let recentTableEvents = uiState.staffRecentTableEvents || [];
  const dependencyWarnings = [];

  try {
    venue = await apiRequest(`/venues/${activeSlug}`);
    applyVenueThemeForVenue(venue);
  } catch (error) {
    if (isAuthErrorMessage(error.message)) {
      clearStaffAuth();
      navigateToStaffLogin(activeSlug, { replace: true });
      return;
    }
    dependencyWarnings.push('Venue details');
  }

  const manualDispatchEnabled = isManualDispatchVenue(venue);
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  const queueModuleEnabled = Boolean(venue.config?.featureConfig?.guestQueue);
  const historyTabEnabled = Boolean(venue.config?.featureConfig?.historyTab);
  const validStaffTabs = [
    ...(queueModuleEnabled ? ['queue', ...(historyTabEnabled ? ['history'] : []), ...(waitlistOnlyVenue ? [] : ['seated', 'seat'])] : []),
    ...(waitlistOnlyVenue ? [] : ['tables']),
    'manager',
  ];
  if (!validStaffTabs.includes(currentTab)) {
    currentTab = validStaffTabs[0] || 'manager';
    uiState.staffTab = currentTab;
  }

  if (!isVenueFeatureEnabled(venue, 'staffConsole')) {
    renderPage(renderShell({
      pill: 'Staff',
      body: `
        <div class="card">
          <div class="card-title">Staff console unavailable</div>
          <div class="card-sub">${escapeHtml(resolveVenueDisplayName(venue))} is configured without the staff console module.</div>
          <a class="btn btn-primary btn-full" data-nav href="/">Return to venue selector</a>
        </div>
      `,
      right: `<button class="btn btn-secondary btn-sm" id="staff-logout">Logout</button>`,
    }), `Flock | ${resolveVenueDisplayName(venue)}`);

    document.getElementById('staff-logout')?.addEventListener('click', () => {
      clearStaffAuth();
      clearActiveVenueSlug();
      navigateToVenueSelector();
    });
    return;
  }

  const fetchPlan = buildStaffDashboardFetchPlan({
    currentTab,
    tablesFetchedAt: uiState.staffTablesFetchedAt,
    recentTableEventsFetchedAt: uiState.staffRecentTableEventsFetchedAt,
  });

  const [queueResult, tablesResult, eventsResult] = await Promise.allSettled([
    queueModuleEnabled ? apiRequest('/queue/live', { auth: true }) : Promise.resolve([]),
    fetchPlan.shouldFetchTables
      ? apiRequest('/tables', { auth: true })
      : Promise.resolve(tables),
    fetchPlan.shouldFetchRecentTableEvents
      ? apiRequest('/tables/events/recent', { auth: true })
      : Promise.resolve(recentTableEvents),
  ]);

  if (queueResult.status === 'fulfilled') {
    queue = queueResult.value;
  } else if (isAuthErrorMessage(queueResult.reason?.message)) {
    clearStaffAuth();
    navigateToStaffLogin(activeSlug, { replace: true });
    return;
  } else {
    dependencyWarnings.push('Live queue');
  }

  if (tablesResult.status === 'fulfilled') {
    tables = tablesResult.value;
    if (fetchPlan.shouldFetchTables) {
      uiState.staffTables = tables;
      uiState.staffTablesFetchedAt = Date.now();
    }
  } else if (isAuthErrorMessage(tablesResult.reason?.message)) {
    clearStaffAuth();
    navigateToStaffLogin(activeSlug, { replace: true });
    return;
  } else if (fetchPlan.needsTables) {
    dependencyWarnings.push('Tables');
  }

  if (eventsResult.status === 'fulfilled') {
    recentTableEvents = eventsResult.value;
    if (fetchPlan.shouldFetchRecentTableEvents) {
      uiState.staffRecentTableEvents = recentTableEvents;
      uiState.staffRecentTableEventsFetchedAt = Date.now();
    }
  } else if (isAuthErrorMessage(eventsResult.reason?.message)) {
    clearStaffAuth();
    navigateToStaffLogin(activeSlug, { replace: true });
    return;
  } else if (fetchPlan.needsRecentTableEvents) {
    dependencyWarnings.push('Table events');
  }

  if (!uiState.staffStatsFetchedAt || (Date.now() - uiState.staffStatsFetchedAt) >= 60000) {
    uiState.staffStatsFetchedAt = Date.now();
    try {
      stats = await apiRequest('/venues/stats/today', { auth: true });
      uiState.staffStats = stats;
    } catch (error) {
      if (isAuthErrorMessage(error.message)) {
        clearStaffAuth();
        navigateToStaffLogin(activeSlug, { replace: true });
        return;
      }
      if (isTransientServiceErrorMessage(error.message)) {
        dependencyWarnings.push('Venue stats');
      }
      stats = uiState.staffStats || EMPTY_VENUE_STATS;
    }
  }

  const flash = consumeFlash();
  const waiting = queue.filter((entry) => entry.status === 'WAITING' || entry.status === 'NOTIFIED');
  const seated = queue.filter((entry) => entry.status === 'SEATED');
  const shouldShowBillingSummary = shouldLoadVenueBills(venue);
  let seatedBills = uiState.staffSeatedBills;
  const shouldRefreshSeatedBills = shouldShowBillingSummary
    && currentTab === 'seated'
    && (
      !uiState.staffLastUpdatedAt
      || (Date.now() - uiState.staffLastUpdatedAt) >= 10000
      || seated.some((entry) => !(entry.id in uiState.staffSeatedBills))
    );

  if (shouldRefreshSeatedBills) {
    seatedBills = await loadSeatedBills(seated);
    uiState.staffSeatedBills = seatedBills;
    uiState.staffLastUpdatedAt = Date.now();
  }

  if (queueModuleEnabled && historyTabEnabled && currentTab === 'history' && (Date.now() - uiState.staffHistoryLoadedAt) >= 15000) {
    try {
      const history = await apiRequest('/queue/history/recent', { auth: true });
      uiState.staffHistory = history;
      uiState.staffHistoryLoadedAt = Date.now();
    } catch (error) {
      if (isAuthErrorMessage(error.message)) { clearStaffAuth(); navigateToStaffLogin(activeSlug, { replace: true }); return; }
      dependencyWarnings.push('History');
    }
  }

  renderPage(renderShell({
    pill: 'Staff',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      <div id="staff-dependency-warnings">${renderDependencyWarnings(dependencyWarnings)}</div>
      <div id="staff-live-banner">${manualDispatchEnabled ? `
        <div class="alert alert-blue" style="margin-bottom:18px;">
          <div>${waitlistOnlyVenue ? 'Waitlist-only mode is active. Notify the next party, then verify their OTP to complete the visit.' : 'Manual dispatch mode is active. Use the queue row to notify the next party, then seat by OTP when they arrive.'}</div>
        </div>
      ` : ''}</div>
      <div class="section-head">
        <div class="section-title">Floor command</div>
        <div class="section-sub">${escapeHtml(auth.staff.name)} · ${escapeHtml(auth.staff.role)} · ${escapeHtml(venue.name)}</div>
      </div>
      <div class="stats-grid" id="staff-stats-grid" style="margin-bottom:20px;">${renderStaffStatsTiles(stats, venue)}</div>
      <div class="tabs">
        ${queueModuleEnabled ? renderTabButton('queue', 'Queue', currentTab) : ''}
        ${queueModuleEnabled && !waitlistOnlyVenue ? renderTabButton('seated', 'Seated', currentTab) : ''}
        ${queueModuleEnabled && historyTabEnabled ? renderTabButton('history', 'History', currentTab) : ''}
        ${!waitlistOnlyVenue ? renderTabButton('tables', 'Tables', currentTab) : ''}
        ${queueModuleEnabled && !waitlistOnlyVenue ? renderTabButton('seat', 'Seat OTP', currentTab) : ''}
        ${renderTabButton('manager', 'Manager', currentTab)}
      </div>
      <div id="staff-live-panel">${renderStaffActiveTabPanel({
        currentTab,
        queueModuleEnabled,
        historyTabEnabled,
        waiting,
        seated,
        seatedBills,
        tables,
        recentTableEvents,
        venue,
      })}</div>
    `,
    right: `
      <div class="tms-indicator"><span class="tms-dot"></span>${manualDispatchEnabled ? 'Manual dispatch active' : 'Manual floor active'}</div>
      <button class="btn btn-secondary btn-sm" id="staff-logout">Logout</button>
    `,
  }), 'Flock | Staff dashboard');

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      uiState.staffTab = button.getAttribute('data-tab');
      renderStaffDashboard(activeSlug).catch(handleFatalError);
    });
  });

  scrollActiveTabIntoView();

  document.getElementById('staff-logout')?.addEventListener('click', () => {
    clearStaffAuth();
    clearActiveVenueSlug();
    navigateToStaffLogin(activeSlug, { replace: true });
  });

  document.getElementById('seat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const otp = getSeatOtp();
    const tableId = document.getElementById('seat-table').value;
    if (otp.length !== 6 || !tableId) {
      uiState.staffSeat.error = 'Enter the full 6-digit guest OTP and select a table.';
      uiState.staffSeat.success = '';
      await renderStaffDashboard();
      return;
    }
    uiState.staffSeat.tableId = tableId;
    uiState.staffSeat.error = '';
    uiState.staffSeat.success = '';
    uiState.staffSeat.isSubmitting = true;
    await renderStaffDashboard();

    try {
      const result = await apiRequest('/queue/seat', {
        method: 'POST',
        auth: true,
        body: { entryId: uiState.staffSeat.prefilledFromQueueId || undefined, otp, tableId },
      });
      resetStaffSeatState();
      uiState.staffSeat.success = isVenueFeatureEnabled(venue, 'preOrder')
        ? `Guest seated. Pre-order sync: ${result.preOrderSync.status}.`
        : 'Guest seated.';
      uiState.staffTab = 'seat';
      await renderStaffDashboard();
    } catch (error) {
      uiState.staffSeat.error = error.message;
      uiState.staffSeat.isSubmitting = false;
      await renderStaffDashboard();
    }
  });

  document.querySelectorAll('[data-seat-digit]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.getAttribute('data-index'));
      const value = String(event.target.value || '').replace(/\D/g, '').slice(-1);
      uiState.staffSeat.otpDigits[index] = value;
      event.target.value = value;
      uiState.staffSeat.error = '';
      uiState.staffSeat.success = '';
      if (value && index < 5) {
        document.querySelector(`[data-seat-digit][data-index="${index + 1}"]`)?.focus();
      }
    });

    input.addEventListener('keydown', (event) => {
      const index = Number(event.target.getAttribute('data-index'));
      if (event.key === 'Backspace') {
        if (event.target.value) {
          uiState.staffSeat.otpDigits[index] = '';
          event.target.value = '';
        } else if (index > 0) {
          const prev = document.querySelector(`[data-seat-digit][data-index="${index - 1}"]`);
          prev?.focus();
        }
        uiState.staffSeat.error = '';
        uiState.staffSeat.success = '';
      }
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const pasted = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (!pasted) return;
      setSeatOtpFromString(pasted);
      uiState.staffSeat.error = '';
      uiState.staffSeat.success = '';
      renderStaffDashboard().catch(handleFatalError);
    });
  });

  document.getElementById('seat-table')?.addEventListener('change', (event) => {
    uiState.staffSeat.tableId = event.target.value;
    uiState.staffSeat.error = '';
    uiState.staffSeat.success = '';
  });

  document.getElementById('toggle-queue')?.addEventListener('click', guardedAction('toggle-queue', async () => {
    try {
      await apiRequest('/venues/config', { method: 'PATCH', auth: true, body: { isQueueOpen: !venue.isQueueOpen } });
      setFlash('green', `Queue ${venue.isQueueOpen ? 'closed' : 'opened'}.`);
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('manager-config-form')?.addEventListener('submit', guardedAction('config-form', async (event) => {
    event.preventDefault();
    try {
      const depositInput = document.getElementById('manager-deposit');
      await apiRequest('/venues/config', {
        method: 'PATCH', auth: true,
        body: {
          ...(depositInput ? { depositPercent: Number(depositInput.value) } : {}),
          tableReadyWindowMin: Number(document.getElementById('manager-window').value),
        },
      });
      setFlash('green', 'Venue settings updated.');
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('waitlist-settings-form')?.addEventListener('submit', guardedAction('waitlist-config-form', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/venues/config', {
        method: 'PATCH',
        auth: true,
        body: {
          maxQueueSize: Number(document.getElementById('waitlist-max-queue-size').value),
          tableReadyWindowMin: Number(document.getElementById('waitlist-response-window').value),
          opsConfig: {
            queueDispatchMode: 'MANUAL_NOTIFY',
            tableSourceMode: 'DISABLED',
            contentMode: 'DISABLED',
            arrivalCompletionMode: 'QUEUE_COMPLETE',
            readyReminderEnabled: document.getElementById('waitlist-ready-reminder-enabled').checked,
            readyReminderOffsetMin: Number(document.getElementById('waitlist-ready-reminder-offset').value),
            expiryNotificationEnabled: document.getElementById('waitlist-expiry-notification-enabled').checked,
          },
        },
      });
      setFlash('green', 'Queue settings updated.');
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('offline-settle-form')?.addEventListener('submit', guardedAction('offline-settle', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/payments/final/settle-offline', {
        method: 'POST', auth: true,
        body: { queueEntryId: document.getElementById('offline-queue-entry').value.trim() },
      });
      setFlash('green', 'Final bill marked as settled offline.');
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('refund-form')?.addEventListener('submit', guardedAction('refund-form', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/payments/refund', {
        method: 'POST', auth: true,
        body: { paymentId: document.getElementById('refund-payment-id').value.trim() },
      });
      setFlash('green', 'Refund request recorded.');
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('clear-queue-btn')?.addEventListener('click', guardedAction('clear-queue', async () => {
    if (!confirm('Cancel all waiting entries and check out all seated guests?\n\n⚠️ WARNING: This does NOT automatically refund deposits. Refund any captured deposits manually before clearing.')) return;
    try {
      const result = await apiRequest('/queue/clear-all', { method: 'POST', auth: true });
      setFlash('green', `Cleared ${result.cleared} queue entries.`);
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  document.getElementById('reset-tables-btn')?.addEventListener('click', guardedAction('reset-tables', async () => {
    if (!confirm('Reset all tables to FREE?')) return;
    try {
      const result = await apiRequest('/tables/reset-all', { method: 'POST', auth: true });
      setFlash('green', `Reset ${result.reset} tables to FREE.`);
      await renderStaffDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderStaffDashboard();
    }
  }));

  if (currentTab !== 'seat' && currentTab !== 'manager' && !uiState.staffSeat.isSubmitting) {
    const refreshMs = resolveStaffDashboardRefreshMs({ currentTab, dependencyWarnings });
    scheduleRefresh(() => refreshStaffDashboardLivePanel({
      activeSlug,
      scheduledTab: currentTab,
      refreshToken,
    }), refreshMs);
  }
}

async function renderAdminDashboard(routeSlug = resolveActiveVenueSlug()) {
  const auth = getStaffAuth();
  const activeSlug = auth?.venueSlug || routeSlug || resolveActiveVenueSlug();
  if (!auth) {
    navigateToAdminLogin(activeSlug, { replace: true });
    return;
  }

  if (routeSlug && auth.venueSlug && routeSlug !== auth.venueSlug) {
    navigateToAdminDashboard(auth.venueSlug, { replace: true });
    return;
  }

  if (!isManagerRole(auth.staff?.role)) {
    renderPage(renderShell({
      pill: 'Admin',
      body: `
        <div class="section-head">
          <div class="section-title">Admin access blocked</div>
          <div class="section-sub">This authenticated role can use the floor console, but not the admin menu tooling.</div>
        </div>
        <div class="card">
          <div class="card-sub">Use a manager or owner account to continue, or return to the staff dashboard.</div>
          <div class="row">
            <a class="btn btn-secondary" data-nav href="${buildStaffDashboardPath(activeSlug)}">Return to staff</a>
            <a class="btn btn-primary" data-nav href="${buildAdminLoginPath(activeSlug)}">Use manager login</a>
          </div>
        </div>
      `,
      right: `<button class="btn btn-secondary btn-sm" id="admin-logout">Logout</button>`,
    }), 'Flock | Admin blocked');

    document.getElementById('admin-logout')?.addEventListener('click', () => {
      clearStaffAuth();
      clearActiveVenueSlug();
      navigateToAdminLogin(activeSlug, { replace: true });
    });
    return;
  }

  const dependencyWarnings = [];
  let venue = {
    name: 'Venue unavailable',
    config: {
      featureConfig: {},
    },
  };
  let menu = {
    categories: uiState.adminMenu.categories || [],
  };
  let contentBlocks = uiState.adminContentBlocks || [];
  let tables = uiState.adminTables || [];

  let venueFetchError = null;
  try {
    venue = await apiRequest(`/venues/${activeSlug}`);
    applyVenueThemeForVenue(venue);
  } catch (error) {
    venueFetchError = error;
  }

  if (!venueFetchError) {
    if (!isVenueFeatureEnabled(venue, 'adminConsole')) {
      renderPage(renderShell({
        pill: 'Admin',
        body: `
          <div class="card">
            <div class="card-title">Admin console unavailable</div>
            <div class="card-sub">${escapeHtml(resolveVenueDisplayName(venue))} is configured without the admin console module.</div>
            <a class="btn btn-primary btn-full" data-nav href="/">Return to venue selector</a>
          </div>
        `,
        right: `<button class="btn btn-secondary btn-sm" id="admin-logout">Logout</button>`,
      }), `Flock | ${resolveVenueDisplayName(venue)}`);

      document.getElementById('admin-logout')?.addEventListener('click', () => {
        clearStaffAuth();
        clearActiveVenueSlug();
        navigateToVenueSelector();
      });
      return;
    }

    if (isWaitlistOnlyVenue(venue)) {
      const flash = consumeFlash();
      renderPage(renderShell({
        pill: 'Admin',
        body: `
          ${flash ? renderInlineFlash(flash) : ''}
          <div class="section-head">
            <div class="section-title">Queue settings</div>
            <div class="section-sub">${escapeHtml(resolveVenueDisplayName(venue))} waitlist controls.</div>
          </div>
          <div class="grid grid-2">
            <div class="card">
              <div class="card-title">Minimal settings</div>
              <div class="card-sub">Craftery is running as waitlist-only. Menu, content, and table admin stay hidden.</div>
              ${renderWaitlistOnlySettingsForm(venue)}
            </div>
            <div class="card">
              <div class="card-title">Operator note</div>
              <div class="card-sub">Use this venue like a queue desk: call the next party, verify OTP, and move straight to history. No tables are assigned here.</div>
            </div>
          </div>
        `,
        right: `<button class="btn btn-secondary btn-sm" id="admin-logout">Logout</button>`,
      }), `Flock | ${resolveVenueDisplayName(venue)} admin`);

      document.getElementById('admin-logout')?.addEventListener('click', () => {
        clearStaffAuth();
        clearActiveVenueSlug();
        navigateToAdminLogin(activeSlug, { replace: true });
      });

      document.getElementById('waitlist-settings-form')?.addEventListener('submit', guardedAction('waitlist-admin-config-form', async (event) => {
        event.preventDefault();
        try {
          await apiRequest('/venues/config', {
            method: 'PATCH',
            auth: true,
            body: {
              maxQueueSize: Number(document.getElementById('waitlist-max-queue-size').value),
              tableReadyWindowMin: Number(document.getElementById('waitlist-response-window').value),
              opsConfig: {
                queueDispatchMode: 'MANUAL_NOTIFY',
                tableSourceMode: 'DISABLED',
                contentMode: 'DISABLED',
                arrivalCompletionMode: 'QUEUE_COMPLETE',
                readyReminderEnabled: document.getElementById('waitlist-ready-reminder-enabled').checked,
                readyReminderOffsetMin: Number(document.getElementById('waitlist-ready-reminder-offset').value),
                expiryNotificationEnabled: document.getElementById('waitlist-expiry-notification-enabled').checked,
              },
            },
          });
          setFlash('green', 'Queue settings updated.');
          await renderAdminDashboard(activeSlug);
        } catch (error) {
          setFlash('red', error.message);
          await renderAdminDashboard(activeSlug);
        }
      }));

      document.getElementById('toggle-queue')?.addEventListener('click', guardedAction('toggle-admin-queue', async () => {
        try {
          await apiRequest('/venues/config', { method: 'PATCH', auth: true, body: { isQueueOpen: !venue.isQueueOpen } });
          setFlash('green', `Queue ${venue.isQueueOpen ? 'closed' : 'opened'}.`);
          await renderAdminDashboard(activeSlug);
        } catch (error) {
          setFlash('red', error.message);
          await renderAdminDashboard(activeSlug);
        }
      }));
      return;
    }
  } else if (isAuthErrorMessage(venueFetchError?.message)) {
    clearStaffAuth();
    navigateToAdminLogin(activeSlug, { replace: true });
    return;
  } else {
    dependencyWarnings.push('Venue details');
  }

  const [menuResult, contentResult] = await Promise.allSettled([
    apiRequest('/menu/admin/current', { auth: true }),
    apiRequest('/content/admin/current', { auth: true }),
  ]);

  if (menuResult.status === 'fulfilled') {
    menu = menuResult.value;
  } else if (isAuthErrorMessage(menuResult.reason?.message)) {
    clearStaffAuth();
    navigateToAdminLogin(activeSlug, { replace: true });
    return;
  } else {
    dependencyWarnings.push('Admin menu');
  }

  if (contentResult.status === 'fulfilled') {
    contentBlocks = contentResult.value.blocks || [];
  } else if (isAuthErrorMessage(contentResult.reason?.message)) {
    clearStaffAuth();
    navigateToAdminLogin(activeSlug, { replace: true });
    return;
  } else {
    dependencyWarnings.push('Content blocks');
  }

  if (isVenueFeatureEnabled(venue, 'staffConsole')) {
    try {
      tables = await apiRequest('/tables', { auth: true });
    } catch (error) {
      if (isAuthErrorMessage(error.message)) {
        clearStaffAuth();
        navigateToAdminLogin(activeSlug, { replace: true });
        return;
      }
      dependencyWarnings.push('Tables');
    }
  }

  const flash = consumeFlash();
  uiState.adminMenu.categories = menu.categories || [];
  uiState.adminContentBlocks = contentBlocks;
  uiState.adminTables = tables;

  const tablesTabEnabled = isVenueFeatureEnabled(venue, 'staffConsole');
  const availableTabs = ['menu', 'add', 'content', ...(tablesTabEnabled ? ['tables'] : [])];
  if (!availableTabs.includes(uiState.adminTab)) {
    uiState.adminTab = 'menu';
  }

  renderPage(renderShell({
    pill: 'Admin',
    body: `
      ${flash ? renderInlineFlash(flash) : ''}
      ${renderDependencyWarnings(dependencyWarnings)}
      <div class="section-head">
        <div class="section-title">Admin command</div>
        <div class="section-sub">${escapeHtml(auth.staff.name)} · ${escapeHtml(auth.staff.role)} · ${escapeHtml(resolveVenueDisplayName(venue))}</div>
      </div>
      <div class="tabs">
        ${renderTabButton('menu', 'Menu', uiState.adminTab)}
        ${renderTabButton('add', 'Add item', uiState.adminTab)}
        ${renderTabButton('content', 'Content', uiState.adminTab)}
        ${tablesTabEnabled ? renderTabButton('tables', 'Tables', uiState.adminTab) : ''}
      </div>
      ${uiState.adminTab === 'menu' ? renderAdminMenuTab(menu.categories || [], venue) : ''}
      ${uiState.adminTab === 'add' ? renderAdminAddTab(menu.categories || [], venue) : ''}
      ${uiState.adminTab === 'content' ? renderAdminContentTab(contentBlocks, venue) : ''}
      ${uiState.adminTab === 'tables' && tablesTabEnabled ? renderAdminTablesTab(tables, venue) : ''}
    `,
    right: `
      <a class="btn btn-secondary btn-sm" data-nav href="${buildStaffDashboardPath(activeSlug)}">Floor</a>
      <button class="btn btn-secondary btn-sm" id="admin-logout">Logout</button>
    `,
  }), 'Flock | Admin dashboard');

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      uiState.adminTab = button.getAttribute('data-tab');
      renderAdminDashboard(activeSlug).catch(handleFatalError);
    });
  });

  scrollActiveTabIntoView();

  document.getElementById('admin-logout')?.addEventListener('click', () => {
    clearStaffAuth();
    clearActiveVenueSlug();
    navigateToAdminLogin(activeSlug, { replace: true });
  });

  document.querySelectorAll('[data-admin-toggle]').forEach((button) => {
    const itemId = button.getAttribute('data-admin-toggle');
    button.addEventListener('click', guardedAction(`toggle-${itemId}`, async () => {
      try {
        await apiRequest(`/menu/items/${itemId}/toggle`, { method: 'PATCH', auth: true });
        setFlash('green', 'Menu item availability updated.');
        await renderAdminDashboard();
      } catch (error) {
        setFlash('red', error.message);
        await renderAdminDashboard();
      }
    }));
  });

  document.querySelectorAll('[data-admin-remove]').forEach((button) => {
    const itemId = button.getAttribute('data-admin-remove');
    button.addEventListener('click', guardedAction(`remove-${itemId}`, async () => {
      try {
        await apiRequest(`/menu/items/${itemId}`, { method: 'DELETE', auth: true });
        setFlash('green', 'Menu item removed.');
        await renderAdminDashboard();
      } catch (error) {
        setFlash('red', error.message);
        await renderAdminDashboard();
      }
    }));
  });

  document.getElementById('admin-category-form')?.addEventListener('submit', guardedAction('create-category', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/menu/categories', {
        method: 'POST', auth: true,
        body: {
          name: document.getElementById('admin-category-name').value.trim(),
          sortOrder: Number(document.getElementById('admin-category-sort').value || 0),
        },
      });
      setFlash('green', 'Category created.');
      await renderAdminDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderAdminDashboard();
    }
  }));

  document.getElementById('admin-item-form')?.addEventListener('submit', guardedAction('create-item', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/menu/items', {
        method: 'POST', auth: true,
        body: {
          categoryId: document.getElementById('admin-item-category').value,
          name: document.getElementById('admin-item-name').value.trim(),
          description: document.getElementById('admin-item-description').value.trim(),
          priceExGst: Math.round(Number(document.getElementById('admin-item-price').value) * 100),
          gstPercent: Number(document.getElementById('admin-item-gst').value),
          isVeg: document.getElementById('admin-item-veg').checked,
          isAlcohol: document.getElementById('admin-item-alcohol').checked,
          sortOrder: Number(document.getElementById('admin-item-sort').value || 0),
        },
      });
      setFlash('green', 'Menu item created.');
      await renderAdminDashboard();
    } catch (error) {
      setFlash('red', error.message);
      await renderAdminDashboard();
    }
  }));

  document.querySelectorAll('[data-content-form]').forEach((form) => {
    const slot = form.getAttribute('data-content-form');
    form.addEventListener('submit', guardedAction(`content-${slot}`, async (event) => {
      event.preventDefault();
      const title = form.querySelector('[name="title"]')?.value?.trim() || '';
      const body = form.querySelector('[name="body"]')?.value?.trim() || '';
      const imageUrl = form.querySelector('[name="imageUrl"]')?.value?.trim() || '';
      const sortOrder = Number(form.querySelector('[name="sortOrder"]')?.value || 0);
      const isEnabled = Boolean(form.querySelector('[name="isEnabled"]')?.checked);

      try {
        await apiRequest(`/content/${slot}`, {
          method: 'PATCH',
          auth: true,
          body: {
            title,
            body: body || null,
            imageUrl: imageUrl || null,
            isEnabled,
            sortOrder,
          },
        });
        setFlash('green', `${slot} content updated.`);
        await renderAdminDashboard(activeSlug);
      } catch (error) {
        setFlash('red', error.message);
        await renderAdminDashboard(activeSlug);
      }
    }));
  });

  document.getElementById('admin-table-form')?.addEventListener('submit', guardedAction('create-table', async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/tables', {
        method: 'POST',
        auth: true,
        body: {
          label: document.getElementById('admin-table-label').value.trim(),
          capacity: Number(document.getElementById('admin-table-capacity').value),
          section: document.getElementById('admin-table-section').value.trim() || undefined,
          tmsTableId: document.getElementById('admin-table-tms-id').value.trim() || undefined,
        },
      });
      setFlash('green', 'Table created.');
      await renderAdminDashboard(activeSlug);
    } catch (error) {
      setFlash('red', error.message);
      await renderAdminDashboard(activeSlug);
    }
  }));
}

function renderQueueTab(waiting, tables, venue) {
  const { showFlowLog: flowLogEnabled, showBillingSignals, showNotifyAction, manualDispatchMode, waitlistOnlyVenue } = getVenueStaffSurfaceFlags(venue);
  const waitingOnly = waiting.filter((entry) => entry.status === 'WAITING');
  const waitingIndexById = new Map(waitingOnly.map((entry, index) => [entry.id, index]));
  const renderWaitlistRowActions = (entry) => {
    if (entry.status === 'WAITING') {
      return `
        ${showNotifyAction ? `<button class="btn btn-primary btn-sm" data-open-notify-sheet="${entry.id}">Notify</button>` : ''}
        ${manualDispatchMode && (waitingIndexById.get(entry.id) || 0) > 0 ? `<button class="btn btn-secondary btn-sm" data-reorder-entry="${entry.id}" data-reorder-direction="UP">Move up</button>` : ''}
        ${manualDispatchMode && (waitingIndexById.get(entry.id) || 0) < (waitingOnly.length - 1) ? `<button class="btn btn-secondary btn-sm" data-reorder-entry="${entry.id}" data-reorder-direction="DOWN">Move down</button>` : ''}
        <button class="btn btn-danger btn-sm" data-cancel-entry="${entry.id}">Cancel</button>
      `;
    }

    if (entry.status === 'NOTIFIED') {
      return `
        ${showNotifyAction ? `<button class="btn btn-secondary btn-sm" data-nudge-entry="${entry.id}">Re-nudge</button>` : ''}
        ${waitlistOnlyVenue ? `
          <button
            class="btn btn-primary btn-sm"
            data-mark-arrived="${entry.id}"
            data-entry-otp="${escapeHtml(entry.otp)}"
            data-guest-name="${escapeHtml(entry.guestName)}"
            data-party-size="${entry.partySize}"
            data-preference-label="${escapeHtml(getQueueEntryPreferenceLabel(entry))}"
            data-guest-notes="${escapeHtml(getQueueEntryGuestNotes(entry))}"
            data-entry-state-label="Called"
          >Mark arrived</button>
        ` : `
          <button
            class="btn btn-secondary btn-sm"
            data-prefill-seat="${escapeHtml(entry.otp)}"
            data-entry-id="${entry.id}"
            data-suggested-table="${getSuggestedTableId(entry, tables)}"
            data-guest-name="${escapeHtml(entry.guestName)}"
            data-party-size="${entry.partySize}"
            data-preference-label="${escapeHtml(getQueueEntryPreferenceLabel(entry))}"
            data-guest-notes="${escapeHtml(getQueueEntryGuestNotes(entry))}"
            data-entry-state-label="${escapeHtml(formatQueueEntryStateForStaff(entry))}"
          >Seat</button>
        `}
        <button class="btn btn-danger btn-sm" data-cancel-entry="${entry.id}">Cancel</button>
      `;
    }

    return `
      <button class="btn btn-danger btn-sm" data-cancel-entry="${entry.id}">Cancel</button>
    `;
  };

  if (!waiting.length) {
    return '<div class="empty-state">No waiting or notified guests right now.</div>';
  }

  return waiting.map((entry) => `
    <div class="q-row ${entry.status === 'NOTIFIED' ? 'highlight' : ''} ${entry.status === 'NOTIFIED' ? 'ready' : ''}" data-staff-live-anchor="${entry.id}">
      <div class="q-row-num">${entry.position || '-'}</div>
      <div class="q-row-info">
        <div class="q-row-name">
          ${escapeHtml(entry.guestName)}
          ${renderStatusBadge(entry.status)}
          ${showBillingSignals && entry.depositPaid > 0 ? '<span class="badge badge-neutral">Deposit</span>' : ''}
          ${showBillingSignals && entry.preOrderTotal > 0 ? '<span class="badge badge-neutral">Pre-order</span>' : ''}
          ${entry.status === 'NOTIFIED' ? `<span class="badge badge-ready">${waitlistOnlyVenue ? 'Called' : 'Ready'}</span>` : ''}
          ${entry.status === 'NOTIFIED' && getQueueEntryReadyWindowState(entry).urgent ? '<span class="badge badge-danger">Expiring</span>' : ''}
        </div>
        <div class="q-row-meta">${escapeHtml(entry.guestPhone)} · ${entry.partySize} pax · OTP <span class="mono">${escapeHtml(entry.otp)}</span>${entry.displayRef ? ` · <span class="mono">${escapeHtml(entry.displayRef)}</span>` : ''}</div>
        <div class="q-row-meta">${manualDispatchMode ? `Preference: ${escapeHtml(formatQueueSeatingPreference(entry.seatingPreference))}` : `Seating preference: ${escapeHtml(formatQueueSeatingPreference(entry.seatingPreference))}`}</div>
        ${getQueueEntryGuestNotes(entry) ? `<div class="q-row-note">Notes: ${escapeHtml(getQueueEntryGuestNotes(entry))}</div>` : ''}
        <div class="q-row-countdown ${entry.status === 'NOTIFIED' && getQueueEntryReadyWindowState(entry).urgent ? 'urgent' : ''}">
          ${entry.status === 'NOTIFIED' ? `${getQueueEntryReadyWindowLabel(entry) || 'Host desk call active'}` : getQueueEntryEtaLabel(entry, venue)}
          ${!waitlistOnlyVenue && entry.table?.label ? ` · Reserved ${escapeHtml(entry.table.label)}` : ''}
        </div>
        ${showBillingSignals && entry.orders?.length ? `<div class="q-row-orders">Pre-order: ${escapeHtml(renderGuestOrderItems(entry.orders.flatMap((order) => order.items || [])) || 'Locked items on file')}</div>` : ''}
      </div>
      <div class="q-row-actions">
        ${waitlistOnlyVenue ? renderWaitlistRowActions(entry) : `
          ${manualDispatchMode && entry.status === 'WAITING' && (waitingIndexById.get(entry.id) || 0) > 0 ? `<button class="btn btn-secondary btn-sm" data-reorder-entry="${entry.id}" data-reorder-direction="UP">Move up</button>` : ''}
          ${manualDispatchMode && entry.status === 'WAITING' && (waitingIndexById.get(entry.id) || 0) < (waitingOnly.length - 1) ? `<button class="btn btn-secondary btn-sm" data-reorder-entry="${entry.id}" data-reorder-direction="DOWN">Move down</button>` : ''}
          <button
            class="btn btn-secondary btn-sm"
            data-prefill-seat="${escapeHtml(entry.otp)}"
            data-entry-id="${entry.id}"
            data-suggested-table="${getSuggestedTableId(entry, tables)}"
            data-guest-name="${escapeHtml(entry.guestName)}"
            data-party-size="${entry.partySize}"
            data-preference-label="${escapeHtml(getQueueEntryPreferenceLabel(entry))}"
            data-guest-notes="${escapeHtml(getQueueEntryGuestNotes(entry))}"
            data-entry-state-label="${escapeHtml(formatQueueEntryStateForStaff(entry))}"
          >Seat</button>
          ${showNotifyAction && entry.status === 'WAITING' ? `<button class="btn btn-primary btn-sm" data-open-notify-sheet="${entry.id}">Notify</button>` : ''}
          ${showNotifyAction && entry.status === 'NOTIFIED' ? `<button class="btn btn-primary btn-sm" data-nudge-entry="${entry.id}">Re-nudge</button>` : ''}
          ${flowLogEnabled ? `<button class="btn btn-secondary btn-sm" data-view-flow="${entry.id}">Flow log</button>` : ''}
          <button class="btn btn-danger btn-sm" data-cancel-entry="${entry.id}">Cancel</button>
        `}
      </div>
    </div>
  `).join('');
}

function renderSeatedTab(seated, seatedBills, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  const { showFlowLog: flowLogEnabled, showBillingSignals: showBillingSummary } = getVenueStaffSurfaceFlags(venue);
  return seated.length ? seated.map((entry) => {
    const bill = seatedBills[entry.id];
    return `
      <div class="q-row" data-staff-live-anchor="${entry.id}">
        <div class="q-row-num">${escapeHtml(entry.table?.label || '-')}</div>
        <div class="q-row-info">
          <div class="q-row-name">
            ${escapeHtml(entry.guestName)}
            <span class="badge badge-seated">Seated</span>
            ${showBillingSummary && entry.depositPaid > 0 ? '<span class="badge badge-neutral">Deposit</span>' : ''}
          </div>
          <div class="q-row-meta">${escapeHtml(entry.guestPhone)} · ${entry.partySize} pax${entry.table?.section ? ` · ${escapeHtml(entry.table.section)}` : ''}${entry.displayRef ? ` · <span class="mono">${escapeHtml(entry.displayRef)}</span>` : ''}</div>
          <div class="q-row-orders">${showBillingSummary ? (entry.orders?.length ? renderGuestOrderItems(entry.orders.flatMap((order) => order.items || [])) : 'No orders posted yet.') : 'Mark the table clearing when the party leaves.'}</div>
        </div>
        <div class="q-row-actions" style="align-items:flex-end;">
          ${showBillingSummary ? `<div class="muted">${bill ? `Total ${formatMoney(bill.summary.totalIncGst)}` : 'Loading bill'}</div>` : '<div class="muted">Queue-only venue</div>'}
          ${showBillingSummary && bill ? `<div class="muted">Balance ${formatMoney(bill.summary.balanceDue)}</div>` : ''}
          ${flowLogEnabled ? `<button class="btn btn-secondary btn-sm" data-view-flow="${entry.id}" style="margin-top:4px;">Flow log</button>` : ''}
          ${!isQueueOnlyGuestExperience(venue) ? '<button class="btn btn-secondary btn-sm" data-checkout-entry="' + entry.id + '" style="margin-top:4px;">Check out</button>' : '<div class="muted">Close from table state</div>'}
        </div>
      </div>
    `;
  }).join('') : '<div class="empty-state">No seated parties are active right now.</div>';
}

function renderHistoryTab(venue) {
  const entries = uiState.staffHistory || [];
  const { showFlowLog: flowLogEnabled, showBillingSignals: showBillingSummary } = getVenueStaffSurfaceFlags(venue);
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  if (!entries.length) return '<div class="empty-state">No completed sessions found yet.</div>';

  const statusLabel = { COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' };

  return entries.map((entry) => {
    const totalPaise = (entry.orders || []).reduce((s, o) => s + (o.totalIncGst || 0), 0);
    const statusBadge = entry.status === 'COMPLETED'
      ? '<span class="badge badge-seated">Completed</span>'
      : entry.status === 'CANCELLED'
        ? '<span class="badge badge-danger">Cancelled</span>'
        : `<span class="badge badge-neutral">${escapeHtml(statusLabel[entry.status] || entry.status)}</span>`;
    return `
      <div class="q-row" data-staff-live-anchor="${entry.id}">
        <div class="q-row-num">${entry.table?.label ? escapeHtml(entry.table.label) : (waitlistOnlyVenue ? (entry.status === 'NO_SHOW' ? '!' : 'Done') : '-')}</div>
        <div class="q-row-info">
          <div class="q-row-name">
            ${escapeHtml(entry.guestName)}
            ${statusBadge}
            ${showBillingSummary && entry.depositPaid > 0 ? '<span class="badge badge-neutral">Deposit</span>' : ''}
          </div>
          <div class="q-row-meta">${escapeHtml(entry.guestPhone)} · ${entry.partySize} pax${entry.displayRef ? ` · <span class="mono">${escapeHtml(entry.displayRef)}</span>` : ''}</div>
          <div class="q-row-meta muted">${formatRelativeStamp(new Date(entry.completedAt || entry.updatedAt).getTime())}</div>
        </div>
        <div class="q-row-actions" style="align-items:flex-end;">
          <div class="muted">${showBillingSummary ? (totalPaise ? `Total ${formatMoney(totalPaise)}` : 'No orders') : (entry.status === 'NO_SHOW' ? 'No-show' : 'Visit closed')}</div>
          ${flowLogEnabled ? `<button class="btn btn-secondary btn-sm" data-view-flow="${entry.id}" style="margin-top:4px;">Flow log</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderTablesTab(tables, recentTableEvents, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  const manualDispatchEnabled = isManualDispatchVenue(venue);
  return `
    <div class="floor-plan-header">
      <div>
        <div class="section-title">Table floor</div>
        <div class="section-sub">${manualDispatchEnabled ? 'Table floor is reference-only for this venue. Hosts call the next party from the queue.' : 'Manual table state drives queue auto-advance.'} Last updated ${formatRelativeStamp(uiState.staffLastUpdatedAt)}.</div>
      </div>
      <div class="floor-legend">
        <div class="legend-item"><span class="legend-dot free"></span>Free</div>
        <div class="legend-item"><span class="legend-dot occupied"></span>Occupied</div>
        <div class="legend-item"><span class="legend-dot clearing"></span>Clearing</div>
        <div class="legend-item"><span class="legend-dot reserved"></span>Reserved</div>
      </div>
    </div>
    <div class="tables-grid">
      ${tables.map((table) => `
        <div class="table-card ${table.status.toLowerCase()}" data-staff-live-anchor="${table.id}">
          <div class="table-num">${escapeHtml(table.label)}</div>
          <div class="table-cap">${table.capacity} seats${table.section ? ` · ${escapeHtml(table.section)}` : ''}</div>
          <div class="table-status-label">${escapeHtml(table.status)}</div>
          <div class="table-actions">
            ${renderTableActions(table)}
          </div>
        </div>
      `).join('')}
    </div>
    ${manualDispatchEnabled ? '' : `
      <div class="card" style="margin-top:16px;">
        <div class="card-title">Recent floor events</div>
        <div class="card-sub">Live operator feed powered by venue-scoped table events.</div>
        ${recentTableEvents.length ? recentTableEvents.map((event) => `
          <div class="order-line">
            <div>
              <div class="order-line-name">${escapeHtml(event.tableLabel)} · ${escapeHtml(event.fromStatus)} → ${escapeHtml(event.toStatus)}</div>
              <div class="order-line-qty">${formatRelativeStamp(new Date(event.createdAt).getTime())}${event.note ? ` · ${escapeHtml(event.note)}` : ''}</div>
            </div>
            <div class="order-line-price">${escapeHtml(event.triggeredBy || 'system')}</div>
          </div>
        `).join('') : '<div class="empty-state">No table events captured yet.</div>'}
      </div>
    `}
  `;
}

function renderSeatTab(tables, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  const available = tables.filter((table) => table.status === 'FREE' || table.status === 'RESERVED');
  const queueOnlyGuestExperience = isQueueOnlyGuestExperience(venue);
  const entrySummary = uiState.staffSeat.entrySummary;
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Seat by OTP</div>
        <div class="card-sub">${queueOnlyGuestExperience ? 'Use the 6-digit guest OTP, then bind the guest to a compatible free or reserved table.' : 'Use the 6-digit guest OTP, then explicitly bind the guest to a compatible free or reserved table.'}</div>
        ${uiState.staffSeat.error ? renderInlineFlash({ kind: 'red', message: uiState.staffSeat.error }) : ''}
        ${uiState.staffSeat.success ? renderInlineFlash({ kind: 'green', message: uiState.staffSeat.success }) : ''}
        ${uiState.staffSeat.prefilledFromQueueId ? `<div class="alert alert-blue"><div>Quick seat loaded from queue row. OTP is prefilled for queue entry <span class="mono">${escapeHtml(uiState.staffSeat.prefilledFromQueueId)}</span>.</div></div>` : ''}
        ${entrySummary ? `
          <div class="seat-context-card">
            <div class="seat-context-top">
              <div class="seat-context-title">${escapeHtml(entrySummary.guestName)}</div>
              <div class="seat-context-state">${escapeHtml(entrySummary.stateLabel)}</div>
            </div>
            <div class="seat-context-meta">${entrySummary.partySize} pax · ${escapeHtml(entrySummary.preferenceLabel)}</div>
            ${entrySummary.guestNotes ? `<div class="seat-context-notes">Notes: ${escapeHtml(entrySummary.guestNotes)}</div>` : ''}
            <div class="seat-context-meta">Requested: ${entrySummary.partySize} pax · ${escapeHtml(entrySummary.preferenceLabel)}</div>
          </div>
        ` : ''}
        <form id="seat-form">
          <div class="form-group">
            <label class="form-label">Guest OTP</label>
            <div class="otp-grid">
              ${uiState.staffSeat.otpDigits.map((digit, index) => `
                <input
                  class="form-input otp-digit"
                  data-seat-digit
                  data-index="${index}"
                  inputmode="numeric"
                  maxlength="1"
                  value="${escapeHtml(digit)}"
                  ${uiState.staffSeat.isSubmitting ? 'disabled' : ''}
                >
              `).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="seat-table">Table</label>
            <select class="form-select" id="seat-table" required>
              <option value="">Select a free/reserved table</option>
              ${available.map((table) => `<option value="${table.id}" ${uiState.staffSeat.tableId === table.id ? 'selected' : ''}>${escapeHtml(formatSeatTableOption(table))}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary btn-full" type="submit" ${uiState.staffSeat.isSubmitting ? 'disabled' : ''}>
            ${uiState.staffSeat.isSubmitting ? 'Seating...' : 'Seat guest'}
          </button>
        </form>
      </div>
      <div class="card">
        <div class="card-title">Operator note</div>
        <div class="card-sub">${queueOnlyGuestExperience ? 'This venue is running waitlist-first. Seat the arriving party and keep the queue moving from the host desk.' : 'Deposit-first stays intact. If a guest already prepaid, seating locks the table and triggers the pre-order handoff path.'}</div>
        <div class="alert alert-blue">
          <div>${queueOnlyGuestExperience ? 'Queue-row quick seat never bypasses verification. It only preloads the guest OTP and best-fit table so the host can move faster.' : 'Queue-row quick seat never bypasses verification. It only preloads the guest OTP and best-fit table to speed up the same PM-faithful step.'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderWaitlistOnlySettingsForm(venue) {
  const opsConfig = resolveVenueOpsConfig(venue);
  return `
    <div class="row" style="margin-bottom:16px;">
      <span class="badge ${venue.isQueueOpen ? 'badge-ready' : 'badge-neutral'}">${venue.isQueueOpen ? 'Queue open' : 'Queue closed'}</span>
      <button class="btn btn-secondary btn-sm" id="toggle-queue">${venue.isQueueOpen ? 'Close queue' : 'Open queue'}</button>
    </div>
    <form id="waitlist-settings-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="waitlist-max-queue-size">Max queue size</label>
          <input class="form-input" id="waitlist-max-queue-size" type="number" min="10" max="500" value="${venue.maxQueueSize}">
        </div>
        <div class="form-group">
          <label class="form-label" for="waitlist-response-window">Response window (min)</label>
          <input class="form-input" id="waitlist-response-window" type="number" min="3" max="60" value="${venue.tableReadyWindowMin}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="display:flex; gap:12px; align-items:center; padding-top:24px;">
          <label class="checkbox-row">
            <input type="checkbox" id="waitlist-ready-reminder-enabled" ${opsConfig.readyReminderEnabled ? 'checked' : ''}>
            Ready reminder
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" for="waitlist-ready-reminder-offset">Reminder offset (min)</label>
          <input class="form-input" id="waitlist-ready-reminder-offset" type="number" min="1" max="15" value="${opsConfig.readyReminderOffsetMin}">
        </div>
      </div>
      <label class="checkbox-row" style="margin-bottom:16px;">
        <input type="checkbox" id="waitlist-expiry-notification-enabled" ${opsConfig.expiryNotificationEnabled ? 'checked' : ''}>
        Send expiry notification on no-show
      </label>
      <button class="btn btn-primary btn-full" type="submit">Save settings</button>
    </form>
  `;
}

function renderManagerTab({ auth, venue, queue }) {
  const isManager = auth.staff.role === 'OWNER' || auth.staff.role === 'MANAGER';
  const guestQueueEnabled = isVenueFeatureEnabled(venue, 'guestQueue');
  const waitlistOnlyVenue = isWaitlistOnlyVenue(venue);
  const {
    queueOnlyGuestExperience,
    showBulkClearTool: bulkClearEnabled,
    showDepositControls,
    showOfflineSettleTool: offlineSettleEnabled,
    showRefundTool: refundsEnabled,
  } = getVenueStaffSurfaceFlags(venue);
  if (waitlistOnlyVenue) {
    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Queue control</div>
          <div class="card-sub">Queue-only controls for the host desk. Tables and seated flows stay hidden for this venue.</div>
          ${isManager ? renderWaitlistOnlySettingsForm(venue) : '<div class="alert alert-blue"><div>Manager-only queue settings stay hidden for this staff role.</div></div>'}
        </div>
        <div class="card">
          <div class="card-title">Operator note</div>
          <div class="card-sub">Notify the next party manually, verify the OTP when they return, then move on to the next call. No table assignment is required here.</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Queue control</div>
        <div class="card-sub">${queueOnlyGuestExperience ? 'Venue-scoped waitlist controls for the host desk.' : 'Venue-scoped operational controls. Queue-only actions disappear when the queue module is disabled.'}</div>
        <div class="row" style="margin-bottom:16px;">
          <span class="badge ${guestQueueEnabled && venue.isQueueOpen ? 'badge-ready' : 'badge-neutral'}">${guestQueueEnabled ? (venue.isQueueOpen ? 'Queue open' : 'Queue closed') : 'Queue module off'}</span>
          ${guestQueueEnabled ? `<button class="btn btn-secondary btn-sm" id="toggle-queue">${venue.isQueueOpen ? 'Close queue' : 'Open queue'}</button>` : ''}
        </div>
        ${isManager ? `
          <form id="manager-config-form">
            ${showDepositControls ? `
              <div class="form-group">
                <label class="form-label" for="manager-deposit">Deposit %</label>
                <input class="form-input" id="manager-deposit" type="number" min="50" max="100" value="${venue.depositPercent}">
              </div>
            ` : ''}
            <div class="form-group">
              <label class="form-label" for="manager-window">Table ready window (min)</label>
              <input class="form-input" id="manager-window" type="number" min="5" max="60" value="${venue.tableReadyWindowMin}">
            </div>
            <button class="btn btn-primary btn-full" type="submit">Save settings</button>
          </form>
        ` : `
          <div class="alert alert-blue"><div>Manager-only venue controls are hidden for this staff role.</div></div>
        `}
      </div>
      <div class="card">
        <div class="card-title">${queueOnlyGuestExperience ? 'Operator note' : 'Operational fallbacks'}</div>
        <div class="card-sub">${queueOnlyGuestExperience ? 'Craftery is running as a waitlist-first venue. Payment recovery and bulk reset tools stay hidden so the host desk only sees queue-relevant controls.' : 'These are pilot-safe escape hatches to keep service moving.'}</div>
        ${queueOnlyGuestExperience ? `
          <div class="alert alert-blue" style="margin-top:16px;">
            <div>Keep Queue, Tables, Seat OTP, Seated, and History as the operational path for this venue. Mark tables clearing when guests leave to close out visits cleanly.</div>
          </div>
        ` : ''}
        ${!queueOnlyGuestExperience && offlineSettleEnabled ? `
          <form id="offline-settle-form" style="margin-bottom:16px;">
            <div class="form-group">
              <label class="form-label" for="offline-queue-entry">Queue entry ID</label>
              <input class="form-input mono" id="offline-queue-entry" placeholder="${queue[0]?.id || 'Queue entry UUID'}">
            </div>
            <button class="btn btn-secondary btn-full" type="submit">Mark final bill settled offline</button>
          </form>
        ` : !queueOnlyGuestExperience ? '<div class="alert alert-blue" style="margin-bottom:16px;"><div>Offline settlement is disabled for this venue.</div></div>' : ''}
        ${!queueOnlyGuestExperience && isManager && refundsEnabled ? `
          <form id="refund-form">
            <div class="form-group">
              <label class="form-label" for="refund-payment-id">Deposit payment ID</label>
              <input class="form-input mono" id="refund-payment-id" placeholder="Payment UUID">
            </div>
            <button class="btn btn-danger btn-full" type="submit">Refund deposit</button>
          </form>
        ` : !queueOnlyGuestExperience && isManager ? '<div class="alert alert-blue"><div>Refunds are disabled for this venue.</div></div>' : ''}
      </div>
      ${!queueOnlyGuestExperience && isManager && bulkClearEnabled ? `
        <div class="card">
          <div class="card-title">Reset floor</div>
          <div class="card-sub">Cancel all waiting entries, check out all seated guests, and free all tables. Use at end of service or to reset test data.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-danger btn-sm" id="clear-queue-btn">Clear all queue entries</button>
            <button class="btn btn-danger btn-sm" id="reset-tables-btn">Reset all tables to FREE</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderStaffStatsTiles(stats, venue) {
  const shouldShowBillingSummary = shouldLoadVenueBills(venue);
  return `
    <div class="stat-tile">
      <div class="stat-label">Queue joins</div>
      <div class="stat-value">${stats.today.totalQueueJoins}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">Avg wait</div>
      <div class="stat-value">${stats.today.avgWaitMin}m</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">${shouldShowBillingSummary ? 'Captured revenue' : 'Ready window'}</div>
      <div class="stat-value">${shouldShowBillingSummary ? formatMoney(stats.today.totalRevenuePaise) : `${venue.tableReadyWindowMin}m`}</div>
    </div>
  `;
}

function renderStaffActiveTabPanel({ currentTab, queueModuleEnabled, historyTabEnabled, waiting, seated, seatedBills, tables, recentTableEvents, venue }) {
  if (currentTab === 'queue' && queueModuleEnabled) {
    return renderQueueTab(waiting, tables, venue);
  }
  if (currentTab === 'seated' && queueModuleEnabled && !isWaitlistOnlyVenue(venue)) {
    return renderSeatedTab(seated, seatedBills, venue);
  }
  if (currentTab === 'history' && queueModuleEnabled && historyTabEnabled) {
    return renderHistoryTab(venue);
  }
  if (currentTab === 'tables' && !isWaitlistOnlyVenue(venue)) {
    return renderTablesTab(tables, recentTableEvents, venue);
  }
  if (currentTab === 'seat' && queueModuleEnabled && !isWaitlistOnlyVenue(venue)) {
    return renderSeatTab(tables, venue);
  }
  if (currentTab === 'manager') {
    return renderManagerTab({ auth: getStaffAuth(), venue, queue: [...waiting, ...seated] });
  }
  return '';
}

async function refreshStaffDashboardLivePanel({ activeSlug, scheduledTab, refreshToken }) {
  const auth = getStaffAuth();
  if (!auth) {
    navigateToStaffLogin(activeSlug, { replace: true });
    return;
  }

  if (!shouldApplyStaffLiveRefresh({ activeSlug, scheduledTab, refreshToken })) {
    return;
  }

  const currentTab = uiState.staffTab;
  if (currentTab === 'seat' || currentTab === 'manager') {
    return;
  }

  const venue = await apiRequest(`/venues/${activeSlug}`).catch(async (error) => {
    if (isAuthErrorMessage(error.message)) {
      clearStaffAuth();
      navigateToStaffLogin(activeSlug, { replace: true });
      return null;
    }
    throw error;
  });
  if (!venue) {
    return;
  }

  if (!shouldApplyStaffLiveRefresh({ activeSlug, scheduledTab, refreshToken })) {
    return;
  }

  const queueModuleEnabled = Boolean(venue.config?.featureConfig?.guestQueue);
  const historyTabEnabled = Boolean(venue.config?.featureConfig?.historyTab);
  const dependencyWarnings = [];
  const fetchPlan = buildStaffDashboardFetchPlan({
    currentTab,
    tablesFetchedAt: uiState.staffTablesFetchedAt,
    recentTableEventsFetchedAt: uiState.staffRecentTableEventsFetchedAt,
  });

  let queue = [];
  let tables = uiState.staffTables || [];
  let recentTableEvents = uiState.staffRecentTableEvents || [];

  const [queueResult, tablesResult, eventsResult] = await Promise.allSettled([
    queueModuleEnabled ? apiRequest('/queue/live', { auth: true }) : Promise.resolve([]),
    fetchPlan.shouldFetchTables ? apiRequest('/tables', { auth: true }) : Promise.resolve(tables),
    fetchPlan.shouldFetchRecentTableEvents ? apiRequest('/tables/events/recent', { auth: true }) : Promise.resolve(recentTableEvents),
  ]);

  if (queueResult.status === 'fulfilled') {
    queue = queueResult.value;
  } else {
    dependencyWarnings.push('Live queue');
  }

  if (tablesResult.status === 'fulfilled') {
    tables = tablesResult.value;
    if (fetchPlan.shouldFetchTables) {
      uiState.staffTables = tables;
      uiState.staffTablesFetchedAt = Date.now();
    }
  } else if (fetchPlan.needsTables) {
    dependencyWarnings.push('Tables');
  }

  if (eventsResult.status === 'fulfilled') {
    recentTableEvents = eventsResult.value;
    if (fetchPlan.shouldFetchRecentTableEvents) {
      uiState.staffRecentTableEvents = recentTableEvents;
      uiState.staffRecentTableEventsFetchedAt = Date.now();
    }
  } else if (fetchPlan.needsRecentTableEvents) {
    dependencyWarnings.push('Table events');
  }

  let stats = uiState.staffStats || EMPTY_VENUE_STATS;
  if (!uiState.staffStatsFetchedAt || (Date.now() - uiState.staffStatsFetchedAt) >= 60000) {
    try {
      stats = await apiRequest('/venues/stats/today', { auth: true });
      uiState.staffStats = stats;
      uiState.staffStatsFetchedAt = Date.now();
    } catch (error) {
      if (isTransientServiceErrorMessage(error.message)) {
        dependencyWarnings.push('Venue stats');
      }
    }
  }

  if (queueModuleEnabled && historyTabEnabled && currentTab === 'history' && (Date.now() - uiState.staffHistoryLoadedAt) >= 15000) {
    try {
      const history = await apiRequest('/queue/history/recent', { auth: true });
      uiState.staffHistory = history;
      uiState.staffHistoryLoadedAt = Date.now();
    } catch (error) {
      dependencyWarnings.push('History');
    }
  }

  const waiting = queue.filter((entry) => entry.status === 'WAITING' || entry.status === 'NOTIFIED');
  const seated = queue.filter((entry) => entry.status === 'SEATED');
  let seatedBills = uiState.staffSeatedBills;
  const shouldRefreshSeatedBills = shouldLoadVenueBills(venue)
    && currentTab === 'seated'
    && (
      !uiState.staffLastUpdatedAt
      || (Date.now() - uiState.staffLastUpdatedAt) >= 10000
      || seated.some((entry) => !(entry.id in uiState.staffSeatedBills))
    );

  if (shouldRefreshSeatedBills) {
    seatedBills = await loadSeatedBills(seated);
    uiState.staffSeatedBills = seatedBills;
  }

  if (!shouldApplyStaffLiveRefresh({ activeSlug, scheduledTab, refreshToken })) {
    return;
  }

  uiState.staffLastUpdatedAt = Date.now();
  applyVenueThemeForVenue(venue);

  const warningHost = document.getElementById('staff-dependency-warnings');
  const bannerHost = document.getElementById('staff-live-banner');
  const statsHost = document.getElementById('staff-stats-grid');
  const panelHost = document.getElementById('staff-live-panel');

  if (!warningHost || !bannerHost || !statsHost || !panelHost) {
    return;
  }

  preserveStaffLiveScroll(() => {
    warningHost.innerHTML = renderDependencyWarnings(dependencyWarnings);
    bannerHost.innerHTML = isManualDispatchVenue(venue)
      ? `
        <div class="alert alert-blue" style="margin-bottom:18px;">
          <div>${isWaitlistOnlyVenue(venue) ? 'Waitlist-only mode is active. Notify the next party, then verify their OTP to complete the visit.' : 'Manual dispatch mode is active. Use the queue row to notify the next party, then seat by OTP when they arrive.'}</div>
        </div>
      `
      : '';
    statsHost.innerHTML = renderStaffStatsTiles(stats, venue);
    panelHost.innerHTML = renderStaffActiveTabPanel({
      currentTab,
      queueModuleEnabled,
      historyTabEnabled,
      waiting,
      seated,
      seatedBills,
      tables,
      recentTableEvents,
      venue,
    });
  });

  scheduleRefresh(() => refreshStaffDashboardLivePanel({
    activeSlug,
    scheduledTab: currentTab,
    refreshToken,
  }), resolveStaffDashboardRefreshMs({ currentTab, dependencyWarnings }));
}

function renderAdminMenuTab(categories, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  return `
    <div class="card">
      <div class="card-title">Live menu</div>
      <div class="card-sub">Every item is grouped by category. Toggle availability without leaving the service shell.</div>
      ${categories.length ? categories.map((category) => `
        <div style="margin-bottom:18px;">
          <div class="cat-header">
            <div class="cat-header-name">${escapeHtml(category.name)}</div>
            <div class="cat-header-line"></div>
          </div>
          ${(category.items || []).length ? category.items.map((item) => `
            <div class="q-row">
              <div class="q-row-num">${item.isAvailable ? 'On' : 'Off'}</div>
              <div class="q-row-info">
                <div class="q-row-name">
                  ${escapeHtml(item.name)}
                  ${item.isAvailable ? '<span class="badge badge-ready">Live</span>' : '<span class="badge badge-neutral">Disabled</span>'}
                </div>
                <div class="q-row-meta">${escapeHtml(item.description || 'No description')}</div>
                <div class="q-row-orders">${formatMoney(menuItemTotal(item))} · GST ${item.gstPercent}% ${item.isAlcohol ? '· Alcohol' : item.isVeg ? '· Veg' : ''}</div>
              </div>
              <div class="q-row-actions">
                <button class="btn btn-secondary btn-sm" data-admin-toggle="${item.id}">${item.isAvailable ? 'Disable' : 'Enable'}</button>
                <button class="btn btn-danger btn-sm" data-admin-remove="${item.id}">Remove</button>
              </div>
            </div>
          `).join('') : '<div class="empty-state">No items in this category yet.</div>'}
        </div>
      `).join('') : '<div class="empty-state">No categories configured yet.</div>'}
    </div>
  `;
}

function renderAdminAddTab(categories, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Add category</div>
        <div class="card-sub">Keep menu growth category-first so the guest ordering surface stays grouped and readable.</div>
        <form id="admin-category-form">
          <div class="form-group">
            <label class="form-label" for="admin-category-name">Category name</label>
            <input class="form-input" id="admin-category-name" required placeholder="Chef specials">
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-category-sort">Sort order</label>
            <input class="form-input" id="admin-category-sort" type="number" min="0" value="0">
          </div>
          <button class="btn btn-secondary btn-full" type="submit">Create category</button>
        </form>
      </div>
      <div class="card">
        <div class="card-title">Add item</div>
        <div class="card-sub">This uses the live menu API. Category IDs can now use the existing seeded string IDs instead of UUIDs only.</div>
        <form id="admin-item-form">
          <div class="form-group">
            <label class="form-label" for="admin-item-category">Category</label>
            <select class="form-select" id="admin-item-category" required>
              <option value="">Select category</option>
              ${categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-item-name">Item name</label>
            <input class="form-input" id="admin-item-name" required placeholder="Masala peanuts">
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-item-description">Description</label>
            <input class="form-input" id="admin-item-description" placeholder="Fast bar snack">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="admin-item-price">Price (INR)</label>
              <input class="form-input" id="admin-item-price" type="number" min="1" step="0.01" required value="250">
            </div>
            <div class="form-group">
              <label class="form-label" for="admin-item-gst">GST %</label>
              <input class="form-input" id="admin-item-gst" type="number" min="0" max="40" required value="5">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="admin-item-sort">Sort order</label>
              <input class="form-input" id="admin-item-sort" type="number" min="0" value="0">
            </div>
            <div class="form-group" style="display:flex; gap:12px; align-items:center; padding-top:24px;">
              <label class="checkbox-row"><input type="checkbox" id="admin-item-veg"> Veg</label>
              <label class="checkbox-row"><input type="checkbox" id="admin-item-alcohol"> Alcohol</label>
            </div>
          </div>
          <button class="btn btn-primary btn-full" type="submit">Create item</button>
        </form>
      </div>
    </div>
  `;
}

function renderAdminContentTab(blocks, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  const orderedBlocks = [...(blocks || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return `
    <div class="grid grid-2">
      ${orderedBlocks.map((block) => `
        <div class="card">
          <div class="card-title">${escapeHtml(getWaitContentSlotLabel(block.slot))}</div>
          <div class="card-sub">Control how this card appears on the guest wait page. Image input is URL-based for now.</div>
          <form data-content-form="${block.slot}">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Title</label>
                <input class="form-input" name="title" maxlength="120" value="${escapeHtml(block.title || '')}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Sort order</label>
                <input class="form-input" name="sortOrder" type="number" min="0" max="999" value="${Number(block.sortOrder || 0)}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Body</label>
              <textarea class="form-input" name="body" rows="4" maxlength="2000" placeholder="Short guest-facing description">${escapeHtml(block.body || '')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Image URL</label>
              <input class="form-input" name="imageUrl" type="url" placeholder="https://..." value="${escapeHtml(block.imageUrl || '')}">
            </div>
            <label class="checkbox-row" style="margin-bottom:16px;">
              <input type="checkbox" name="isEnabled" ${block.isEnabled ? 'checked' : ''}>
              Show this card on the guest wait page
            </label>
            <button class="btn btn-primary btn-full" type="submit">Save ${escapeHtml(getWaitContentSlotLabel(block.slot))}</button>
          </form>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAdminTablesTab(tables, venue) {
  if (isWaitlistOnlyVenue(venue)) {
    return '';
  }
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Current tables</div>
        <div class="card-sub">Craftery table inventory available to staff seating and manual dispatch.</div>
        ${tables.length ? tables.map((table) => `
          <div class="q-row">
            <div class="q-row-num">${escapeHtml(table.label)}</div>
            <div class="q-row-info">
              <div class="q-row-name">${table.capacity} seats${table.section ? ` · ${escapeHtml(table.section)}` : ''}</div>
              <div class="q-row-meta">${escapeHtml(table.status || 'FREE')}${table.tmsTableId ? ` · TMS ${escapeHtml(table.tmsTableId)}` : ''}</div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">No tables configured yet.</div>'}
      </div>
      <div class="card">
        <div class="card-title">Add table</div>
        <div class="card-sub">Create a new table definition for staff seating. Editing and deletion can follow later.</div>
        <form id="admin-table-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="admin-table-label">Label</label>
              <input class="form-input" id="admin-table-label" required placeholder="P5">
            </div>
            <div class="form-group">
              <label class="form-label" for="admin-table-capacity">Capacity</label>
              <input class="form-input" id="admin-table-capacity" type="number" min="1" max="30" required value="2">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-table-section">Section</label>
            <input class="form-input" id="admin-table-section" placeholder="Indoor">
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-table-tms-id">TMS table ID</label>
            <input class="form-input" id="admin-table-tms-id" placeholder="Optional">
          </div>
          <button class="btn btn-primary btn-full" type="submit">Create table</button>
        </form>
      </div>
    </div>
  `;
}

function showFlowLogModal(entryId, events) {
  const existing = document.getElementById('flow-log-modal');
  if (existing) existing.remove();

  const typeLabels = {
    QUEUE_JOINED: 'Joined queue',
    PREORDER_CREATED: 'Pre-order created',
    PREORDER_REPLACED: 'Pre-order replaced',
    DEPOSIT_INITIATED: 'Deposit initiated',
    DEPOSIT_CAPTURED: 'Deposit captured',
    TABLE_NOTIFIED: 'Table ready notified',
    GUEST_SEATED: 'Guest seated',
    TABLE_ORDER_CREATED: 'Table order placed',
    FINAL_PAYMENT_INITIATED: 'Final payment initiated',
    FINAL_PAYMENT_CAPTURED: 'Final payment captured',
    OFFLINE_SETTLED: 'Settled offline',
    ENTRY_COMPLETED: 'Session completed',
    ENTRY_CANCELLED: 'Session cancelled',
    DEPOSIT_REFUNDED: 'Deposit refunded',
  };

  const isReconstructed = events.length > 0 && events[0].reconstructed;

  const rows = events.length
    ? events.map((ev) => {
        const snap = ev.snapshot || {};
        const details = Object.entries(snap)
          .filter(([k, v]) => v !== null && v !== undefined && k !== 'note')
          .map(([k, v]) => `<span class="mono">${escapeHtml(k)}</span>: ${typeof v === 'object' ? escapeHtml(JSON.stringify(v)) : escapeHtml(String(v))}`)
          .join(' · ');
        return `
          <div class="flow-event-row">
            <div class="flow-event-type">${escapeHtml(typeLabels[ev.type] || ev.type)}</div>
            <div class="flow-event-time">${new Date(ev.createdAt).toLocaleString()}</div>
            ${details ? `<div class="flow-event-snap">${details}</div>` : ''}
          </div>
        `;
      }).join('')
    : '<div class="empty-state">No flow events recorded for this session yet.</div>';

  const modal = document.createElement('div');
  modal.id = 'flow-log-modal';
  modal.className = 'flow-log-overlay';
  modal.innerHTML = `
    <div class="flow-log-panel">
      <div class="flow-log-header">
        <div class="card-title">Order flow log</div>
        <div class="card-sub">Entry <span class="mono">${escapeHtml(entryId.slice(0, 8))}</span> · ${events.length} event${events.length === 1 ? '' : 's'}${isReconstructed ? ' · <em>Reconstructed from records</em>' : ''}</div>
        <button class="btn btn-secondary btn-sm flow-log-close" type="button">&times; Close</button>
      </div>
      <div class="flow-log-body">${rows}</div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.flow-log-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function renderShell({ pill, body, right = '' }) {
  return `
    <main class="app-shell">
      <header class="app-header">
        <div class="header-left">
          <div class="header-logo">fl<em>o</em>ck</div>
          <div class="header-pill">${escapeHtml(pill)}</div>
        </div>
        <div class="header-right">${right}</div>
      </header>
      <section class="app-body">${body}</section>
    </main>
  `;
}

function renderStepBar(activeStep, labels = ['Queue', 'Pre-order', 'Seated', 'Pay']) {
  return `
    <div class="steps">
      ${labels.map((label, index) => {
        const stepNumber = index + 1;
        const className = activeStep > stepNumber ? 'done' : activeStep === stepNumber ? 'active' : '';
        return `
          <div class="step ${className}">
            <div class="step-dot">${stepNumber}</div>
            <div class="step-label">${label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getBucketItemCount(summary) {
  return (summary?.lines || []).reduce((sum, line) => sum + (line.quantity || 0), 0);
}

function getAvailableGuestTrays(venue) {
  return isVenueFeatureEnabled(venue, 'seatedOrdering')
    ? ['menu', 'bucket', 'ordered']
    : ['ordered'];
}

function clampGuestTrayForVenue(venue, requestedTray) {
  const availableTrays = getAvailableGuestTrays(venue);
  if (availableTrays.includes(requestedTray)) {
    return requestedTray;
  }
  return availableTrays[0];
}

function renderGuestBottomNav(activeTray, itemCount, availableTrays = ['menu', 'bucket', 'ordered']) {
  return `
    <nav class="guest-bottom-nav" aria-label="Guest ordering trays">
      ${[
        ['menu', 'Menu'],
        ['bucket', 'Your Bucket'],
        ['ordered', 'Ordered'],
      ].filter(([key]) => availableTrays.includes(key)).map(([key, label]) => `
        <button class="guest-bottom-nav-btn ${activeTray === key ? 'active' : ''}" type="button" data-guest-tray="${key}">
          <span>${label}</span>
          ${key === 'bucket' && itemCount > 0 ? `<span class="guest-bottom-badge">${itemCount}</span>` : ''}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderFloatingPayButton(balanceDue, enabled = true) {
  if (!enabled || !balanceDue || balanceDue <= 0) {
    return '';
  }

  return `
    <div class="floating-pay-wrap">
      <button class="btn btn-primary btn-full floating-pay-btn" id="floating-final-pay-cta" type="button">
        Pay ${formatMoney(balanceDue)}
      </button>
    </div>
  `;
}

function renderGuestCategoryTabs(categories, activeCategoryId) {
  return `
    <div class="category-pills" data-category-tabs="guest">
      ${categories.map((category) => `
        <button
          class="category-pill ${activeCategoryId === category.id ? 'active' : ''}"
          type="button"
          data-category-jump="${category.id}">
          ${escapeHtml(category.name)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderBucketMenuSections(categories, cart) {
  return categories.map((category) => `
    <section id="guest-category-${category.id}" data-guest-category-section="${category.id}">
      <div class="cat-header">
        <div class="cat-header-name">${escapeHtml(category.name)}</div>
        <div class="cat-header-line"></div>
      </div>
      <div class="menu-grid">
        ${category.items.map((item) => {
          const qty = cart[item.id] || 0;
          const selected = qty > 0 ? 'selected' : '';
          return `
            <div class="menu-item ${selected}">
              <div class="menu-item-body">
                <div class="menu-item-name">${escapeHtml(item.name)}</div>
                <div class="menu-item-desc">${escapeHtml(item.description || 'No description')}</div>
                <div class="menu-item-price">${formatMoney(menuItemTotal(item))}</div>
              </div>
              <div class="menu-item-foot">
                <div class="qty-ctrl">
                  <button class="qty-btn" type="button" data-bucket-item data-item-id="${item.id}" data-delta="-1">−</button>
                  <span class="qty-num ${qty > 0 ? 'active' : ''}">${qty}</span>
                  <button class="qty-btn" type="button" data-bucket-item data-item-id="${item.id}" data-delta="1">+</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function renderGuestMenuTray({ venue, draftCart }) {
  const categories = venue.menuCategories || [];
  const activeCategoryId = uiState.guestMenuActiveCategory || categories[0]?.id || null;

  return `
    <section class="guest-tray-panel" data-guest-tray-panel="menu">
      <div class="section-head">
        <div class="section-title">Menu</div>
        <div class="section-sub">Browse by category and build your next round. Nothing is sent until you confirm from Your Bucket.</div>
      </div>
      ${categories.length ? renderGuestCategoryTabs(categories, activeCategoryId) : ''}
      ${renderBucketMenuSections(categories, draftCart)}
    </section>
  `;
}

function renderGuestBucketTray({ draftSummary }) {
  return `
    <section class="guest-tray-panel" data-guest-tray-panel="bucket">
      <div class="section-head">
        <div class="section-title">Your Bucket</div>
        <div class="section-sub">This draft round is shared across the active table session until it is sent.</div>
      </div>
      <div class="card">
        ${uiState.partyBucket.lastSyncError ? `
          <div class="alert alert-amber" style="margin-bottom:16px;"><div>Sync delayed. Retrying in the background.</div></div>
        ` : ''}
        ${draftSummary.lines.length ? draftSummary.lines.map((line) => `
          <div class="order-line order-line-editable">
            <div>
              <div class="order-line-name">${escapeHtml(line.name)}</div>
              <div class="order-line-qty">${line.quantity} x ${formatMoney(line.unitTotal)}</div>
            </div>
            <div class="bucket-line-actions">
              <div class="qty-ctrl">
                <button class="qty-btn" type="button" data-bucket-line-item data-item-id="${line.id}" data-delta="-1" aria-label="${line.quantity > 1 ? 'Decrease quantity' : 'Remove item'}">-</button>
                <span class="qty-num ${line.quantity > 0 ? 'active' : ''}">${line.quantity}</span>
                <button class="qty-btn" type="button" data-bucket-line-item data-item-id="${line.id}" data-delta="1" aria-label="Increase quantity">+</button>
              </div>
              <div class="order-line-price">${formatMoney(line.total)}</div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">Add items from Menu to build your next round.</div>'}
        <div class="order-total">
          <div class="order-total-label">Round total</div>
          <div class="order-total-val">${formatMoney(draftSummary.total)}</div>
        </div>
        <button class="btn btn-primary btn-full" id="submit-table-order" style="margin-top:16px;" ${draftSummary.lines.length ? '' : 'disabled'}>
          ${uiState.tableOrderSubmitting ? 'Sending order...' : 'Send order to table'}
        </button>
      </div>
    </section>
  `;
}

function renderGuestOrderedTray({ entry, bill, venue }) {
  const preOrders = entry.orders.filter((order) => order.type === 'PRE_ORDER');
  const tableOrders = entry.orders.filter((order) => order.type === 'TABLE_ORDER');
  const finalPaymentEnabled = isVenueFeatureEnabled(venue, 'finalPayment');

  return `
    <section class="guest-tray-panel" data-guest-tray-panel="ordered">
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Ordered so far</div>
          <div class="card-sub">Locked pre-orders and every submitted table round appear here.</div>
          ${preOrders.length ? preOrders.map((order) => renderGuestOrderBlock(order, 'Pre-order', 'Locked')).join('') : '<div class="empty-state">No pre-order items were locked before seating.</div>'}
          ${tableOrders.length ? tableOrders.map((order) => renderGuestOrderBlock(order, 'Table order')).join('') : '<div class="empty-state" style="margin-top:14px;">No add-on table orders yet.</div>'}
        </div>
        <div class="card">
          <div class="card-title">Bill</div>
          <div class="card-sub">Live bill for this table session.</div>
          ${bill ? `
            <div class="order-line"><div class="order-line-name">Subtotal</div><div class="order-line-price">${formatMoney(bill.summary.subtotalExGst)}</div></div>
            <div class="order-line"><div class="order-line-name">CGST</div><div class="order-line-price">${formatMoney(bill.summary.cgst)}</div></div>
            <div class="order-line"><div class="order-line-name">SGST</div><div class="order-line-price">${formatMoney(bill.summary.sgst)}</div></div>
            <div class="order-line"><div class="order-line-name">Deposit paid</div><div class="order-line-price">${formatMoney(bill.summary.depositPaid)}</div></div>
            <div class="order-total">
              <div class="order-total-label">Balance due</div>
              <div class="order-total-val">${formatMoney(bill.summary.balanceDue)}</div>
            </div>
            ${bill.summary.balanceDue > 0 && finalPaymentEnabled ? `
              <button class="btn btn-primary btn-full" id="final-pay-cta" style="margin-top:16px;">${uiState.paymentSubmitting ? 'Preparing payment...' : 'Pay balance'}</button>
            ` : bill.summary.balanceDue > 0 ? `
              <div class="alert alert-blue" style="margin-top:16px;"><div>Online balance payment is disabled for this venue. Please settle with the venue team.</div></div>
            ` : ''}
          ` : '<div class="empty-state">Bill data unavailable.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderSeatedGuestShell({ entry, venue, bill, guestSession }) {
  const draftSummary = buildCartSummary(venue.menuCategories || [], BucketStore.getDraftCart());
  const bucketItemCount = getBucketItemCount(draftSummary);
  const availableTrays = getAvailableGuestTrays(venue);
  const activeTray = clampGuestTrayForVenue(venue, uiState.guestTray);
  const participantCount = Math.max(
    1,
    Number(uiState.partySessionMeta?.participantCount || uiState.partyParticipants.length || 1),
  );
  return `
    <div class="guest-seated-shell">
      <div class="guest-shell-top card">
        <div class="guest-shell-eyebrow">Table ${entry.table?.label ? escapeHtml(entry.table.label) : 'assigned'}</div>
        <div class="guest-shell-title">Now seated</div>
        <div class="guest-shell-sub">Add to your next round from Menu, review live totals in Ordered, and only pay the remaining balance when ready.</div>
        <div class="guest-shell-meta">${participantCount} guest${participantCount === 1 ? '' : 's'} in this table session</div>
        ${entry.table?.section ? `<div class="guest-shell-meta">Section: ${escapeHtml(entry.table.section)}</div>` : ''}
        ${entry.displayRef ? `<div class="guest-shell-meta">Ref: <span class="mono">${escapeHtml(entry.displayRef)}</span></div>` : ''}
      </div>
      <div id="guest-tray-host"></div>
      <div id="guest-floating-pay-host">${renderFloatingPayButton(bill?.summary?.balanceDue || 0, isVenueFeatureEnabled(venue, 'finalPayment'))}</div>
      <div id="guest-bucket-toast-host"></div>
      <div id="guest-bottom-nav-host">${renderGuestBottomNav(activeTray, bucketItemCount, availableTrays)}</div>
    </div>
  `;
}

function mountGuestCategoryTracking() {
  const sections = [...document.querySelectorAll('[data-guest-category-section]')];
  const buttons = [...document.querySelectorAll('[data-category-jump]')];
  if (!sections.length || !buttons.length || !window.IntersectionObserver) {
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    const activeId = visible.target.getAttribute('data-guest-category-section');
    uiState.guestMenuActiveCategory = activeId;
    buttons.forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-category-jump') === activeId);
    });
  }, {
    root: null,
    rootMargin: '-120px 0px -55% 0px',
    threshold: [0.2, 0.45, 0.75],
  });

  sections.forEach((section) => observer.observe(section));
}

function mountSeatedGuestExperience({ slug, entry, venue, bill, guestSession }) {
  const trayHost = document.getElementById('guest-tray-host');
  const navHost = document.getElementById('guest-bottom-nav-host');
  const payHost = document.getElementById('guest-floating-pay-host');
  const toastHost = document.getElementById('guest-bucket-toast-host');
  if (!trayHost || !navHost || !payHost) {
    return;
  }

  uiState.activeGuestView = {
    slug,
    entryId: entry.id,
    entry,
    venue,
    bill,
    guestSession,
    refreshSeatedShell: null,
  };

  const renderTrayShell = () => {
    const liveView = uiState.activeGuestView || {
      slug,
      entryId: entry.id,
      entry,
      venue,
      bill,
      guestSession,
      refreshSeatedShell: null,
    };
    const liveEntry = liveView.entry;
    const liveVenue = liveView.venue;
    const liveBill = liveView.bill;
    const liveGuestSession = liveView.guestSession;
    const draftCart = BucketStore.getDraftCart();
    const draftSummary = buildCartSummary(liveVenue.menuCategories || [], draftCart);
    const bucketCount = getBucketItemCount(draftSummary);
    const availableTrays = getAvailableGuestTrays(liveVenue);

    uiState.guestTray = clampGuestTrayForVenue(liveVenue, uiState.guestTray);

    uiState.activeGuestView = {
      ...liveView,
      refreshSeatedShell: renderTrayShell,
    };

    navHost.innerHTML = renderGuestBottomNav(uiState.guestTray, bucketCount, availableTrays);

    const showFloatingPay = isVenueFeatureEnabled(liveVenue, 'finalPayment') && uiState.guestTray !== 'ordered';
    payHost.innerHTML = showFloatingPay ? renderFloatingPayButton(liveBill?.summary?.balanceDue || 0, true) : '';

    if (toastHost) {
      const showToast = uiState.guestTray === 'menu' && bucketCount > 0;
      const prevKey = toastHost.dataset.toastKey || '';
      const nextKey = showToast ? `show:${bucketCount}` : 'hide';
      if (prevKey !== nextKey) {
        toastHost.dataset.toastKey = nextKey;
        toastHost.innerHTML = showToast ? `
          <div class="bucket-toast">
            <span class="bucket-toast-text">${bucketCount} item${bucketCount === 1 ? '' : 's'} in your bucket</span>
            <button class="btn btn-primary btn-sm bucket-toast-btn" type="button" data-toast-go-bucket>View Bucket</button>
          </div>
        ` : '';
        toastHost.querySelector('[data-toast-go-bucket]')?.addEventListener('click', () => {
          uiState.guestTray = 'bucket';
          uiState.guestTrayUserChosen = true;
          renderTrayShell();
        });
      }
    }

    if (uiState.guestTray === 'menu') {
      trayHost.innerHTML = renderGuestMenuTray({ venue: liveVenue, draftCart });

      trayHost.querySelectorAll('[data-bucket-item]').forEach((button) => {
        button.addEventListener('click', () => {
          const menuItemId = button.getAttribute('data-item-id');
          const delta = Number(button.getAttribute('data-delta'));
          if (uiState.activePartySessionId) {
            applyPartyBucketDelta(menuItemId, delta);
          } else {
            BucketStore.updateItem(liveEntry.id, menuItemId, delta);
            renderTrayShell();
          }
        });
      });

      trayHost.querySelectorAll('[data-category-jump]').forEach((button) => {
        button.addEventListener('click', () => {
          const categoryId = button.getAttribute('data-category-jump');
          uiState.guestMenuActiveCategory = categoryId;
          trayHost.querySelectorAll('[data-category-jump]').forEach((pill) => {
            pill.classList.toggle('active', pill.getAttribute('data-category-jump') === categoryId);
          });
          const target = document.getElementById(`guest-category-${categoryId}`);
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      mountGuestCategoryTracking();
    } else if (uiState.guestTray === 'bucket') {
      trayHost.innerHTML = renderGuestBucketTray({ draftSummary });

      trayHost.querySelectorAll('[data-bucket-line-item]').forEach((button) => {
        button.addEventListener('click', () => {
          const menuItemId = button.getAttribute('data-item-id');
          const delta = Number(button.getAttribute('data-delta'));
          if (uiState.activePartySessionId) {
            applyPartyBucketDelta(menuItemId, delta);
          } else {
            BucketStore.updateItem(liveEntry.id, menuItemId, delta);
            renderTrayShell();
          }
        });
      });

      trayHost.querySelector('#submit-table-order')?.addEventListener('click', async () => {
        if (uiState.tableOrderSubmitting) return;

        const activeGuestSession = getGuestSession(liveEntry.id);
        if (!activeGuestSession?.guestToken) {
          setFlash('amber', 'Re-enter OTP to continue ordering.');
          await renderGuestEntry(slug, liveEntry.id);
          return;
        }

        uiState.tableOrderSubmitting = true;
        renderTrayShell();

        try {
          const order = await apiRequest('/orders/table/guest', {
            method: 'POST',
            auth: 'guest',
            guestToken: activeGuestSession.guestToken,
            body: {
              queueEntryId: liveEntry.id,
              items: draftSummary.lines.map((line) => ({
                menuItemId: line.id,
                quantity: line.quantity,
              })),
            },
          });

          BucketStore.clearDraftCart();
          if (uiState.activePartySessionId) {
            try {
              await flushPartyBucketToServer({ force: true });
            } catch (_error) {
              setFlash('amber', 'Order was sent, but the shared bucket needs a refresh.');
              await refreshPartySessionState({ includeSummary: false, rerender: false });
            }
          }
          uiState.guestTray = 'ordered';
          uiState.guestTrayUserChosen = true;
          setFlash(
            order.posSync?.status === 'manual_fallback' ? 'amber' : 'green',
            order.posSync?.status === 'manual_fallback'
              ? 'Order recorded. Venue is using manual kitchen sync right now.'
              : 'Table order sent to the venue.'
          );
          await renderGuestEntry(slug, liveEntry.id);
        } catch (error) {
          setFlash('red', error.message);
          await renderGuestEntry(slug, liveEntry.id);
        } finally {
          uiState.tableOrderSubmitting = false;
        }
      });
    } else {
      trayHost.innerHTML = renderGuestOrderedTray({ entry: liveEntry, bill: liveBill, venue: liveVenue });

      document.getElementById('final-pay-cta')?.addEventListener('click', async () => {
        if (uiState.paymentSubmitting) return;

        uiState.paymentSubmitting = true;
        renderTrayShell();

        try {
          await runHostedPayment({
            title: 'Flock final bill',
            initiatePath: '/payments/final/initiate',
            initiateBody: {
              venueId: liveVenue.id,
              queueEntryId: liveEntry.id,
            },
            capturePath: '/payments/final/capture',
            prefill: {
              name: liveEntry.guestName,
              contact: liveEntry.guestPhone,
            },
            auth: 'guest',
            guestToken: liveGuestSession.guestToken,
            apiRequest,
          });
          setFlash('green', 'Final payment captured.');
          await renderGuestEntry(slug, liveEntry.id);
        } catch (error) {
          setFlash('red', error.message);
          await renderGuestEntry(slug, liveEntry.id);
        } finally {
          uiState.paymentSubmitting = false;
        }
      });
    }

    navHost.querySelectorAll('[data-guest-tray]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTray = button.getAttribute('data-guest-tray');
        if (nextTray === uiState.guestTray) return;
        uiState.guestTray = nextTray;
        uiState.guestTrayUserChosen = true;
        renderTrayShell();
      });
    });

    payHost.querySelector('#floating-final-pay-cta')?.addEventListener('click', async () => {
      if (uiState.paymentSubmitting) return;

      uiState.paymentSubmitting = true;
      renderTrayShell();

      try {
        await runHostedPayment({
          title: 'Flock final bill',
          initiatePath: '/payments/final/initiate',
          initiateBody: {
            venueId: liveVenue.id,
            queueEntryId: liveEntry.id,
          },
          capturePath: '/payments/final/capture',
          prefill: {
            name: liveEntry.guestName,
            contact: liveEntry.guestPhone,
          },
          auth: 'guest',
          guestToken: liveGuestSession.guestToken,
          apiRequest,
        });
        setFlash('green', 'Final payment captured.');
        await renderGuestEntry(slug, liveEntry.id);
      } catch (error) {
        setFlash('red', error.message);
        await renderGuestEntry(slug, liveEntry.id);
      } finally {
        uiState.paymentSubmitting = false;
      }
    });
  };

  renderTrayShell();
  startPartySessionPolling();
}

function renderSessionRef(entry) {
  if (!entry.displayRef) return '';
  return `<div class="session-ref">Session ref: <span class="mono">${escapeHtml(entry.displayRef)}</span></div>`;
}

function getQueueEntryGuestNotes(entry) {
  return entry?.guestNotes || entry?.notes || '';
}

function getQueueEntryPreferenceLabel(entry) {
  return formatQueueSeatingPreference(entry?.seatingPreference || 'FIRST_AVAILABLE');
}

function getQueueEntryEtaMin(entry, venue) {
  const storedEta = Math.max(0, Number(entry?.estimatedWaitMin || 0));
  const opsConfig = resolveVenueOpsConfig(venue);

  if (opsConfig.guestWaitFormula !== 'SUBKO_FIXED_V1') {
    return storedEta;
  }

  const position = Math.max(1, Number(entry?.position || 1));
  const baseWaitMin = Math.max(3, Math.min(8 + (3 * (position - 1)), 30));
  const joinedAtValue = entry?.joinedAt ? new Date(entry.joinedAt).getTime() : Number.NaN;

  if (!Number.isFinite(joinedAtValue)) {
    return storedEta || baseWaitMin;
  }

  const elapsedMin = Math.floor((Date.now() - joinedAtValue) / 60000);
  return Math.max(3, baseWaitMin - Math.max(0, elapsedMin));
}

function getQueueEntryEtaLabel(entry, venue) {
  const etaMin = getQueueEntryEtaMin(entry, venue);
  return etaMin > 0 ? `ETA ~${etaMin} mins` : 'Awaiting table match';
}

function getQueueEntryReadyWindowState(entry) {
  const deadlineValue = entry?.tableReadyDeadlineAt ? new Date(entry.tableReadyDeadlineAt).getTime() : null;
  if (!deadlineValue) {
    return {
      label: entry?.status === 'NOTIFIED' ? 'Host desk call active' : '',
      urgent: false,
    };
  }

  const remainingMinutes = Math.max(0, Math.ceil((deadlineValue - Date.now()) / 60000));
  if (remainingMinutes <= 0) {
    return {
      label: 'Response window expired',
      urgent: true,
    };
  }

  return {
    label: `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} left to report`,
    urgent: remainingMinutes <= 3,
  };
}

function getQueueEntryReadyWindowLabel(entry) {
  return getQueueEntryReadyWindowState(entry).label;
}

function getQueueEntryReadyWindowMinutes(entry, fallbackMin = 3) {
  const notifiedAtValue = entry?.notifiedAt ? new Date(entry.notifiedAt).getTime() : null;
  const deadlineValue = entry?.tableReadyDeadlineAt ? new Date(entry.tableReadyDeadlineAt).getTime() : null;
  if (!Number.isFinite(notifiedAtValue) || !Number.isFinite(deadlineValue) || deadlineValue <= notifiedAtValue) {
    return fallbackMin;
  }

  return Math.max(1, Math.round((deadlineValue - notifiedAtValue) / 60000));
}

function isSubkoWaitContentVenue(venue) {
  return (venue?.config?.opsConfig?.contentMode || venue?.opsConfig?.contentMode) === 'SUBKO_WAIT_CONTENT';
}

function getVenueBrandConfig(venue) {
  return venue?.config?.brandConfig || venue?.brandConfig || {};
}

function shouldShowGuestQueuePosition(venue) {
  const uiConfig = venue?.config?.uiConfig || venue?.uiConfig || {};
  return uiConfig.showQueuePosition !== false && !isWaitlistOnlyVenue(venue);
}

function getVenueContentBlocks(venue) {
  return Array.isArray(venue?.contentBlocks) ? venue.contentBlocks : [];
}

function resolveWaitContentIntroCopy(venue) {
  const venueName = resolveVenueDisplayName(venue);
  return isQueueOnlyGuestExperience(venue)
    ? `A light venue feed from ${venueName}. Keep this page open for live host updates.`
    : `A light venue feed from ${venueName}. Keep this page open for live queue updates.`;
}

function resolveVenueLandingSummary(venue) {
  const openState = venue?.isQueueOpen ? 'Queue open' : 'Queue closed';
  return [venue?.address, venue?.city, openState].filter(Boolean).join(' · ');
}

function resolveGuestJoinCopy(venue) {
  if (!isQueueOnlyGuestExperience(venue) && !isWaitlistOnlyVenue(venue)) {
    return venue.config?.uiConfig?.supportCopy || 'No app download. Use your phone number as your queue identity and receive a seating OTP instantly.';
  }

  return 'Join the waitlist, keep your phone nearby, and wait for the host call.';
}

function getVenueWaitContentMenuHighlights(venue) {
  const highlights = [];

  for (const category of venue?.menuCategories || []) {
    if (category?.name) {
      highlights.push(category.name);
    }

    const featuredItem = (category?.items || []).find((item) => item?.name);
    if (featuredItem?.name) {
      highlights.push(featuredItem.name);
    }

    if (highlights.length >= 4) {
      break;
    }
  }

  return [...new Set(highlights)].filter(Boolean).slice(0, 4);
}

function renderWaitContentChips(items, fallbackLabel) {
  if (!items.length) {
    return `<span class="wait-content-chip wait-content-chip-muted">${escapeHtml(fallbackLabel)}</span>`;
  }

  return items.map((item) => `<span class="wait-content-chip">${escapeHtml(item)}</span>`).join('');
}

function buildFallbackVenueContentBlocks(venue, entry) {
  const brandConfig = getVenueBrandConfig(venue);
  const venueName = resolveVenueDisplayName(venue);
  const venueShortName = brandConfig.shortName || venueName;
  const menuHighlights = getVenueWaitContentMenuHighlights(venue);
  const merchHighlights = [
    venueShortName,
    venue?.city,
    venue?.address ? 'Ask the host desk about current drops' : null,
  ].filter(Boolean);

  return [
    {
      slot: 'MENU',
      title: menuHighlights.length ? 'Current highlights' : 'Menu at a glance',
      body: menuHighlights.length
        ? `A quick look at the categories and dishes currently showing at ${venueShortName}.`
        : 'Menu highlights will appear once the venue feed is populated.',
      imageUrl: null,
      isEnabled: true,
      sortOrder: 10,
      chips: menuHighlights,
    },
    {
      slot: 'MERCH',
      title: venueShortName,
      body: venue?.city
        ? `Current venue touchpoints from ${venueShortName} in ${venue.city}.`
        : `Current venue touchpoints from ${venueShortName}.`,
      imageUrl: null,
      isEnabled: true,
      sortOrder: 20,
      chips: merchHighlights,
    },
    {
      slot: 'STORIES',
      title: brandConfig.tagline || `${venueName} by Subko`,
      body: entry?.status === 'NOTIFIED'
        ? 'Host desk call is active. Keep your OTP ready while the team prepares your table.'
        : 'Story feed pending.',
      imageUrl: null,
      isEnabled: false,
      sortOrder: 30,
      chips: [],
    },
    {
      slot: 'EVENTS',
      title: venue?.isQueueOpen ? 'Today' : 'Paused',
      body: venue?.isQueueOpen
        ? 'Queue updates are live and the host desk will call the next party when a table is ready.'
        : 'The queue is currently closed. Please check back with the host desk for the next opening.',
      imageUrl: null,
      isEnabled: false,
      sortOrder: 40,
      chips: [],
    },
  ];
}

function resolveEnabledVenueContentBlocks(venue, entry) {
  const blocks = getVenueContentBlocks(venue);
  const source = blocks.length ? blocks : buildFallbackVenueContentBlocks(venue, entry);
  return source
    .filter((block) => block?.isEnabled)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function getWaitContentCardClass(slot) {
  switch (slot) {
    case 'MENU':
      return 'wait-content-card wait-content-card--menu';
    case 'MERCH':
      return 'wait-content-card wait-content-card--merchandise';
    case 'STORIES':
      return 'wait-content-card wait-content-card--stories';
    case 'EVENTS':
      return 'wait-content-card wait-content-card--events';
    default:
      return 'wait-content-card';
  }
}

function getWaitContentSlotLabel(slot) {
  switch (slot) {
    case 'MENU':
      return 'Menu';
    case 'MERCH':
      return 'Merchandise';
    case 'STORIES':
      return 'Stories';
    case 'EVENTS':
      return 'Events';
    default:
      return slot;
  }
}

function renderSubkoWaitContentBlock(venue, entry) {
  if (isWaitlistOnlyVenue(venue) || !isQueueOnlyGuestExperience(venue) || !isSubkoWaitContentVenue(venue)) {
    return '';
  }

  const blocks = resolveEnabledVenueContentBlocks(venue, entry);
  if (!blocks.length) {
    return '';
  }

  return `
    <section class="wait-content" data-wait-content="subko">
      <div class="section-head wait-content-head">
        <div class="section-title">While you wait</div>
        <div class="section-sub">${escapeHtml(resolveWaitContentIntroCopy(venue))}</div>
      </div>
      <div class="wait-content-grid">
        ${blocks.map((block) => `
          <article class="${getWaitContentCardClass(block.slot)}">
            <div class="wait-content-label">${escapeHtml(getWaitContentSlotLabel(block.slot))}</div>
            <div class="wait-content-title">${escapeHtml(block.title || getWaitContentSlotLabel(block.slot))}</div>
            ${block.imageUrl ? `<img class="wait-content-image" src="${escapeHtml(block.imageUrl)}" alt="${escapeHtml(block.title || getWaitContentSlotLabel(block.slot))}">` : ''}
            <div class="wait-content-copy">${escapeHtml(block.body || '')}</div>
            ${Array.isArray(block.chips) ? `<div class="wait-content-chip-row">${renderWaitContentChips(block.chips.filter(Boolean), 'No updates yet')}</div>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderGuestStateHero(entry, guestSession, venue) {
  const guestOtp = guestSession?.otp;
  const queueOnlyGuestExperience = isQueueOnlyGuestExperience(venue);
  const manualDispatchEnabled = isManualDispatchVenue(venue);
  const showQueuePosition = shouldShowGuestQueuePosition(venue);

  if (entry.status === 'WAITING') {
    const etaMin = getQueueEntryEtaMin(entry, venue);
    const pct = Math.max(10, Math.min(95, Math.round(100 - (Math.max(etaMin, 1) * 3))));
    return `
      <div class="queue-hero">
        <div class="queue-pos-num">${showQueuePosition ? entry.position : Math.max(etaMin, 0)}</div>
        <div class="queue-pos-label">${showQueuePosition ? (queueOnlyGuestExperience ? 'Waitlist position' : 'Queue position') : 'Estimated wait'}</div>
        <div class="queue-pos-sub">${queueOnlyGuestExperience
          ? (manualDispatchEnabled ? 'The host desk will call your party when it is your turn.' : 'We will message you once it is your turn.')
          : 'We will notify you when a matching table clears.'}</div>
        ${renderSessionRef(entry)}
      </div>
      <div class="wait-strip">
        <span class="wait-strip-ring" style="--pct:${pct}%"></span>
        <span class="wait-strip-val">${etaMin || 0}</span>
        <span class="wait-strip-unit">min wait</span>
      </div>
      <div class="otp-block">
        <div class="otp-num">${guestOtp ? escapeHtml(guestOtp) : 'Active'}</div>
        <div class="otp-label">${guestOtp ? 'Show this OTP when called' : 'Your seating code is active on this device'}</div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button class="btn btn-secondary btn-full" id="leave-waitlist-cta" type="button">Leave waitlist</button>
      </div>
    `;
  }

  if (entry.status === 'NOTIFIED') {
    const readyWindowLabel = getQueueEntryReadyWindowLabel(entry);
    const readyWindowState = getQueueEntryReadyWindowState(entry);
    const readyWindowMin = getQueueEntryReadyWindowMinutes(entry, venue?.tableReadyWindowMin || 3);
    return `
      <div class="queue-hero">
        <div class="queue-pos-num">${queueOnlyGuestExperience ? 'Called' : escapeHtml(entry.table?.label || 'Now')}</div>
        <div class="queue-pos-label">${queueOnlyGuestExperience ? 'Called to host desk' : 'Table ready'}</div>
        <div class="queue-pos-sub">${queueOnlyGuestExperience
          ? `Return to the host desk within ${readyWindowMin} minutes and show the OTP to staff.`
          : 'Head to the entrance and show the OTP to staff.'}</div>
        ${renderSessionRef(entry)}
        ${readyWindowLabel ? `<div class="queue-countdown ${readyWindowState.urgent ? 'urgent' : ''}">${escapeHtml(readyWindowLabel)}</div>` : ''}
      </div>
      <div class="otp-block">
        <div class="otp-num">${guestOtp ? escapeHtml(guestOtp) : 'Active'}</div>
        <div class="otp-label">${guestOtp ? 'Your reserved table is waiting' : 'Use your active seating code when you arrive'}</div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button class="btn btn-secondary btn-full" id="leave-waitlist-cta" type="button">Leave waitlist</button>
      </div>
    `;
  }

  if (entry.status === 'SEATED') {
    return `
      <div class="queue-hero">
        <div class="queue-pos-num">${queueOnlyGuestExperience ? 'Done' : escapeHtml(entry.table?.label || 'Seated')}</div>
        <div class="queue-pos-label">${queueOnlyGuestExperience ? 'Visit complete' : 'Now seated'}</div>
        <div class="queue-pos-sub">${queueOnlyGuestExperience ? 'This visit has been marked complete. Thanks for waiting with us.' : 'Your table is live. Add more items from your phone and clear the balance when ready.'}</div>
      </div>
    `;
  }

  if (entry.status === 'COMPLETED') {
    return `
      <div class="queue-hero">
        <div class="queue-pos-num">Done</div>
        <div class="queue-pos-label">${queueOnlyGuestExperience ? 'Visit complete' : 'Service complete'}</div>
        <div class="queue-pos-sub">${queueOnlyGuestExperience ? 'This visit has been marked complete. Thanks for waiting with us.' : 'Payment is captured and the table can move into the next turn.'}</div>
        ${renderSessionRef(entry)}
      </div>
    `;
  }

  return `
    <div class="queue-hero">
      <div class="queue-pos-num">Closed</div>
      <div class="queue-pos-label">${escapeHtml(entry.status)}</div>
      <div class="queue-pos-sub">This queue entry is no longer active.</div>
    </div>
  `;
}

function renderGuestStateCards({ slug, entry, venue, bill, guestSession, tableCartSummary }) {
  const isPartyJoiner = Boolean(guestSession?.isPartyJoiner);
  const preOrderEnabled = isVenueFeatureEnabled(venue, 'preOrder');
  const seatedOrderingEnabled = isVenueFeatureEnabled(venue, 'seatedOrdering');
  const finalPaymentEnabled = isVenueFeatureEnabled(venue, 'finalPayment');
  const queueOnlyGuestExperience = isQueueOnlyGuestExperience(venue);
  const manualDispatchEnabled = isManualDispatchVenue(venue);

  if (entry.status === 'WAITING') {
    if (queueOnlyGuestExperience) {
      return `
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">Waiting list status</div>
            <div class="card-sub">Your phone number is your queue identity. The host desk will call you once it is your turn.</div>
            <div class="alert alert-blue"><div>Once notified, please return to the host desk within ${venue.tableReadyWindowMin} minutes or your turn may move on to the next party.</div></div>
          </div>
          <div class="card">
            <div class="card-title">Venue</div>
            <div class="card-sub">${escapeHtml(venue.name)} · ${escapeHtml(venue.city)}</div>
            <div class="muted">Party size: ${entry.partySize} pax</div>
            <div class="muted">Seating preference: ${escapeHtml(getQueueEntryPreferenceLabel(entry))}</div>
            ${getQueueEntryGuestNotes(entry) ? `<div class="muted">Notes: ${escapeHtml(getQueueEntryGuestNotes(entry))}</div>` : ''}
            <div class="muted">Response window: ${venue.tableReadyWindowMin} minutes</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Waiting state</div>
          <div class="card-sub">Phone number is the guest identity. The seating OTP is already active.</div>
          <div class="alert alert-blue"><div>WhatsApp and SMS notifications are sent through the backend notification layer.</div></div>
          ${entry.depositPaid > 0
            ? isPartyJoiner
              ? `<div class="alert alert-blue"><div>The host has already placed a pre-order (${formatMoney(entry.preOrderTotal || 0)}). You can add more items once seated.</div></div>`
              : `<div class="alert alert-green"><div>Deposit captured: ${formatMoney(entry.depositPaid)}. Pre-order total: ${formatMoney(entry.preOrderTotal || 0)}.</div></div>`
            : preOrderEnabled
              ? `<button class="btn btn-primary" id="preorder-cta">Pre-order now</button>`
              : `<div class="alert alert-blue"><div>Pre-order is disabled for this venue.</div></div>`
          }
        </div>
        <div class="card">
          <div class="card-title">Venue</div>
          <div class="card-sub">${escapeHtml(venue.name)} · ${escapeHtml(venue.city)}</div>
          <div class="muted">Default deposit policy: ${venue.depositPercent}%</div>
          <div class="muted">Queue open: ${venue.isQueueOpen ? 'Yes' : 'No'}</div>
        </div>
      </div>
    `;
  }

  if (entry.status === 'NOTIFIED') {
    if (queueOnlyGuestExperience) {
      const readyWindowLabel = getQueueEntryReadyWindowLabel(entry);
      const readyWindowState = getQueueEntryReadyWindowState(entry);
      return `
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">Called to host desk</div>
            <div class="card-sub">A host is ready to verify the OTP and complete your visit.</div>
            <div class="alert alert-green"><div>Return to the host desk within ${getQueueEntryReadyWindowMinutes(entry, venue.tableReadyWindowMin)} minutes and show the OTP to staff.</div></div>
            ${readyWindowLabel ? `<div class="queue-countdown ${readyWindowState.urgent ? 'urgent' : ''}">${escapeHtml(readyWindowLabel)}</div>` : ''}
          </div>
          <div class="card">
            <div class="card-title">Guest snapshot</div>
            <div class="muted">${entry.partySize} pax</div>
            <div class="muted">Phone: ${escapeHtml(entry.guestPhone)}</div>
            <div class="muted">Seating preference: ${escapeHtml(getQueueEntryPreferenceLabel(entry))}</div>
            ${getQueueEntryGuestNotes(entry) ? `<div class="muted">Notes: ${escapeHtml(getQueueEntryGuestNotes(entry))}</div>` : ''}
            <div class="muted">Venue: ${escapeHtml(venue.name)}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Table ready</div>
          <div class="card-sub">${entry.table?.label ? `Reserved: ${escapeHtml(entry.table.label)}` : 'A matching table was reserved for you.'}</div>
          <div class="alert alert-green"><div>Arrive within the venue window and show the OTP to staff to avoid reassignment.</div></div>
          ${entry.depositPaid > 0
            ? isPartyJoiner
              ? `<div class="alert alert-blue"><div>The host locked a pre-order before seating. You'll be able to add items once seated.</div></div>`
              : `<div class="muted">Deposit secured: ${formatMoney(entry.depositPaid)}</div>`
            : preOrderEnabled
              ? '<button class="btn btn-primary" id="preorder-cta">Add a pre-order before seating</button>'
              : '<div class="alert alert-blue"><div>Pre-order is disabled for this venue.</div></div>'
          }
        </div>
        <div class="card">
          <div class="card-title">Guest snapshot</div>
          <div class="muted">${entry.partySize} pax</div>
          <div class="muted">Phone: ${escapeHtml(entry.guestPhone)}</div>
          <div class="muted">Venue: ${escapeHtml(venue.name)}</div>
        </div>
      </div>
    `;
  }

  if (entry.status === 'SEATED' || entry.status === 'COMPLETED') {
    if (queueOnlyGuestExperience) {
      return `
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">${entry.status === 'COMPLETED' ? 'Visit complete' : 'Called in'}</div>
            <div class="card-sub">${entry.status === 'COMPLETED'
              ? 'This waitlist visit has been closed. Thanks for waiting with us.'
              : 'You have been called to the host desk. Show the OTP to complete verification.'}</div>
            <div class="alert alert-blue"><div>${entry.status === 'COMPLETED' ? 'No more actions are needed on this device.' : 'Keep this page handy in case the host desk needs to verify your session reference.'}</div></div>
            ${entry.status === 'COMPLETED' ? '<button class="btn btn-secondary btn-full" id="guest-done-cta" style="margin-top:16px;">Done</button>' : ''}
          </div>
          <div class="card">
            <div class="card-title">Visit summary</div>
            <div class="muted">${entry.partySize} pax</div>
            <div class="muted">Phone: ${escapeHtml(entry.guestPhone)}</div>
            <div class="muted">Seating preference: ${escapeHtml(getQueueEntryPreferenceLabel(entry))}</div>
            ${getQueueEntryGuestNotes(entry) ? `<div class="muted">Notes: ${escapeHtml(getQueueEntryGuestNotes(entry))}</div>` : ''}
            <div class="muted">Venue: ${escapeHtml(venue.name)}</div>
            ${entry.displayRef ? `<div class="muted">Reference: <span class="mono">${escapeHtml(entry.displayRef)}</span></div>` : ''}
          </div>
        </div>
      `;
    }

    const preOrders = entry.orders.filter((order) => order.type === 'PRE_ORDER');
    const tableOrders = entry.orders.filter((order) => order.type === 'TABLE_ORDER');
    const canPlaceTableOrders = entry.status === 'SEATED' && seatedOrderingEnabled && Boolean(guestSession?.guestToken);
    return `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">Table ${entry.table?.label ? escapeHtml(entry.table.label) : 'assigned'}</div>
          <div class="card-sub">${entry.status === 'COMPLETED' ? 'Service is complete. Ordering is closed and the table can turn over cleanly.' : 'Pre-orders stay locked. Add more items from your phone while seated and settle only the balance due.'}</div>
          ${entry.table?.section ? `<div class="muted" style="margin-bottom:14px;">Section: ${escapeHtml(entry.table.section)}</div>` : ''}
          ${preOrders.length ? `
            <div class="alert alert-blue" style="margin-bottom:14px;"><div>Locked pre-order</div></div>
            ${preOrders.map((order) => renderGuestOrderBlock(order, 'Pre-order', 'Locked')).join('')}
          ` : '<div class="empty-state">No pre-order items were locked before seating.</div>'}
          ${tableOrders.length ? tableOrders.map((order) => `
            ${renderGuestOrderBlock(order, 'Table order')}
          `).join('') : '<div class="empty-state" style="margin-top:14px;">No add-on table orders yet.</div>'}

          ${entry.status === 'SEATED' && seatedOrderingEnabled ? `
            <div class="section-head" style="margin-top:18px;">
              <div class="section-title">Order at table</div>
              <div class="section-sub">The menu stays visible while seated. Pre-order items are already locked, any new rounds add to the live bill, and only the remaining balance is paid later.</div>
            </div>
            <div class="${canPlaceTableOrders ? '' : 'menu-locked'}">
              ${renderTableMenuSections(venue.menuCategories || [], getTableCart(entry.id), !canPlaceTableOrders)}
            </div>
            <div class="card" style="margin-top:16px; background:rgba(255,255,255,0.02);">
              <div class="card-title">${canPlaceTableOrders ? 'Current table-order cart' : 'Unlock ordering on this device'}</div>
              <div class="card-sub">${canPlaceTableOrders ? 'This cart is separate from the locked pre-order. Submit as many rounds as needed while seated.' : 'The menu remains visible, but this browser does not have the active guest session token. Enter the seating OTP once to unlock ordering in place.'}</div>
              ${canPlaceTableOrders ? `
                ${tableCartSummary.lines.length ? tableCartSummary.lines.map((line) => `
                  <div class="order-line">
                    <div>
                      <div class="order-line-name">${escapeHtml(line.name)}</div>
                      <div class="order-line-qty">${line.quantity} x ${formatMoney(line.unitTotal)}</div>
                    </div>
                    <div class="order-line-price">${formatMoney(line.total)}</div>
                  </div>
                `).join('') : '<div class="empty-state">Add items to build a table order.</div>'}
                <div class="order-total">
                  <div class="order-total-label">Round total</div>
                  <div class="order-total-val">${formatMoney(tableCartSummary.total)}</div>
                </div>
                <button class="btn btn-primary btn-full" id="submit-table-order" style="margin-top:16px;" ${tableCartSummary.lines.length ? '' : 'disabled'}>Submit order to table</button>
              ` : `
                <form id="recover-guest-session-form">
                  <div class="form-group">
                    <label class="form-label" for="guest-session-otp">Seating OTP</label>
                    <input class="form-input" id="guest-session-otp" required maxlength="6" placeholder="123456">
                  </div>
                  <button class="btn btn-secondary btn-full" type="submit">Restore ordering</button>
                </form>
              `}
            </div>
          ` : entry.status === 'SEATED' ? `
            <div class="alert alert-blue" style="margin-top:18px;"><div>At-table ordering is disabled for this venue. Review the live bill on the right and settle with the venue team when ready.</div></div>
          ` : ''}
        </div>
        <div class="card">
          <div class="card-title">Bill</div>
          <div class="card-sub">Powered by <span class="mono">GET /orders/bill/:queueEntryId</span>.</div>
          ${bill ? `
            <div class="order-line"><div class="order-line-name">Subtotal</div><div class="order-line-price">${formatMoney(bill.summary.subtotalExGst)}</div></div>
            <div class="order-line"><div class="order-line-name">CGST</div><div class="order-line-price">${formatMoney(bill.summary.cgst)}</div></div>
            <div class="order-line"><div class="order-line-name">SGST</div><div class="order-line-price">${formatMoney(bill.summary.sgst)}</div></div>
            <div class="order-line"><div class="order-line-name">Deposit paid</div><div class="order-line-price">${formatMoney(bill.summary.depositPaid)}</div></div>
            <div class="order-total">
              <div class="order-total-label">Balance due</div>
              <div class="order-total-val">${formatMoney(bill.summary.balanceDue)}</div>
            </div>
            ${(entry.status === 'SEATED' && bill.summary.balanceDue > 0 && finalPaymentEnabled) ? `
              <button class="btn btn-primary btn-full" id="final-pay-cta" style="margin-top:16px;">Pay balance</button>
            ` : (entry.status === 'SEATED' && bill.summary.balanceDue > 0) ? `
              <div class="alert alert-blue" style="margin-top:16px;"><div>Online balance payment is disabled for this venue. Please settle directly with the venue team.</div></div>
            ` : ''}
            ${(entry.status === 'COMPLETED') ? `
              <div class="alert alert-green" style="margin-top:16px;"><div>Final payment completed. The invoice generation path has already been triggered.</div></div>
              <div class="order-line" style="margin-top:10px;"><div class="order-line-name">Final amount settled</div><div class="order-line-price">${formatMoney(Math.max(0, ((bill.summary.totalIncGst || (bill.summary.subtotalExGst + bill.summary.cgst + bill.summary.sgst) || 0)) - (bill.summary.depositPaid || 0)))}</div></div>
              <button class="btn btn-secondary btn-full" id="guest-done-cta" style="margin-top:16px;">Done</button>
            ` : ''}
          ` : '<div class="empty-state">Bill data unavailable.</div>'}
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="card-title">Queue entry closed</div>
      <div class="card-sub">${entry.status === 'NO_SHOW' ? 'The reserved table timed out and the queue moved on.' : 'This guest entry is no longer available for actions.'}</div>
      <a class="btn btn-primary" data-nav href="/v/${slug}">Start a new queue entry</a>
    </div>
  `;
}

function renderGuestOrderBlock(order, label, tagLabel = '') {
  return `
    <div class="order-line" style="display:block; padding:14px 0;">
      <div style="display:flex; justify-content:space-between; gap:16px;">
        <div>
          <div class="order-line-name">${escapeHtml(label)}${tagLabel ? ` <span class="pre-tag">${escapeHtml(tagLabel)}</span>` : ''}</div>
          <div class="order-line-qty">${order.items.length} items · ${escapeHtml(order.status)}</div>
        </div>
        <div class="order-line-price">${formatMoney(order.totalIncGst || order.total || 0)}</div>
      </div>
      <div class="card-sub" style="margin-top:10px;">${renderGuestOrderItems(order.items)}</div>
    </div>
  `;
}

function renderGuestOrderItems(items) {
  return items.map((item) => `${escapeHtml(item.name)} x${item.quantity}`).join(' · ');
}

function renderTableMenuSections(categories, cart, isLocked = false) {
  return categories.map((category) => `
    <section>
      <div class="cat-header">
        <div class="cat-header-name">${escapeHtml(category.name)}</div>
        <div class="cat-header-line"></div>
      </div>
      <div class="menu-grid">
        ${category.items.map((item) => {
          const qty = cart[item.id] || 0;
          const selected = qty > 0 ? 'selected' : '';
          return `
            <div class="menu-item ${selected} ${isLocked ? 'locked' : ''}">
              <div class="menu-item-body">
                <div class="menu-item-name">${escapeHtml(item.name)}</div>
                <div class="menu-item-desc">${escapeHtml(item.description || 'No description')}</div>
                <div class="menu-item-price">${formatMoney(menuItemTotal(item))}</div>
              </div>
              <div class="menu-item-foot">
                <div class="qty-ctrl">
                  <button class="qty-btn" type="button" data-table-cart-item data-item-id="${item.id}" data-delta="-1" ${isLocked ? 'disabled' : ''}>−</button>
                  <span class="qty-num ${qty > 0 ? 'active' : ''}">${qty}</span>
                  <button class="qty-btn" type="button" data-table-cart-item data-item-id="${item.id}" data-delta="1" ${isLocked ? 'disabled' : ''}>+</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function renderMenuSections(categories, cart) {
  return categories.map((category) => `
    <section id="guest-category-${category.id}" data-guest-category-section="${category.id}">
      <div class="cat-header">
        <div class="cat-header-name">${escapeHtml(category.name)}</div>
        <div class="cat-header-line"></div>
      </div>
      <div class="menu-grid">
        ${category.items.map((item) => {
          const qty = cart[item.id] || 0;
          const selected = qty > 0 ? 'selected' : '';
          return `
            <div class="menu-item ${selected}">
              <div class="menu-item-body">
                <div class="menu-item-name">${escapeHtml(item.name)}</div>
                <div class="menu-item-desc">${escapeHtml(item.description || 'No description')}</div>
                <div class="menu-item-price">${formatMoney(menuItemTotal(item))}</div>
              </div>
              <div class="menu-item-foot">
                <div class="qty-ctrl">
                  <button class="qty-btn" type="button" data-cart-item data-item-id="${item.id}" data-delta="-1">−</button>
                  <span class="qty-num ${qty > 0 ? 'active' : ''}">${qty}</span>
                  <button class="qty-btn" type="button" data-cart-item data-item-id="${item.id}" data-delta="1">+</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `).join('');
}

function renderTabButton(key, label, currentTab) {
  return `<button class="tab ${currentTab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`;
}

function scrollActiveTabIntoView() {
  const activeTab = document.querySelector('.tabs .tab.active');
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
  }
}

function renderTableActions(table) {
  if (table.status === 'FREE') {
    return `
      <button class="btn btn-secondary btn-sm" data-table-id="${table.id}" data-table-status="OCCUPIED">Mark occupied</button>
      <button class="btn btn-secondary btn-sm" data-table-id="${table.id}" data-table-status="RESERVED">Reserve</button>
    `;
  }

  if (table.status === 'OCCUPIED') {
    return `<button class="btn btn-secondary btn-sm" data-table-id="${table.id}" data-table-status="CLEARING">Mark clearing</button>`;
  }

  if (table.status === 'CLEARING' || table.status === 'RESERVED') {
    return `<button class="btn btn-success btn-sm" data-table-id="${table.id}" data-table-status="FREE">Mark free</button>`;
  }

  return `<button class="btn btn-secondary btn-sm" data-table-id="${table.id}" data-table-status="FREE">Reset</button>`;
}

function renderInlineFlash(flash) {
  const className = flash.kind === 'green'
    ? 'alert-green'
    : flash.kind === 'red'
      ? 'alert-red'
      : flash.kind === 'blue'
        ? 'alert-blue'
        : 'alert-amber';

  return `<div class="alert ${className}"><div>${escapeHtml(flash.message)}</div></div>`;
}

async function apiRequest(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    headers: {},
  };

  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  if (options.auth === 'guest') {
    if (!options.guestToken) {
      throw new Error('Guest session missing');
    }
    config.headers.Authorization = `Bearer ${options.guestToken}`;
  } else if (options.auth) {
    const auth = getStaffAuth();
    if (!auth?.token) {
      throw new Error('Unauthorized');
    }
    config.headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = { success: false, error: normaliseApiError(text, response.status) };
    }
  }

  if (!response.ok || payload.success === false) {
    throw new Error(normaliseApiError(payload.error, response.status));
  }

  return payload.data;
}

const BucketStore = {
  getDraftCart() {
    if (uiState.activePartySessionId) {
      return { ...uiState.partyBucket.cart };
    }
    const fallbackEntryId = uiState.activeGuestView?.entryId;
    return fallbackEntryId ? getTableCart(fallbackEntryId) : {};
  },
  setDraftCart(cart) {
    const nextCart = normaliseDraftCart(cart);
    if (uiState.activePartySessionId) {
      uiState.partyBucket.cart = nextCart;
      uiState.partyBucket.dirty = true;
      return;
    }
    const fallbackEntryId = uiState.activeGuestView?.entryId;
    if (fallbackEntryId) {
      setTableCart(fallbackEntryId, nextCart);
    }
  },
  applyDelta(menuItemId, delta) {
    const currentCart = BucketStore.getDraftCart();
    const current = currentCart[menuItemId] || 0;
    const next = Math.max(0, current + delta);
    if (next === 0) {
      delete currentCart[menuItemId];
    } else {
      currentCart[menuItemId] = next;
    }
    BucketStore.setDraftCart(currentCart);
  },
  replaceFromServer(bucketItems) {
    uiState.partyBucket.serverItems = bucketItems || [];
    uiState.partyBucket.cart = normaliseDraftCart(bucketItemsToCart(bucketItems));
    uiState.partyBucket.lastSyncedAt = Date.now();
    uiState.partyBucket.lastSyncError = '';
    uiState.partyBucket.dirty = false;
  },
  clearDraftCart() {
    BucketStore.setDraftCart({});
  },
  getDraft(queueEntryId) {
    if (uiState.activePartySessionId) {
      return BucketStore.getDraftCart();
    }
    return getTableCart(queueEntryId);
  },
  setDraft(queueEntryId, cart) {
    if (uiState.activePartySessionId) {
      BucketStore.setDraftCart(cart);
      return;
    }
    setTableCart(queueEntryId, cart);
  },
  updateItem(queueEntryId, menuItemId, delta) {
    if (uiState.activePartySessionId) {
      BucketStore.applyDelta(menuItemId, delta);
      return;
    }
    updateTableCart(queueEntryId, menuItemId, delta);
  },
  clearDraft(queueEntryId) {
    if (uiState.activePartySessionId) {
      BucketStore.clearDraftCart();
      return;
    }
    setTableCart(queueEntryId, {});
  },
};

function rerenderActiveGuestShell() {
  uiState.activeGuestView?.refreshSeatedShell?.();
}

async function loadPartySessionState(entry, guestSession) {
  if (!entry?.partySession?.id || !guestSession?.guestToken) {
    console.warn('Party session unavailable for seated guest shell. Falling back to local bucket.');
    uiState.activePartySessionId = null;
    uiState.partySessionMeta = null;
    uiState.partyParticipants = [];
    resetPartyBucketState();
    return false;
  }

  uiState.partyBucket.isLoading = true;

  try {
    const sessionId = entry.partySession.id;
    const realtime = await apiRequest(`/party-sessions/${sessionId}/realtime`, {
      auth: 'guest',
      guestToken: guestSession.guestToken,
    });

    uiState.activePartySessionId = sessionId;
    uiState.partySessionMeta = realtime.session;
    uiState.partyParticipants = realtime.participants || [];
    BucketStore.replaceFromServer(realtime.bucket || []);
    if (uiState.activeGuestView?.bill && realtime.billSummary) {
      uiState.activeGuestView.bill.summary = realtime.billSummary;
    }
    uiState.partyPoll.failureCount = 0;
    uiState.partyPoll.nextDelayMs = uiState.partyPoll.baseDelayMs;
    uiState.partyPoll.lastError = '';
    return true;
  } catch (error) {
    console.warn('Failed to load party session state:', error);
    uiState.activePartySessionId = null;
    uiState.partySessionMeta = null;
    uiState.partyParticipants = [];
    resetPartyBucketState();
    uiState.partyPoll.failureCount += 1;
    uiState.partyPoll.lastError = error.message || 'Party session load failed.';
    return false;
  } finally {
    uiState.partyBucket.isLoading = false;
  }
}

async function refreshPartySessionState({ includeSummary = false, rerender = true } = {}) {
  const sessionId = uiState.activePartySessionId;
  const guestToken = uiState.activeGuestView?.guestSession?.guestToken;

  if (!sessionId || !guestToken) {
    return false;
  }

  try {
    const realtime = await apiRequest(`/party-sessions/${sessionId}/realtime`, {
      auth: 'guest',
      guestToken,
    });

    if (realtime.session) {
      uiState.partySessionMeta = realtime.session;
      if (uiState.activeGuestView?.entry) {
        uiState.activeGuestView.entry.status = realtime.session.queueStatus || uiState.activeGuestView.entry.status;
      }
    }
    uiState.partyParticipants = realtime.participants || [];

    if (!uiState.partyBucket.dirty && !uiState.partyBucket.isSyncing) {
      BucketStore.replaceFromServer(realtime.bucket || []);
    } else {
      uiState.partyBucket.serverItems = realtime.bucket || [];
      uiState.partyBucket.lastSyncedAt = Date.now();
    }

    if (uiState.activeGuestView?.bill && realtime.billSummary) {
      uiState.activeGuestView.bill.summary = realtime.billSummary;
    }

    uiState.partyPoll.failureCount = 0;
    uiState.partyPoll.nextDelayMs = uiState.partyPoll.baseDelayMs;
    uiState.partyPoll.lastError = '';

    if (rerender) {
      rerenderActiveGuestShell();
    }
    return true;
  } catch (error) {
    uiState.partyBucket.lastSyncError = error.message || 'Shared bucket refresh failed.';
    uiState.partyPoll.failureCount += 1;
    uiState.partyPoll.lastError = uiState.partyBucket.lastSyncError;
    uiState.partyPoll.nextDelayMs = computePartyPollBackoff(
      uiState.partyPoll.baseDelayMs,
      uiState.partyPoll.maxDelayMs,
      uiState.partyPoll.failureCount,
    );
    if (rerender) {
      rerenderActiveGuestShell();
    }
    return false;
  }
}

async function flushPartyBucketToServer(options = {}) {
  const sessionId = uiState.activePartySessionId;
  const guestToken = uiState.activeGuestView?.guestSession?.guestToken;
  const force = options.force === true;

  if (!sessionId || !guestToken) {
    return null;
  }

  if (!uiState.partyBucket.dirty && !force) {
    return uiState.partyBucket.serverItems;
  }

  if (uiState.partyBucket.isSyncing) {
    uiState.partyBucket.dirty = true;
    return null;
  }

  const outboundCart = { ...uiState.partyBucket.cart };
  const outboundSignature = serialiseDraftCart(outboundCart);
  uiState.partyBucket.isSyncing = true;

  try {
    const bucketItems = await apiRequest(`/party-sessions/${sessionId}/bucket`, {
      method: 'PUT',
      auth: 'guest',
      guestToken,
      body: {
        items: cartToBucketItems(outboundCart),
      },
    });

    const currentSignature = serialiseDraftCart(uiState.partyBucket.cart);
    uiState.partyBucket.lastSyncError = '';
    uiState.partyBucket.lastSyncedAt = Date.now();

    if (currentSignature === outboundSignature) {
      BucketStore.replaceFromServer(bucketItems);
    } else {
      uiState.partyBucket.serverItems = bucketItems;
      uiState.partyBucket.dirty = true;
    }

    return bucketItems;
  } catch (error) {
    uiState.partyBucket.lastSyncError = error.message || 'Shared bucket sync failed.';
    uiState.partyBucket.dirty = true;
    throw error;
  } finally {
    uiState.partyBucket.isSyncing = false;
    if (uiState.partyBucket.dirty) {
      schedulePartyBucketSync(true);
    }
    rerenderActiveGuestShell();
  }
}

function schedulePartyBucketSync(immediate = false) {
  if (!uiState.activePartySessionId) {
    return;
  }

  clearPartyBucketSyncTimer();
  uiState.partyBucket.pendingSyncTimer = window.setTimeout(() => {
    uiState.partyBucket.pendingSyncTimer = null;
    flushPartyBucketToServer().catch(() => {});
  }, immediate ? 0 : 350);
}

function applyPartyBucketDelta(menuItemId, delta) {
  BucketStore.applyDelta(menuItemId, delta);
  if (uiState.activePartySessionId) {
    schedulePartyBucketSync();
  }
  rerenderActiveGuestShell();
}

function startPartySessionPolling() {
  clearPartySessionPolling();
  uiState.partyPoll.nextDelayMs = uiState.partyPoll.baseDelayMs;

  const runTick = async () => {
    const pollSucceeded = await refreshPartySessionState({ includeSummary: false, rerender: true });
    if (uiState.activePartySessionId && uiState.activeGuestView?.entry?.status === 'SEATED') {
      const jitter = Math.floor(Math.random() * 450);
      uiState.partyPollerId = window.setTimeout(() => {
        runTick().catch(() => {});
      }, computeScheduledPartyPollDelay(uiState.partyPoll.nextDelayMs, document.hidden, jitter));
    }
    if (pollSucceeded && !document.hidden) {
      uiState.partyPoll.nextDelayMs = uiState.partyPoll.baseDelayMs;
    }
  };

  uiState.partyPollerId = window.setTimeout(() => {
    runTick().catch(() => {});
  }, uiState.partyPoll.baseDelayMs);
}

// Debug helper removed for production safety (was window.__flockJoinPartySession)

function isManagerRole(role) {
  return role === 'OWNER' || role === 'MANAGER';
}

function getSeatOtp() {
  return uiState.staffSeat.otpDigits.join('');
}

function setSeatOtpFromString(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6).split('');
  uiState.staffSeat.otpDigits = [0, 1, 2, 3, 4, 5].map((index) => digits[index] || '');
}

async function loadSeatedBills(seatedEntries) {
  const bills = await Promise.all(seatedEntries.map(async (entry) => {
    try {
      const bill = await apiRequest(`/orders/bill/${entry.id}`, { auth: true });
      return [entry.id, bill];
    } catch (_error) {
      return [entry.id, null];
    }
  }));
  return Object.fromEntries(bills);
}

function getSuggestedTableId(entry, tables) {
  const candidates = tables.filter((table) => (table.status === 'FREE' || table.status === 'RESERVED') && table.capacity >= entry.partySize);
  if (entry.table?.id && candidates.some((table) => table.id === entry.table.id)) {
    return entry.table.id;
  }
  return candidates.sort((a, b) => a.capacity - b.capacity)[0]?.id || '';
}

function formatSeatTableOption(table) {
  return [
    table.label,
    `${table.capacity} seats`,
    table.section || null,
    table.status,
  ].filter(Boolean).join(' · ');
}

function formatQueueEntryStateForStaff(entry) {
  return entry.status === 'NOTIFIED' ? 'Called' : 'Waiting';
}

function resetStaffSeatState() {
  uiState.staffSeat = {
    otpDigits: ['', '', '', '', '', ''],
    tableId: '',
    prefilledFromQueueId: null,
    suggestedTableId: null,
    entrySummary: null,
    error: '',
    success: '',
    isSubmitting: false,
  };
}
