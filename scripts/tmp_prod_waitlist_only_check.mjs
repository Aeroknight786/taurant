import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const base = 'https://taurant.onrender.com';
const slug = 'the-craftery-koramangala';
const managerPhone = '9900000002';
const adminPhone = '9900000001';
const stamp = String(Date.now()).slice(-9);
const guestPhone = `9${stamp}`;
const guestName = `[QA ${stamp}] Subko Guest`;
const guestNotes = 'Window seat if available';

function attachMonitor(page) {
  const consoleErrors = [];
  const apiFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/v1/')) return;
    const status = response.status();
    if (status >= 400) apiFailures.push({ url, status });
  });
  return { consoleErrors, apiFailures };
}

async function waitForOtpAutofill(page, selector) {
  await page.waitForFunction((inputSelector) => {
    const input = document.querySelector(inputSelector);
    return Boolean(input && /^\d{6}$/.test(input.value || ''));
  }, selector, { timeout: 30000 });
}

async function login(page, options) {
  await page.goto(`${base}${options.path}`, { waitUntil: 'domcontentloaded' });
  await page.locator(options.phoneSelector).fill(options.phone);
  await page.locator(`${options.sendFormSelector} button[type="submit"]`).click();
  await waitForOtpAutofill(page, options.codeSelector);
  await page.locator(`${options.verifyFormSelector} button[type="submit"]`).click();
}

async function getLocalStorageEntry(page, predicateSource) {
  return page.evaluate((predicate) => {
    const fn = new Function('key', 'value', `return (${predicate})(key, value);`);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      const raw = localStorage.getItem(key);
      try {
        const value = JSON.parse(raw);
        if (fn(key, value)) return value;
      } catch (_error) {}
    }
    return null;
  }, predicateSource);
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let body = null;
  try { body = await response.json(); } catch (_error) {}
  return { status: response.status, body };
}

