import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../utils/response';
import { redeemQueueAccessLink } from '../services/guestAccessLink.service';

const RedeemSchema = z.object({
  token: z.string().min(1),
});

export async function redeemAccessLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = RedeemSchema.parse(req.body ?? {});
    const result = await redeemQueueAccessLink({
      queueEntryId: String(req.params.entryId || ''),
      token,
    });
    ok(res, result);
  } catch (error) {
    next(error);
  }
}
