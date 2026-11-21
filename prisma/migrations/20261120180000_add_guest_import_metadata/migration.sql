ALTER TABLE "guests"
ADD COLUMN "organization" TEXT,
ADD COLUMN "custom" JSONB,
ADD COLUMN "validation_warnings" JSONB;

ALTER TABLE "import_batches"
ADD COLUMN "source_path" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "total_rows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "skipped_rows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "column_map" JSONB,
ADD COLUMN "error" TEXT;
