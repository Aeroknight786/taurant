import { OrderType, PaymentStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { aggregateGst } from '../utils/gst';
import { selectBillableOrders } from './order.service';

type FlowMatch =
  | { queueEntryId: string; matchedBy: 'queueEntryId' | 'flowRef' }
  | { queueEntryId: string; matchedBy: 'partySessionId' | 'joinToken' }
  | { queueEntryId: string; matchedBy: 'orderId' | 'orderRef' | 'posOrderId' }
  | { queueEntryId: string; matchedBy: 'paymentId' | 'txnRef' | 'razorpayOrderId' | 'razorpayPaymentId' };

type TimelineEvent = {
  at: string;
  kind: string;
  label: string;
  detail: string;
};

type FlowOrderSummary = {
  id: string;
  orderRef: string;
  type: OrderType;
  status: string;
  totalIncGst: number;
  posOrderId: string | null;
  posPushedAt: Date | null;
  createdAt: Date;
  isBillable: boolean;
  items: Array<{
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    totalIncGst: number;
  }>;
  payments: Array<{
    id: string;
    txnRef: string;
    type: string;
    status: PaymentStatus;
    amount: number;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    createdAt: Date;
    capturedAt: Date | null;
    refundedAt: Date | null;
  }>;
  invoice: {
    id: string;
    invoiceNumber: string;
    total: number;
    issuedAt: Date;
  } | null;
};

export async function lookupFlowState(venueId: string, rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) {
    throw new AppError('Enter a flow ref, order ref, session token, queue entry ID, or payment ref', 400, 'FLOW_QUERY_REQUIRED');
  }

  const match = await resolveQueueEntryMatch(venueId, query);
  if (!match) {
    throw new AppError('No guest flow matched that lookup value', 404, 'FLOW_NOT_FOUND');
  }

  const entry = await prisma.queueEntry.findFirst({
    where: { id: match.queueEntryId, venueId },
    include: {
      table: {
        select: {
          id: true,
          label: true,
          section: true,
          status: true,
        },
      },
      orders: {
        where: { status: { notIn: ['CANCELLED'] } },
        orderBy: { createdAt: 'asc' },
        include: {
          items: true,
          payments: {
            orderBy: { createdAt: 'asc' },
          },
          invoice: true,
        },
      },
      notifications: {
        orderBy: { createdAt: 'asc' },
        take: 25,
      },
      partySession: {
        include: {
          participants: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      },
    },
  });

  if (!entry) {
    throw new AppError('Matched flow is no longer available for this venue', 404, 'FLOW_NOT_FOUND');
  }

  const billableOrders = selectBillableOrders(entry.orders);
  const billableItems = billableOrders.flatMap((order) => order.items);
  const gst = aggregateGst(
    billableItems.map((item) => ({
      priceExGst: item.priceExGst,
      quantity: item.quantity,
      gstPercent: item.gstPercent,
    })),
  );

  const ordersSummary: FlowOrderSummary[] = entry.orders.map((order) => ({
    id: order.id,
    orderRef: order.orderRef,
    type: order.type,
    status: order.status,
    totalIncGst: order.totalIncGst,
    posOrderId: order.posOrderId,
    posPushedAt: order.posPushedAt,
    createdAt: order.createdAt,
    isBillable: billableOrders.some((billableOrder) => billableOrder.id === order.id),
    items: order.items.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      totalIncGst: item.totalIncGst,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      txnRef: payment.txnRef,
      type: payment.type,
      status: payment.status,
      amount: payment.amount,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      createdAt: payment.createdAt,
      capturedAt: payment.capturedAt,
      refundedAt: payment.refundedAt,
    })),
    invoice: order.invoice
      ? {
          id: order.invoice.id,
          invoiceNumber: order.invoice.invoiceNumber,
          total: order.invoice.total,
          issuedAt: order.invoice.issuedAt,
        }
      : null,
  }));

  const notificationsSummary = entry.notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    channel: notification.channel,
    status: notification.status,
    to: notification.to,
    externalRef: notification.externalRef,
    createdAt: notification.createdAt,
    sentAt: notification.sentAt,
    error: notification.error,
  }));

  const tableEvents = entry.tableId
    ? await prisma.tableEvent.findMany({
        where: {
          tableId: entry.tableId,
          createdAt: { gte: entry.joinedAt },
        },
        orderBy: { createdAt: 'asc' },
        take: 25,
      })
    : [];

  return {
    query,
    matchedBy: match.matchedBy,
    queueEntry: {
      id: entry.id,
      flowRef: entry.flowRef,
      status: entry.status,
      guestName: entry.guestName,
      guestPhone: entry.guestPhone,
      partySize: entry.partySize,
      position: entry.position,
      joinedAt: entry.joinedAt,
      notifiedAt: entry.notifiedAt,
      seatedAt: entry.seatedAt,
      completedAt: entry.completedAt,
      preOrderTotal: entry.preOrderTotal,
      depositPaid: entry.depositPaid,
      depositTxnRef: entry.depositTxnRef,
      table: entry.table,
    },
    partySession: entry.partySession
      ? {
          id: entry.partySession.id,
          status: entry.partySession.status,
          joinToken: entry.partySession.joinToken,
          participantCount: entry.partySession.participants.filter((participant) => participant.isActive).length,
          participants: entry.partySession.participants.map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            guestPhone: participant.guestPhone,
            role: participant.role,
            isPayer: participant.isPayer,
            isActive: participant.isActive,
            joinedAt: participant.joinedAt,
            lastSeenAt: participant.lastSeenAt,
          })),
        }
      : null,
    billSummary: {
      subtotalExGst: gst.subtotalExGst,
      cgst: gst.cgstAmount,
      sgst: gst.sgstAmount,
      totalIncGst: gst.totalIncGst,
      depositPaid: entry.depositPaid,
      balanceDue: Math.max(0, gst.totalIncGst - entry.depositPaid),
    },
    orders: ordersSummary,
    notifications: notificationsSummary,
    tableEvents: tableEvents.map((event) => ({
      id: event.id,
      tableId: event.tableId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      triggeredBy: event.triggeredBy,
      note: event.note,
      createdAt: event.createdAt,
    })),
    timeline: buildTimeline({
      flowRef: entry.flowRef,
      joinedAt: entry.joinedAt,
      notifiedAt: entry.notifiedAt,
      seatedAt: entry.seatedAt,
      completedAt: entry.completedAt,
      orders: ordersSummary,
      notifications: notificationsSummary,
      tableEvents,
    }),
  };
}

