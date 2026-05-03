-- Add forward-looking queue cancellation audit metadata.
-- Existing queue entries/history rows are intentionally left unchanged.
ALTER TABLE "QueueEntry"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByType" TEXT,
  ADD COLUMN "cancelledByStaffId" TEXT,
  ADD COLUMN "cancelledByStaffName" TEXT,
  ADD COLUMN "cancelReason" TEXT;

ALTER TYPE "OrderFlowEventType" ADD VALUE IF NOT EXISTS 'ENTRY_NO_SHOW';
