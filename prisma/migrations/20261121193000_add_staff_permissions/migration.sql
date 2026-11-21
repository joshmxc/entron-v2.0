ALTER TABLE "users"
ADD COLUMN "username" TEXT,
ADD COLUMN "can_scan" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "can_manage_guests" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "can_design_cards" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "can_send_messages" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "last_seen_at" TIMESTAMP(3);

UPDATE "users"
SET "username" = 'staff_' || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "username" IS NULL;

UPDATE "users"
SET "can_manage_guests" = true,
    "can_design_cards" = true,
    "can_send_messages" = true
WHERE "role" = 'ADMIN';

ALTER TABLE "users"
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
