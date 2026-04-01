import { test, expect, Page } from '@playwright/test';

const VENUE_SLUG = 'the-barrel-room-koramangala';
const CRAFTERY_VENUE_SLUG = 'the-craftery-koramangala';

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflow, 'Page should not have horizontal overflow').toBe(false);
}

function uniquePhoneNumber() {
  return `9${Date.now().toString().slice(-9)}`;
}

// ─── Landing Page ─────────────────────────────────────────────────

test.describe('Landing page', () => {
  test('renders without overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.brand-name');
    await noHorizontalOverflow(page);
    await expect(page).toHaveScreenshot('landing.png', { fullPage: true });
  });
});

// ─── Venue / Guest Queue Join ─────────────────────────────────────

test.describe('Guest venue landing', () => {
  test('join form fits viewport', async ({ page }) => {
    await page.goto(`/v/${VENUE_SLUG}`);
    await page.waitForSelector('#join-form');
    await noHorizontalOverflow(page);
    await expect(page).toHaveScreenshot('venue-landing.png', { fullPage: true });
  });

  test('Craftery keeps its dedicated theme preset', async ({ page }) => {
    await page.goto(`/v/${CRAFTERY_VENUE_SLUG}`);
    await page.waitForSelector('#join-form');
    await noHorizontalOverflow(page);

    const themeSheetHref = await page.locator('#flock-theme-stylesheet').getAttribute('href');
    expect(themeSheetHref).toBe('/craftery-styles.css');

    const fontHref = await page.locator('#flock-theme-fonts').getAttribute('href');
    expect(fontHref).toContain('Playfair+Display');

    const seatingPreference = page.locator('#guest-seating-preference');
    if (await seatingPreference.count()) {
      await expect(seatingPreference).toBeVisible();
    }

    const guestNotes = page.locator('#guest-notes');
    if (await guestNotes.count()) {
      await expect(guestNotes).toBeVisible();
    }

    await expect(page.locator('#preorder-cta')).toHaveCount(0);
    await expect(page.locator('#final-pay-cta')).toHaveCount(0);
  });

  test('Craftery wait page shows the Subko content block', async ({ page }) => {
    await page.goto(`/v/${CRAFTERY_VENUE_SLUG}`);
    await page.waitForSelector('#join-form');

    await page.fill('#guest-name', 'Subko Wait Smoke');
    await page.fill('#guest-phone', uniquePhoneNumber());
    const seatingPreference = page.locator('#guest-seating-preference');
    if (await seatingPreference.count()) {
      await seatingPreference.selectOption('FIRST_AVAILABLE');
    }

    const guestNotes = page.locator('#guest-notes');
    if (await guestNotes.count()) {
      await guestNotes.fill('Testing the wait-content block.');
    }

    await page.click('#join-form button[type="submit"]');

    await page.waitForURL(/\/v\/the-craftery-koramangala\/e\//);
    await page.waitForSelector('[data-wait-content="subko"]');
    await noHorizontalOverflow(page);

    await expect(page.locator('.steps .step-label')).toHaveText(['Join', 'Wait', 'Called']);
    await expect(page.getByRole('button', { name: 'Leave waitlist' })).toBeVisible();
    await expect(page.locator('.queue-pos-label')).toContainText('Estimated wait');
    await expect(page.locator('text=Waitlist position')).toHaveCount(0);

    const waitContent = page.locator('[data-wait-content="subko"]');
    await expect(waitContent).toBeVisible();
    await expect(waitContent.locator('.wait-content-card')).toHaveCount(2);
    await expect(waitContent).toContainText('Menu');
    await expect(waitContent).toContainText('Merchandise');
    await expect(waitContent).not.toContainText('Stories');
    await expect(waitContent).not.toContainText('Events');
  });

  test('Craftery manual-dispatch queue rows expose reorder controls', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flock_staff_auth', JSON.stringify({
        token: 'mock_staff_token',
        venueSlug: 'the-craftery-koramangala',
        venueId: 'venue_craftery',
        role: 'MANAGER',
        staff: {
          id: 'staff_craftery',
          name: 'Craftery Manager',
          role: 'MANAGER',
        },
      }));
      sessionStorage.setItem('flock_active_venue', 'the-craftery-koramangala');
    });

    await page.route('**/api/v1/venues/the-craftery-koramangala', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'venue_craftery',
            slug: CRAFTERY_VENUE_SLUG,
            name: 'The Craftery by Subko',
            address: 'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
            city: 'Bengaluru',
            tableReadyWindowMin: 15,
            isQueueOpen: true,
            depositPercent: 30,
            brandConfig: {
              displayName: 'The Craftery by Subko',
              shortName: 'Craftery',
              tagline: 'Waitlist · live updates · host desk',
              themeKey: 'craftery',
            },
            featureConfig: {
              guestQueue: true,
              staffConsole: true,
              adminConsole: true,
              historyTab: true,
            },
            opsConfig: {
              queueDispatchMode: 'MANUAL_NOTIFY',
              tableSourceMode: 'MANUAL',
              joinConfirmationMode: 'WEB_ONLY',
              readyNotificationChannels: ['WHATSAPP'],
            },
            config: {
              brandConfig: {
                displayName: 'The Craftery by Subko',
                shortName: 'Craftery',
                tagline: 'Waitlist · live updates · host desk',
                themeKey: 'craftery',
              },
              featureConfig: {
                guestQueue: true,
                staffConsole: true,
                adminConsole: true,
                historyTab: true,
              },
              opsConfig: {
                queueDispatchMode: 'MANUAL_NOTIFY',
                tableSourceMode: 'MANUAL',
                joinConfirmationMode: 'WEB_ONLY',
                readyNotificationChannels: ['WHATSAPP'],
              },
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/queue/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'queue_0',
              position: 1,
              guestName: 'Ahead Guest',
              guestPhone: uniquePhoneNumber(),
              partySize: 2,
              otp: '654321',
              status: 'WAITING',
              seatingPreference: 'FIRST_AVAILABLE',
              estimatedWaitMin: 8,
            },
            {
              id: 'queue_1',
              position: 2,
              guestName: 'Priority Smoke',
              guestPhone: uniquePhoneNumber(),
              partySize: 3,
              otp: '123456',
              status: 'WAITING',
              seatingPreference: 'FIRST_AVAILABLE',
              guestNotes: 'Checking host prioritization control.',
              estimatedWaitMin: 12,
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/venues/stats/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            today: {
              totalQueueJoins: 1,
              avgWaitMin: 12,
              totalRevenuePaise: 0,
            },
          },
        }),
      });
    });

    await page.goto(`/v/${CRAFTERY_VENUE_SLUG}/staff/dashboard`);
    await page.waitForSelector('[data-reorder-entry]');
    const moveUpButton = page.locator('[data-reorder-entry][data-reorder-direction="UP"]').first();
    await expect(moveUpButton).toBeVisible();
    await expect(moveUpButton).toContainText('Move up');
    await noHorizontalOverflow(page);
  });
});