async function resolveQueueEntryMatch(venueId: string, query: string): Promise<FlowMatch | null> {
  const queueEntry = await prisma.queueEntry.findFirst({
    where: {
      venueId,
      OR: [{ id: query }, { flowRef: query }],
    },
    select: { id: true, flowRef: true },
  });
  if (queueEntry) {
    return {
      queueEntryId: queueEntry.id,
      matchedBy: queueEntry.id === query ? 'queueEntryId' : 'flowRef',
    };
  }

  const partySession = await prisma.partySession.findFirst({
    where: {
      venueId,
      OR: [{ id: query }, { joinToken: query }],
    },
    select: { id: true, joinToken: true, queueEntryId: true },
  });
  if (partySession) {
    return {
      queueEntryId: partySession.queueEntryId,
      matchedBy: partySession.id === query ? 'partySessionId' : 'joinToken',
    };
  }

  const order = await prisma.order.findFirst({
    where: {
      venueId,
      OR: [{ id: query }, { orderRef: query }, { posOrderId: query }],
    },
    select: { id: true, orderRef: true, posOrderId: true, queueEntryId: true },
  });
  if (order) {
    return {
      queueEntryId: order.queueEntryId,
      matchedBy: order.id === query ? 'orderId' : order.orderRef === query ? 'orderRef' : 'posOrderId',
    };
  }

  const payment = await prisma.payment.findFirst({
    where: {
      venueId,
      OR: [{ id: query }, { txnRef: query }, { razorpayOrderId: query }, { razorpayPaymentId: query }],
    },
    select: {
      id: true,
      txnRef: true,
      razorpayOrderId: true,
      razorpayPaymentId: true,
      order: {
        select: {
          queueEntryId: true,
        },
      },
    },
  });
  if (payment) {
    return {
      queueEntryId: payment.order.queueEntryId,
      matchedBy:
        payment.id === query
          ? 'paymentId'
          : payment.txnRef === query
            ? 'txnRef'
            : payment.razorpayOrderId === query
              ? 'razorpayOrderId'
              : 'razorpayPaymentId',
    };
  }

  return null;
}

