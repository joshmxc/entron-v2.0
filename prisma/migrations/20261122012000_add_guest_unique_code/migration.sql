ALTER TABLE "guests"
ADD COLUMN "unique_code" TEXT;

UPDATE "guests"
SET "unique_code" = 'ENT-' || upper(substr(replace(md5(random()::text || "id"), '-', ''), 1, 8))
WHERE "unique_code" IS NULL;

ALTER TABLE "guests"
ALTER COLUMN "unique_code" SET NOT NULL;

CREATE UNIQUE INDEX "guests_unique_code_key" ON "guests"("unique_code");
