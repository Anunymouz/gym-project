-- Payments can come from Paystack or (development only) the payment simulator.
CREATE TYPE "PaymentProvider" AS ENUM ('paystack', 'dev');

-- Rename (keeps existing rows) instead of drop-and-recreate.
ALTER TABLE "payments" RENAME COLUMN "paystackReference" TO "reference";
ALTER INDEX "payments_paystackReference_key" RENAME TO "payments_reference_key";

ALTER TABLE "payments" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'paystack';
ALTER TABLE "payments" ALTER COLUMN "provider" DROP DEFAULT;