function buildTimeline(params: {
  flowRef: string;
  joinedAt: Date;
  notifiedAt: Date | null;
  seatedAt: Date | null;
  completedAt: Date | null;
  orders: FlowOrderSummary[];
  notifications: Array<{
    type: string;
    channel: string;
    status: string;
    createdAt: Date;
    sentAt: Date | null;
  }>;
  tableEvents: Array<{
    fromStatus: string;
    toStatus: string;
    triggeredBy: string | null;
    createdAt: Date;
  }>;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      at: params.joinedAt.toISOString(),
      kind: 'queue',
      label: 'Queue joined',
      detail: `Flow ${params.flowRef} entered the queue`,
    },
  ];

  if (params.notifiedAt) {
    events.push({
      at: params.notifiedAt.toISOString(),
      kind: 'queue',
      label: 'Table ready',
      detail: 'Guest was notified that a table became ready',
    });
  }

  if (params.seatedAt) {
    events.push({
      at: params.seatedAt.toISOString(),
      kind: 'queue',
      label: 'Guest seated',
      detail: 'Queue entry moved into the seated state',
    });
  }

  if (params.completedAt) {
    events.push({
      at: params.completedAt.toISOString(),
      kind: 'queue',
      label: 'Service completed',
      detail: 'Queue entry was checked out and completed',
    });
  }

  params.orders.forEach((order) => {
    events.push({
      at: order.createdAt.toISOString(),
      kind: 'order',
      label: `${order.type === OrderType.PRE_ORDER ? 'Pre-order' : 'Table order'} created`,
      detail: `${order.orderRef} · ${order.status} · ${(order.totalIncGst / 100).toFixed(2)}`,
    });

    order.payments.forEach((payment) => {
      events.push({
        at: payment.createdAt.toISOString(),
        kind: 'payment',
        label: `${payment.type} payment initiated`,
        detail: `${payment.txnRef} · ${(payment.amount / 100).toFixed(2)} · ${payment.status}`,
      });

      if (payment.capturedAt) {
        events.push({
          at: payment.capturedAt.toISOString(),
          kind: 'payment',
          label: `${payment.type} payment captured`,
          detail: `${payment.txnRef} captured successfully`,
        });
      }

      if (payment.refundedAt) {
        events.push({
          at: payment.refundedAt.toISOString(),
          kind: 'payment',
          label: `${payment.type} payment refunded`,
          detail: `${payment.txnRef} refunded`,
        });
      }
    });

    if (order.invoice) {
      events.push({
        at: order.invoice.issuedAt.toISOString(),
        kind: 'invoice',
        label: 'Invoice issued',
        detail: order.invoice.invoiceNumber,
      });
    }
  });

  params.notifications.forEach((notification) => {
    events.push({
      at: (notification.sentAt ?? notification.createdAt).toISOString(),
      kind: 'notification',
      label: `${notification.type} notification`,
      detail: `${notification.channel} · ${notification.status}`,
    });
  });

  params.tableEvents.forEach((event) => {
    events.push({
      at: event.createdAt.toISOString(),
      kind: 'table',
      label: 'Table state changed',
      detail: `${event.fromStatus} -> ${event.toStatus}${event.triggeredBy ? ` · ${event.triggeredBy}` : ''}`,
    });
  });

  return events.sort((left, right) => left.at.localeCompare(right.at));
}