// ─── Staff Login ──────────────────────────────────────────────────

test.describe('Staff login', () => {
  test('OTP form renders cleanly', async ({ page }) => {
    await page.goto(`/v/${VENUE_SLUG}/staff/login`);
    await page.waitForSelector('#staff-send-form');
    await noHorizontalOverflow(page);
    await expect(page).toHaveScreenshot('staff-login.png', { fullPage: true });
  });

  test('mockOtp auto-fills after send', async ({ page }) => {
    await page.goto(`/v/${VENUE_SLUG}/staff/login`);
    await page.fill('#staff-phone', '9000000002');
    await page.click('#staff-send-form button[type="submit"]');
    await page.waitForTimeout(2000);
    const codeValue = await page.inputValue('#staff-code');
    expect(codeValue.length, 'OTP should be auto-filled (6 digits)').toBe(6);
    await expect(page).toHaveScreenshot('staff-otp-filled.png', { fullPage: true });
  });
});

// ─── Staff Dashboard Tabs ─────────────────────────────────────────

test.describe('Staff dashboard', () => {
  async function loginStaff(page: Page) {
    await page.goto(`/v/${VENUE_SLUG}/staff/login`);
    await page.fill('#staff-phone', '9000000002');
    await page.click('#staff-send-form button[type="submit"]');
    await page.waitForTimeout(2000);
    const code = await page.inputValue('#staff-code');
    if (code.length === 6) {
      await page.click('#staff-verify-form button[type="submit"]');
      await page.waitForTimeout(3000);
    }
  }

  test('queue tab preserves staff scroll position during polling', async ({ page }) => {
    test.skip(
      !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(process.env.FLOCK_TEST_URL || ''),
      'This regression must run against the local frontend bundle, not the live deployed app.js.',
    );

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('flock_staff_auth', JSON.stringify({
        token: 'mock_staff_token',
        venueSlug: 'the-craftery-koramangala',
        venueId: 'venue_craftery',
        role: 'MANAGER',
        staff: {
          id: 'staff_craftery',
          name: 'Craftery Manager',
          role: 'MANAGER',
        },
      }));
      sessionStorage.setItem('flock_active_venue', 'the-craftery-koramangala');
    });

    const queueRows = Array.from({ length: 24 }, (_, index) => ({
      id: `queue_${index + 1}`,
      position: index + 1,
      guestName: `Scroll Guest ${index + 1}`,
      guestPhone: `9${String(800000000 + index).padStart(9, '0')}`,
      partySize: (index % 4) + 1,
      otp: String(100000 + index),
      status: 'WAITING',
      seatingPreference: index % 2 === 0 ? 'INDOOR' : 'FIRST_AVAILABLE',
      estimatedWaitMin: Math.min(30, 8 + (index * 3)),
      displayRef: `FLK-SCROLL-${index + 1}`,
      guestNotes: index === 10 ? 'Keep this row stable during polling.' : '',
    }));

    await page.route('**/api/v1/venues/the-craftery-koramangala', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'venue_craftery',
            slug: CRAFTERY_VENUE_SLUG,
            name: 'The Craftery by Subko',
            address: 'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
            city: 'Bengaluru',
            tableReadyWindowMin: 15,
            isQueueOpen: true,
            depositPercent: 30,
            brandConfig: {
              displayName: 'The Craftery by Subko',
              shortName: 'Craftery',
              tagline: 'Waitlist · live updates · host desk',
              themeKey: 'craftery',
            },
            featureConfig: {
              guestQueue: true,
              staffConsole: true,
              adminConsole: true,
              historyTab: true,
              preOrder: false,
              finalPayment: false,
            },
            uiConfig: {
              landingMode: 'venue',
              showContinueEntry: true,
              showQueuePosition: false,
              supportCopy: 'Join the waitlist, keep your phone nearby, and head back to the host desk once your table is ready.',
            },
            opsConfig: {
              queueDispatchMode: 'MANUAL_NOTIFY',
              tableSourceMode: 'MANUAL',
              joinConfirmationMode: 'WEB_ONLY',
              readyNotificationChannels: ['WHATSAPP'],
            },
            config: {
              brandConfig: {
                displayName: 'The Craftery by Subko',
                shortName: 'Craftery',
                tagline: 'Waitlist · live updates · host desk',
                themeKey: 'craftery',
              },
              featureConfig: {
                guestQueue: true,
                staffConsole: true,
                adminConsole: true,
                historyTab: true,
                preOrder: false,
                finalPayment: false,
              },
              uiConfig: {
                landingMode: 'venue',
                showContinueEntry: true,
                showQueuePosition: false,
                supportCopy: 'Join the waitlist, keep your phone nearby, and head back to the host desk once your table is ready.',
              },
              opsConfig: {
                queueDispatchMode: 'MANUAL_NOTIFY',
                tableSourceMode: 'MANUAL',
                joinConfirmationMode: 'WEB_ONLY',
                readyNotificationChannels: ['WHATSAPP'],
              },
            },
          },
        }),
      });
    });

    await page.route('**/api/v1/queue/live', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: queueRows,
        }),
      });
    });

    await page.route('**/api/v1/venues/stats/today', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            today: {
              totalQueueJoins: queueRows.length,
              avgWaitMin: 18,
              totalRevenuePaise: 0,
            },
          },
        }),
      });
    });

    await page.goto(`/v/${CRAFTERY_VENUE_SLUG}/staff/dashboard`);
    await page.waitForSelector('.q-row');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.65));
    const beforeAnchor = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('#staff-live-panel [data-staff-live-anchor]'));
      const anchor = anchors.find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      }) || anchors.find((node) => node.getBoundingClientRect().top >= 0);
      return anchor
        ? {
            id: anchor.getAttribute('data-staff-live-anchor'),
            top: anchor.getBoundingClientRect().top,
          }
        : null;
    });
    expect(beforeAnchor?.id, 'A visible queue row should be available before polling').toBeTruthy();
    await page.waitForTimeout(3500);
    const afterTop = await page.evaluate((anchorId) => {
      const anchor = Array.from(document.querySelectorAll('#staff-live-panel [data-staff-live-anchor]'))
        .find((node) => node.getAttribute('data-staff-live-anchor') === anchorId);
      return anchor ? anchor.getBoundingClientRect().top : null;
    }, beforeAnchor?.id || '');

    expect(afterTop, 'The same visible queue row should still exist after polling').not.toBeNull();
    expect(Math.abs((afterTop || 0) - (beforeAnchor?.top || 0)), 'Visible queue rows should remain stable across live polling').toBeLessThan(20);
  });

  test('queue tab renders without overflow', async ({ page }) => {
    await loginStaff(page);
    await noHorizontalOverflow(page);
    await expect(page.getByText('Use the queue row to notify the next party')).toBeVisible();
    const notifyButtons = page.locator('[data-open-notify-sheet]');
    if (await notifyButtons.count() > 0) {
      await expect(notifyButtons.first()).toBeVisible();
    }
    await expect(page).toHaveScreenshot('staff-queue-tab.png', { fullPage: true });
  });

  test('tabs scroll to active on re-render', async ({ page }) => {
    await loginStaff(page);
    const seatTab = page.locator('[data-tab="seat"]');
    if (await seatTab.isVisible()) {
      await seatTab.click();
      await page.waitForTimeout(1500);

      const isInView = await seatTab.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth;
      });
      expect(isInView, 'Seat OTP tab should be visible after click').toBe(true);
      await noHorizontalOverflow(page);
      await expect(page).toHaveScreenshot('staff-seat-tab.png', { fullPage: true });
    }
  });

  test('manager tab form is not wiped by polling', async ({ page }) => {
    await loginStaff(page);
    const managerTab = page.locator('[data-tab="manager"]');
    if (await managerTab.isVisible()) {
      await managerTab.click();
      await page.waitForTimeout(1500);

      const depositInput = page.locator('#manager-deposit');
      if (await depositInput.isVisible()) {
        await depositInput.fill('50');
        await page.waitForTimeout(5000);
        const val = await depositInput.inputValue();
        expect(val, 'Manager form value should survive 5s without polling wipe').toBe('50');
      }
      await expect(page).toHaveScreenshot('staff-manager-tab.png', { fullPage: true });
    }
  });
});

