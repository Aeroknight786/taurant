import { env } from '../config/env';
import { logger } from '../config/logger';

export interface PosOrderItem {
  id:       string;
  name:     string;
  price:    number;  // rupees
  quantity: number;
  notes?:   string;
}

export interface PosOrderParams {
  outletId:    string;
  channelRef:  string;  // Flock order ID
  items:       PosOrderItem[];
  tableNumber: string;
  guestName:   string;
  notes?:      string;
}

export interface PosOrderResult {
  posOrderId: string;
  status:     string;
}

export async function pushOrderToPos(params: PosOrderParams): Promise<PosOrderResult> {
  if (env.USE_MOCK_POS) {
    logger.debug('[MOCK] pushOrderToPos', { channelRef: params.channelRef });
    return { posOrderId: `pos_mock_${Date.now()}`, status: 'acknowledged' };
  }

  const payload = {
    id:       params.channelRef,
    channel:  { id: 'flock', name: 'Flock' },
    outlet:   { biz_location_id: params.outletId },
    order: {
      items: params.items.map(item => ({
        id:            item.id,
        title:         item.name,
        price:         item.price,
        quantity:      item.quantity,
        instructions:  item.notes,
      })),
      fulfillment_type: 'dine_in',
      ext_platforms: [{ name: 'flock', id: params.channelRef }],
      delivery_datetime: new Date().toISOString(),
      customer: { name: params.guestName },
      instructions: params.notes,
    },
  };

  const credentials = Buffer.from(`${env.URBANPIPER_USERNAME}:${env.URBANPIPER_API_KEY}`).toString('base64');
  const res = await fetch(`${env.URBANPIPER_BASE_URL}/order/`, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as { id?: string; order_id?: string; status?: string };
  if (!res.ok) throw new Error(`UrbanPiper error: ${JSON.stringify(data)}`);

  return { posOrderId: data.order_id ?? data.id ?? 'unknown', status: data.status ?? 'sent' };
}
