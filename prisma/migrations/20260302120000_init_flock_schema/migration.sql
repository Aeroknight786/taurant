-- CreateEnum
CREATE TYPE "VenuePlan" AS ENUM ('STARTER', 'VENUE', 'MULTI_SITE');

-- CreateEnum
CREATE TYPE "GstLicenceType" AS ENUM ('LICENSED_BAR', 'RESTAURANT_ONLY');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('FREE', 'OCCUPIED', 'CLEARING', 'RESERVED');

-- CreateEnum
CREATE TYPE "QueueEntryStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PRE_ORDER', 'TABLE_ORDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'FINAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OTP', 'QUEUE_JOINED', 'TABLE_READY', 'TABLE_REASSIGNED', 'ORDER_CONFIRMED', 'INVOICE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "TmsProvider" AS ENUM ('POSIST', 'PETPOOJA', 'URBANPIPER', 'MANUAL');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "gstin" TEXT,
    "licenceType" "GstLicenceType" NOT NULL DEFAULT 'LICENSED_BAR',
    "plan" "VenuePlan" NOT NULL DEFAULT 'STARTER',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "depositPercent" INTEGER NOT NULL DEFAULT 75,
    "tableReadyWindowMin" INTEGER NOT NULL DEFAULT 10,
    "maxQueueSize" INTEGER NOT NULL DEFAULT 200,
    "isQueueOpen" BOOLEAN NOT NULL DEFAULT false,
    "tmsProvider" "TmsProvider" NOT NULL DEFAULT 'MANUAL',
    "tmsApiKey" TEXT,
    "tmsVenueId" TEXT,
    "posPlatform" TEXT,
    "posOutletId" TEXT,
    "monthlyCoversUsed" INTEGER NOT NULL DEFAULT 0,
    "billingCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "venueId" TEXT,
    "staffId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "section" TEXT,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',
    "occupiedSince" TIMESTAMP(3),
    "estimatedFreeAt" TIMESTAMP(3),
    "tmsTableId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableEvent" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "fromStatus" "TableStatus" NOT NULL,
    "toStatus" "TableStatus" NOT NULL,
    "triggeredBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceExGst" INTEGER NOT NULL,
    "gstPercent" DOUBLE PRECISION NOT NULL,
    "isVeg" BOOLEAN NOT NULL DEFAULT true,
    "isAlcohol" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "otp" TEXT NOT NULL,
    "status" "QueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "tableId" TEXT,
    "seatedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "preOrderTotal" INTEGER NOT NULL DEFAULT 0,
    "depositPaid" INTEGER NOT NULL DEFAULT 0,
    "depositTxnRef" TEXT,
    "estimatedWaitMin" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotalExGst" INTEGER NOT NULL DEFAULT 0,
    "cgstAmount" INTEGER NOT NULL DEFAULT 0,
    "sgstAmount" INTEGER NOT NULL DEFAULT 0,
    "totalIncGst" INTEGER NOT NULL DEFAULT 0,
    "posOrderId" TEXT,
    "posPushedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceExGst" INTEGER NOT NULL,
    "gstPercent" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "gstAmount" INTEGER NOT NULL,
    "totalIncGst" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "platformFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "razorpayFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "netToVenue" INTEGER NOT NULL DEFAULT 0,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "txnRef" TEXT NOT NULL,
    "upiApp" TEXT,
    "failureReason" TEXT,
    "capturedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "irn" TEXT,
    "qrCode" TEXT,
    "subtotal" INTEGER NOT NULL,
    "cgst" INTEGER NOT NULL,
    "sgst" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "venueGstin" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleartaxRef" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "queueEntryId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "templateId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalRef" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_email_key" ON "Venue"("email");

-- CreateIndex
CREATE INDEX "Venue_slug_idx" ON "Venue"("slug");

-- CreateIndex
CREATE INDEX "Venue_city_idx" ON "Venue"("city");

-- CreateIndex
CREATE INDEX "Staff_phone_idx" ON "Staff"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_venueId_phone_key" ON "Staff"("venueId", "phone");

-- CreateIndex
CREATE INDEX "OtpCode_phone_purpose_idx" ON "OtpCode"("phone", "purpose");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE INDEX "Table_venueId_status_idx" ON "Table"("venueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Table_venueId_label_key" ON "Table"("venueId", "label");

-- CreateIndex
CREATE INDEX "TableEvent_tableId_idx" ON "TableEvent"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_venueId_name_key" ON "MenuCategory"("venueId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_venueId_isAvailable_idx" ON "MenuItem"("venueId", "isAvailable");

-- CreateIndex
CREATE INDEX "QueueEntry_venueId_status_idx" ON "QueueEntry"("venueId", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_venueId_position_idx" ON "QueueEntry"("venueId", "position");

-- CreateIndex
CREATE INDEX "QueueEntry_otp_idx" ON "QueueEntry"("otp");

-- CreateIndex
CREATE INDEX "QueueEntry_guestPhone_idx" ON "QueueEntry"("guestPhone");

-- CreateIndex
CREATE INDEX "Order_venueId_status_idx" ON "Order"("venueId", "status");

-- CreateIndex
CREATE INDEX "Order_queueEntryId_idx" ON "Order"("queueEntryId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txnRef_key" ON "Payment"("txnRef");

-- CreateIndex
CREATE INDEX "Payment_venueId_idx" ON "Payment"("venueId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_txnRef_idx" ON "Payment"("txnRef");

-- CreateIndex
CREATE INDEX "Payment_razorpayPaymentId_idx" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_venueId_idx" ON "Invoice"("venueId");

-- CreateIndex
CREATE INDEX "Notification_venueId_idx" ON "Notification"("venueId");

-- CreateIndex
CREATE INDEX "Notification_queueEntryId_idx" ON "Notification"("queueEntryId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableEvent" ADD CONSTRAINT "TableEvent_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
