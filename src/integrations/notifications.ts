import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { NotificationType, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import {
  sendIvrQueueExpired,
  sendIvrQueueNoShow,
  sendIvrQueueReadyReminder,
  sendIvrQueueTableReady,
} from './ivr';

const CRAFTERY_VENUE_SLUG = 'the-craftery-koramangala';

type WhatsAppTemplatePayload = {
  id: string;
  name: string;
  variables: string[];
};

function normalizeWhatsAppDestination(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (/^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return digits;
}

// ── Template builders ──────────────────────────────────────────────

function otpMessage(otp: string, venueName: string): string {
  return `Your Flock OTP for ${venueName} is *${otp}*. Valid for 5 minutes. Do not share.`;
}

function queueJoinedMessage(name: string, venueName: string, statusLink?: string, guestOtp?: string): string {
  const linkLine = statusLink ? `\n\nTrack your status here: ${statusLink}` : '';
  const otpLine = guestOtp ? `\nYour OTP is ${guestOtp}.` : '';
  return `Hi ${name}, you're now on the waitlist at ${venueName}.${linkLine}${otpLine}`;
}

function queueReadyReminderMessage(name: string, venueName: string, position?: number, waitMin?: number): string {
  const positionPart = Number.isFinite(position) && (position ?? 0) > 0 ? ` You're still #${position} in line.` : '';
  const waitPart = Number.isFinite(waitMin) ? ` Estimated wait: ~${waitMin} mins.` : '';
  return `Hi ${name}!${positionPart}${waitPart} Please stay nearby and keep your phone handy. The host desk will call your party when a table is ready at ${venueName}.`;
}

function queueExpiredMessage(name: string, venueName: string, reason: 'EXPIRED' | 'NO_SHOW'): string {
  if (reason === 'NO_SHOW') {
    return `Hi ${name}. We couldn't reach you in time at ${venueName}, so the waitlist slot was released. Please check with the host desk if you'd like to rejoin.`;
  }

  return `Hi ${name}. Your host desk call window at ${venueName} expired. If you're still waiting, please check back in with the host desk.`;
}

function tableReadyMessage(
  name: string,
  venueName: string,
  windowMin: number,
  statusLink?: string,
  guestOtp?: string,
  tableLabel?: string,
): string {
  const labelSuffix = tableLabel ? ` (${tableLabel})` : '';
  const linkLine = statusLink ? `\n\nCheck your status here: ${statusLink}` : '';
  const otpLine = guestOtp ? `\nYour OTP is ${guestOtp}.` : '';
  return `Hi ${name}, your table${labelSuffix} is ready at ${venueName}. Please head to the host desk within ${windowMin} minutes or it may be reassigned.${linkLine}${otpLine}`;
}

function orderConfirmedMessage(name: string, txnRef: string, amount: number): string {
  return `Pre-order confirmed! ₹${(amount / 100).toFixed(2)} deposit received. Ref: ${txnRef}. Your food will be ready when you're seated.`;
}

// ── Gupshup WhatsApp sender ────────────────────────────────────────

function shouldUseMockNotification(type: NotificationType): boolean {
  if (type === NotificationType.OTP) {
    return env.USE_MOCK_AUTH_OTP_NOTIFICATIONS;
  }
  return env.USE_MOCK_NOTIFICATIONS;
}

async function sendWhatsAppText(to: string, message: string, mockMode: boolean): Promise<string> {
  if (mockMode) {
    logger.debug(`[MOCK WhatsApp → ${to}]: ${message}`);
    return `mock_wa_${Date.now()}`;
  }

  const destination = normalizeWhatsAppDestination(to);

  const url = 'https://api.gupshup.io/sm/api/v1/msg';
  const body = new URLSearchParams({
    channel:    'whatsapp',
    source:     env.GUPSHUP_SOURCE_NUMBER,
    destination,
    message:    JSON.stringify({ type: 'text', text: message }),
    'src.name': env.GUPSHUP_APP_NAME,
  });

  const res = await fetch(url, {
    method:  'POST',
    headers: { apikey: env.GUPSHUP_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  const data = await res.json() as { messageId?: string; status?: string };
  if (!res.ok) throw new Error(`Gupshup error: ${JSON.stringify(data)}`);
  return data.messageId ?? 'unknown';
}

async function sendWhatsAppTemplate(
  to: string,
  template: WhatsAppTemplatePayload,
  mockMode: boolean,
): Promise<string> {
  if (mockMode) {
    logger.debug(`[MOCK WhatsApp Template → ${to}]: ${template.name} ${JSON.stringify(template.variables)}`);
    return `mock_wa_tpl_${Date.now()}`;
  }

  if (!template.id) {
    throw new Error(`Gupshup template "${template.name}" is not configured`);
  }

  const destination = normalizeWhatsAppDestination(to);

  const url = 'https://api.gupshup.io/wa/api/v1/template/msg';
  const body = new URLSearchParams({
    source: env.GUPSHUP_SOURCE_NUMBER,
    destination,
    template: JSON.stringify({
      id: template.id,
      params: template.variables,
    }),
    'src.name': env.GUPSHUP_APP_NAME,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: env.GUPSHUP_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json() as { messageId?: string; status?: string };
  if (!res.ok) throw new Error(`Gupshup template error: ${JSON.stringify(data)}`);
  return data.messageId ?? 'unknown';
}

// ── MSG91 SMS sender ───────────────────────────────────────────────

async function sendSms(to: string, message: string, mockMode: boolean): Promise<string> {
  if (mockMode) {
    logger.debug(`[MOCK SMS → ${to}]: ${message}`);
    return `mock_sms_${Date.now()}`;
  }

  const url = `https://api.msg91.com/api/v2/sendsms`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      authkey: env.MSG91_AUTH_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:    env.MSG91_SENDER_ID,
      route:     '4',
      country:   '91',
      sms: [{ message, to: [to] }],
    }),
  });

  const data = await res.json() as { request_id?: string; type?: string };
  if (!res.ok) throw new Error(`MSG91 error: ${JSON.stringify(data)}`);
  return data.request_id ?? 'unknown';
}

// ── Unified send + logging ─────────────────────────────────────────

export interface SendNotificationParams {
  venueId:      string;
  queueEntryId?: string;
  type:         NotificationType;
  to:           string;
  message:      string;
  channel?:     NotificationChannel;
  payload?:     Record<string, unknown>;
  template?:    WhatsAppTemplatePayload;
  allowSmsFallback?: boolean;
}

export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const channel = params.channel ?? NotificationChannel.WHATSAPP;
  const mockMode = shouldUseMockNotification(params.type);
  const log = await prisma.notification.create({
    data: {
      venueId:      params.venueId,
      queueEntryId: params.queueEntryId,
      type:         params.type,
      channel,
      to:           params.to,
      templateId:   params.template?.id,
      payload:      params.payload as Prisma.InputJsonValue | undefined,
      status:       NotificationStatus.PENDING,
    },
  });

  try {
    let externalRef: string;
    if (channel === NotificationChannel.WHATSAPP) {
      externalRef = params.template
        ? await sendWhatsAppTemplate(params.to, params.template, mockMode)
        : await sendWhatsAppText(params.to, params.message, mockMode);
    } else {
      externalRef = await sendSms(params.to, params.message, mockMode);
    }

    await prisma.notification.update({
      where: { id: log.id },
      data:  { status: NotificationStatus.SENT, externalRef, sentAt: new Date() },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Notification send failed', { error, to: params.to, type: params.type });
    await prisma.notification.update({
      where: { id: log.id },
      data:  { status: NotificationStatus.FAILED, error },
    });
    // Try SMS fallback if WhatsApp fails
    if (channel === NotificationChannel.WHATSAPP && params.allowSmsFallback !== false) {
      await sendNotification({ ...params, channel: NotificationChannel.SMS, template: undefined, allowSmsFallback: false });
    }
  }
}

async function maybeSendIvrForQueueMessage(
  venueId: string,
  queueEntryId: string,
  phone: string,
  message: string,
  kind: 'TABLE_READY' | 'QUEUE_READY_REMINDER' | 'QUEUE_EXPIRED' | 'QUEUE_NO_SHOW',
): Promise<void> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { slug: true },
  });

  if (!venue?.slug) {
    return;
  }

  try {
    const params = {
      venueId,
      venueSlug: venue.slug,
      queueEntryId,
      to: phone,
      message,
    };

    if (kind === 'TABLE_READY') {
      await sendIvrQueueTableReady(params);
    } else if (kind === 'QUEUE_READY_REMINDER') {
      await sendIvrQueueReadyReminder(params);
    } else if (kind === 'QUEUE_EXPIRED') {
      await sendIvrQueueExpired(params);
    } else {
      await sendIvrQueueNoShow(params);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    logger.error('IVR queue-status dispatch failed', {
      venueId,
      queueEntryId,
      to: phone,
      kind,
      error: messageText,
    });
  }
}

async function sendQueueStatusNotification(params: {
  venueId: string;
  queueEntryId: string;
  phone: string;
  message: string;
  payload: Record<string, unknown>;
  template?: WhatsAppTemplatePayload;
  allowSmsFallback?: boolean;
}): Promise<void> {
  await sendNotification({
    venueId: params.venueId,
    queueEntryId: params.queueEntryId,
    type: NotificationType.TABLE_READY,
    to: params.phone,
    message: params.message,
    payload: params.payload,
    template: params.template,
    allowSmsFallback: params.allowSmsFallback,
  });
}

// ── Convenience wrappers ───────────────────────────────────────────

export const Notify = {
  otp: (venueId: string, phone: string, otp: string, venueName: string) =>
    sendNotification({ venueId, type: NotificationType.OTP, to: phone, message: otpMessage(otp, venueName) }),

  queueJoined: (
    venueId: string,
    entryId: string,
    phone: string,
    name: string,
    venueName: string,
    options: {
      venueSlug?: string;
      queuePosition?: number;
      estimatedWaitMin?: number;
      statusLink?: string;
      guestOtp?: string;
    } = {},
  ) =>
    sendNotification({
      venueId,
      queueEntryId: entryId,
      type: NotificationType.QUEUE_JOINED,
      to: phone,
      message: queueJoinedMessage(name, venueName, options.statusLink, options.guestOtp),
      template: options.venueSlug === CRAFTERY_VENUE_SLUG
        ? {
            id: env.GUPSHUP_TEMPLATE_QUEUE_JOIN_ID,
            name: env.GUPSHUP_TEMPLATE_QUEUE_JOIN_NAME,
            variables: [
              name,
              String(options.queuePosition ?? ''),
              String(options.estimatedWaitMin ?? ''),
              String(options.guestOtp ?? ''),
              String(options.statusLink ?? ''),
            ],
          }
        : undefined,
      allowSmsFallback: options.venueSlug === CRAFTERY_VENUE_SLUG ? false : undefined,
      payload: {
        kind: 'QUEUE_JOINED',
        name,
        venueName,
        queuePosition: options.queuePosition ?? null,
        estimatedWaitMin: options.estimatedWaitMin ?? null,
        statusLink: options.statusLink ?? null,
        guestOtp: options.guestOtp ?? null,
        templateName: options.venueSlug === CRAFTERY_VENUE_SLUG ? env.GUPSHUP_TEMPLATE_QUEUE_JOIN_NAME : null,
        templateVariables: options.venueSlug === CRAFTERY_VENUE_SLUG
          ? {
              guest_name: name,
              queue_position: options.queuePosition ?? null,
              estimated_wait: options.estimatedWaitMin ?? null,
              otp: options.guestOtp ?? null,
              status_link: options.statusLink ?? null,
            }
          : null,
      },
    }),

  queueReadyReminder: async (
    venueId: string,
    entryId: string,
    phone: string,
    name: string,
    position: number,
    waitMin: number,
    venueName: string,
    options: {
      venueSlug?: string;
      enableWhatsApp?: boolean;
    } = {},
  ) => {
    const message = queueReadyReminderMessage(name, venueName, position, waitMin);

    if (options.enableWhatsApp !== false) {
      await sendQueueStatusNotification({
        venueId,
        queueEntryId: entryId,
        phone,
        message,
        payload: {
          kind: 'QUEUE_READY_REMINDER',
          name,
          position,
          waitMin,
          venueName,
        },
      });
    }

    await maybeSendIvrForQueueMessage(venueId, entryId, phone, message, 'QUEUE_READY_REMINDER');
  },

  queueExpired: async (
    venueId: string,
    entryId: string,
    phone: string,
    name: string,
    venueName: string,
    options: {
      enableWhatsApp?: boolean;
    } = {},
  ) => {
    const message = queueExpiredMessage(name, venueName, 'EXPIRED');

    if (options.enableWhatsApp !== false) {
      await sendQueueStatusNotification({
        venueId,
        queueEntryId: entryId,
        phone,
        message,
        payload: {
          kind: 'QUEUE_EXPIRED',
          name,
          venueName,
        },
      });
    }

    await maybeSendIvrForQueueMessage(venueId, entryId, phone, message, 'QUEUE_EXPIRED');
  },

  queueNoShow: async (
    venueId: string,
    entryId: string,
    phone: string,
    name: string,
    venueName: string,
    options: {
      enableWhatsApp?: boolean;
    } = {},
  ) => {
    const message = queueExpiredMessage(name, venueName, 'NO_SHOW');

    if (options.enableWhatsApp !== false) {
      await sendQueueStatusNotification({
        venueId,
        queueEntryId: entryId,
        phone,
        message,
        payload: {
          kind: 'QUEUE_NO_SHOW',
          name,
          venueName,
        },
      });
    }

    await maybeSendIvrForQueueMessage(venueId, entryId, phone, message, 'QUEUE_NO_SHOW');
  },

  tableReady: async (
    venueId: string,
    entryId: string,
    phone: string,
    name: string,
    tableLabel: string | undefined,
    venueName: string,
    windowMin: number,
    options: {
      venueSlug?: string;
      statusLink?: string;
      guestOtp?: string;
    } = {},
  ) => {
    const message = tableReadyMessage(name, venueName, windowMin, options.statusLink, options.guestOtp, tableLabel);

    await sendQueueStatusNotification({
      venueId,
      queueEntryId: entryId,
      phone,
      message,
      template: options.venueSlug === CRAFTERY_VENUE_SLUG
        ? {
            id: env.GUPSHUP_TEMPLATE_TABLE_READY_ID,
            name: env.GUPSHUP_TEMPLATE_TABLE_READY_NAME,
            variables: [name],
          }
        : undefined,
      allowSmsFallback: options.venueSlug === CRAFTERY_VENUE_SLUG ? false : undefined,
      payload: {
        kind: 'TABLE_READY',
        name,
        tableLabel,
        venueName,
        windowMin,
        statusLink: options.statusLink ?? null,
        guestOtp: options.guestOtp ?? null,
        templateName: options.venueSlug === CRAFTERY_VENUE_SLUG ? env.GUPSHUP_TEMPLATE_TABLE_READY_NAME : null,
        templateVariables: options.venueSlug === CRAFTERY_VENUE_SLUG
          ? { guest_name: name }
          : null,
      },
    });

    await maybeSendIvrForQueueMessage(venueId, entryId, phone, message, 'TABLE_READY');
  },

  orderConfirmed: (venueId: string, entryId: string, phone: string, name: string, txnRef: string, amount: number) =>
    sendNotification({ venueId, queueEntryId: entryId, type: NotificationType.ORDER_CONFIRMED, to: phone,
      message: orderConfirmedMessage(name, txnRef, amount) }),
};
