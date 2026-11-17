-- First and last name, and a profile photo stored by BGYM (avatarUrl was never set).
ALTER TABLE "users" ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "avatarKey" TEXT,
  ADD COLUMN "avatarThumbKey" TEXT,
  DROP COLUMN "avatarUrl";

-- Existing names: first word is the first name, the rest the last name. People with a single
-- word keep it as their first name and are asked for a last name next time they open the app.
UPDATE "users"
SET "firstName" = split_part(btrim("name"), ' ', 1),
    "lastName" = NULLIF(btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1)), '')
WHERE "name" IS NOT NULL AND btrim("name") <> '';