async function cleanupGuest(session, staffToken) {
  if (session?.guestToken && session.entryId) {
    await fetch(`${base}/api/v1/queue/${session.entryId}/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.guestToken}` },
    }).catch(() => {});
  } else if (staffToken && session?.entryId) {
    await fetch(`${base}/api/v1/queue/${session.entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    }).catch(() => {});
  }
}

let browser;
let guestSession = null;
let staffToken = '';

try {
  browser = await chromium.launch({ headless: true });

  const guestContext = await browser.newContext({ ...devices['iPhone 14'] });
  const guestPage = await guestContext.newPage();
  const guestMonitor = attachMonitor(guestPage);

  await guestPage.goto(`${base}/v/${slug}`, { waitUntil: 'domcontentloaded' });
  await guestPage.locator('#guest-name').fill(guestName);
  await guestPage.locator('#guest-phone').fill(guestPhone);
  await guestPage.locator('#party-size').fill('2');
  await guestPage.locator('#guest-seating-preference').selectOption('INDOOR');
  await guestPage.locator('#guest-notes').fill(guestNotes);
  assert.equal(await guestPage.getByText('While you wait').count(), 0);
  assert.equal(await guestPage.getByText('Waitlist position').count(), 0);
  await guestPage.locator('#join-form button[type="submit"]').click();
  await guestPage.waitForURL(new RegExp(`/v/${slug}/e/[^/?#]+$`), { timeout: 30000 });
  const entryId = guestPage.url().match(/\/e\/([^/?#]+)/)?.[1];
  assert(entryId);
  guestSession = await getLocalStorageEntry(guestPage, `(key, value) => key.includes('guest_session') && value?.entryId === '${entryId}' && value?.otp`);
  assert(guestSession?.otp);
  await guestPage.getByText('Waiting list status').waitFor({ timeout: 30000 });

  const staffContext = await browser.newContext({ ...devices['iPhone 14'] });
  const staffPage = await staffContext.newPage();
  const staffMonitor = attachMonitor(staffPage);
  await login(staffPage, {
    path: `/v/${slug}/staff/login`,
    phoneSelector: '#staff-phone',
    sendFormSelector: '#staff-send-form',
    codeSelector: '#staff-code',
    verifyFormSelector: '#staff-verify-form',
    phone: managerPhone,
  });
  await staffPage.waitForURL(new RegExp(`/v/${slug}/staff/dashboard$`), { timeout: 30000 });
  await staffPage.locator('[data-tab="queue"]').waitFor({ timeout: 30000 });
  assert.equal(await staffPage.locator('[data-tab="tables"]').count(), 0);
  assert.equal(await staffPage.locator('[data-tab="seated"]').count(), 0);
  assert.equal(await staffPage.locator('[data-tab="seat"]').count(), 0);
  const staffAuth = await getLocalStorageEntry(staffPage, `(key, value) => key === 'flock_staff_auth' && Boolean(value?.token)`);
  assert(staffAuth?.token);
  staffToken = staffAuth.token;

  const row = staffPage.locator('.q-row', { hasText: guestPhone }).first();
  await row.waitFor({ timeout: 30000 });
  await row.locator('[data-open-notify-sheet]').click();
  await staffPage.locator('#notify-sheet-backdrop').waitFor({ timeout: 10000 });
  await staffPage.getByRole('button', { name: '5 min' }).click();
  await staffPage.locator('#notify-sheet-form button[type="submit"]').click();
  await staffPage.waitForFunction((phone) => {
    const rowNode = [...document.querySelectorAll('.q-row')].find((node) => node.textContent.includes(phone));
    return rowNode && rowNode.textContent.includes('Mark arrived');
  }, guestPhone, { timeout: 30000 });
  await row.locator('[data-mark-arrived]').click();
  await staffPage.locator('#arrival-sheet-backdrop').waitFor({ timeout: 10000 });
  assert.equal(await staffPage.locator('#seat-table').count(), 0);
  await staffPage.locator('#arrival-sheet-otp').fill(guestSession.otp);
  await staffPage.locator('#arrival-sheet-form button[type="submit"]').click();
  await staffPage.locator('[data-tab="history"]').waitFor({ timeout: 30000 });
  const historyRow = staffPage.locator('.q-row', { hasText: guestPhone }).first();
  await historyRow.waitFor({ timeout: 30000 });
  console.log(JSON.stringify({
    debugHistoryRow: {
      text: await historyRow.textContent(),
      url: staffPage.url(),
    },
  }));
  const historyApi = await fetchJson(`${base}/api/v1/queue/history/recent`, staffToken);
  console.log(JSON.stringify({
    debugHistoryApi: historyApi.body?.data?.find((entry) => entry.id === entryId) || null,
  }));
  assert(await historyRow.getByText('Completed').isVisible());
  assert.equal(historyApi.status, 200);
  assert(historyApi.body.data.some((entry) => entry.id === entryId));

  const adminContext = await browser.newContext({ ...devices['iPhone 14'] });
  const adminPage = await adminContext.newPage();
  const adminMonitor = attachMonitor(adminPage);
  await login(adminPage, {
    path: `/v/${slug}/admin/login`,
    phoneSelector: '#admin-phone',
    sendFormSelector: '#admin-send-form',
    codeSelector: '#admin-code',
    verifyFormSelector: '#admin-verify-form',
    phone: adminPhone,
  });
  await adminPage.waitForURL(new RegExp(`/v/${slug}/admin/dashboard$`), { timeout: 30000 });
  await adminPage.getByText('Queue settings').waitFor({ timeout: 30000 });
  assert.equal(await adminPage.locator('[data-tab="menu"]').count(), 0);
  assert.equal(await adminPage.locator('[data-tab="add"]').count(), 0);
  assert.equal(await adminPage.locator('[data-tab="content"]').count(), 0);
  assert.equal(await adminPage.locator('[data-tab="tables"]').count(), 0);

  const tablesResult = await fetchJson(`${base}/api/v1/tables`, staffToken);
  assert.equal(tablesResult.status, 403);
  const adminAuth = await getLocalStorageEntry(adminPage, `(key, value) => key === 'flock_staff_auth' && Boolean(value?.token)`);
  const contentResult = await fetchJson(`${base}/api/v1/content/admin/current`, adminAuth.token);
  assert.equal(contentResult.status, 403);

  const monitors = [guestMonitor, staffMonitor, adminMonitor];
  const criticalUiFailures = monitors.flatMap((monitor) => monitor.apiFailures).filter((failure) => failure.status >= 500 || failure.status === 429 || failure.status === 502);
  const consoleErrors = monitors.flatMap((monitor) => monitor.consoleErrors);
  assert.equal(criticalUiFailures.length, 0);
  assert.equal(consoleErrors.length, 0);

  console.log(JSON.stringify({
    guestPhone,
    entryId,
    otp: guestSession.otp,
    historyVisible: true,
    tablesApiStatus: tablesResult.status,
    contentApiStatus: contentResult.status,
  }, null, 2));

  await guestContext.close();
  await staffContext.close();
  await adminContext.close();
} finally {
  await cleanupGuest(guestSession, staffToken);
  if (browser) await browser.close();
}
