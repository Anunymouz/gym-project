-- A new trainer has no price until they set one (0 = not set; they can't be listed until it's above 0).
ALTER TABLE "trainers" DROP CONSTRAINT "trainers_price_positive";
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_price_not_negative" CHECK ("sessionPricePesewas" >= 0);
-- Package sessions can't go below zero, or above what was bought.
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_sessions_valid" CHECK ("sessionsRemaining" >= 0 AND "sessionsRemaining" <= "sessionsCount");
