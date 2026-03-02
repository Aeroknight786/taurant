import { env } from '../config/env';
import { logger } from '../config/logger';
import { generateInvoiceNumber } from '../utils/txnRef';

export interface InvoiceParams {
  invoiceNumber: string;
  venueGstin:    string;
  venueName:     string;
  venueAddress:  string;
  guestName:     string;
  guestPhone:    string;
  items: Array<{
    name:       string;
    quantity:   number;
    priceExGst: number;
    gstPercent: number;
    totalExGst: number;
    gstAmount:  number;
    total:      number;
  }>;
  subtotal:   number;
  cgst:       number;
  sgst:       number;
  total:      number;
  issuedAt:   Date;
}

export interface InvoiceResult {
  irn?:         string;
  qrCode?:      string;
  cleartaxRef?: string;
}

export async function generateGstInvoice(params: InvoiceParams): Promise<InvoiceResult> {
  if (env.USE_MOCK_GST) {
    logger.debug('[MOCK] generateGstInvoice', { invoiceNumber: params.invoiceNumber });
    return {
      irn:        `mock_irn_${Date.now()}`,
      qrCode:     `mock_qr_${params.invoiceNumber}`,
      cleartaxRef: `ct_${Date.now()}`,
    };
  }

  const payload = {
    version:     '1.1',
    TranDtls:    { TaxSch: 'GST', SupTyp: 'B2C', RegRev: 'N' },
    DocDtls:     { Typ: 'INV', No: params.invoiceNumber, Dt: params.issuedAt.toISOString().slice(0, 10) },
    SellerDtls:  { Gstin: params.venueGstin, LglNm: params.venueName, Addr1: params.venueAddress },
    BuyerDtls:   { Gstin: 'URP', LglNm: params.guestName, Ph: params.guestPhone, POS: '29' },
    ItemList:    params.items.map((item, i) => ({
      SlNo: (i + 1).toString(),
      PrdDesc: item.name,
      IsServc: 'Y',
      Qty:     item.quantity,
      UnitPrice: item.priceExGst / 100,
      TotAmt:  item.totalExGst / 100,
      CgstAmt: item.gstAmount / 200,
      SgstAmt: item.gstAmount / 200,
      TotItemVal: item.total / 100,
    })),
    ValDtls:     {
      AssVal:  params.subtotal / 100,
      CgstVal: params.cgst / 100,
      SgstVal: params.sgst / 100,
      TotInvVal: params.total / 100,
    },
  };

  const res = await fetch(`${env.CLEARTAX_BASE_URL}/einvoice/generate`, {
    method:  'POST',
    headers: {
      'x-cleartax-auth-token': env.CLEARTAX_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json() as { irn?: string; QrCode?: string; cleartaxId?: string };
  if (!res.ok) throw new Error(`ClearTax error: ${JSON.stringify(data)}`);

  return { irn: data.irn, qrCode: data.QrCode, cleartaxRef: data.cleartaxId };
}
