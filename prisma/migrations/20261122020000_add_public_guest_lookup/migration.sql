ALTER TABLE "events"
ADD COLUMN "public_lookup_token" TEXT;

UPDATE "events"
SET "public_lookup_token" = replace(gen_random_uuid()::text, '-', '')
WHERE "public_lookup_token" IS NULL;

CREATE UNIQUE INDEX "events_public_lookup_token_key"
ON "events"("public_lookup_token");