// ─── Admin Login + Dashboard ──────────────────────────────────────

test.describe('Admin login', () => {
  test('renders cleanly', async ({ page }) => {
    await page.goto(`/v/${VENUE_SLUG}/admin/login`);
    await page.waitForSelector('#admin-send-form');
    await noHorizontalOverflow(page);
    await expect(page).toHaveScreenshot('admin-login.png', { fullPage: true });
  });

  test('Craftery admin fallback remains reachable', async ({ page }) => {
    await page.goto(`/v/${CRAFTERY_VENUE_SLUG}/admin/login`);
    await page.waitForSelector('#admin-send-form');
    await noHorizontalOverflow(page);
    await expect(page.locator('.brand-tag')).toContainText('Waitlist');
  });
});

// ─── Menu Item Cards (Overflow Test) ──────────────────────────────

test.describe('Menu item cards', () => {
  async function navigateToPreorder(page: Page) {
    await page.goto(`/v/${VENUE_SLUG}`);
    await page.waitForSelector('#join-form');
    await page.fill('#guest-name', 'Test');
    await page.fill('#guest-phone', '9876543210');
    await page.click('#join-form button[type="submit"]');
    await page.waitForTimeout(3000);
    const preorderCta = page.locator('#preorder-cta');
    if (await preorderCta.isVisible()) {
      await preorderCta.click();
      await page.waitForTimeout(2000);
    }
  }

  test('menu grid does not overflow on narrow phones', async ({ page }) => {
    await navigateToPreorder(page);
    await noHorizontalOverflow(page);

    const menuItems = page.locator('.menu-item');
    if (await menuItems.count() > 0) {
      const overflows = await page.evaluate(() => {
        const items = document.querySelectorAll('.menu-item');
        const viewportWidth = window.innerWidth;
        return Array.from(items).some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right > viewportWidth + 2;
        });
      });
      expect(overflows, 'No menu item card should overflow the viewport').toBe(false);

      const qtyBtns = page.locator('.qty-btn');
      if (await qtyBtns.count() > 0) {
        const btnSize = await qtyBtns.first().evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        expect(btnSize.width, 'Qty button should be at least 36px wide').toBeGreaterThanOrEqual(35);
        expect(btnSize.height, 'Qty button should be at least 36px tall').toBeGreaterThanOrEqual(35);
      }

      await expect(page).toHaveScreenshot('menu-grid.png', { fullPage: true });
    }
  });
});

// ─── Global Checks (run on every page) ────────────────────────────

test.describe('Global defensive checks', () => {
  const pages = [
    { name: 'landing', path: '/' },
    { name: 'venue', path: `/v/${VENUE_SLUG}` },
    { name: 'staff-login', path: `/v/${VENUE_SLUG}/staff/login` },
    { name: 'admin-login', path: `/v/${VENUE_SLUG}/admin/login` },
  ];

  for (const pg of pages) {
    test(`${pg.name}: no horizontal scroll`, async ({ page }) => {
      await page.goto(pg.path);
      await page.waitForTimeout(2000);
      await noHorizontalOverflow(page);
    });

    test(`${pg.name}: text does not overflow containers`, async ({ page }) => {
      await page.goto(pg.path);
      await page.waitForTimeout(2000);

      const overflowingElements = await page.evaluate(() => {
        const results: string[] = [];
        const textSelectors = ['.card-title', '.card-sub', '.section-title', '.section-sub'];
        for (const sel of textSelectors) {
          document.querySelectorAll(sel).forEach((el) => {
            if (el.scrollWidth > el.clientWidth + 2) {
              results.push(`${sel}: "${el.textContent?.slice(0, 40)}..."`);
            }
          });
        }
        return results;
      });
      expect(overflowingElements, 'No text element should overflow its container').toEqual([]);
    });
  }
});
