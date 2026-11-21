CREATE TABLE "staff_event_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_event_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_event_assignments_user_id_event_id_key"
ON "staff_event_assignments"("user_id", "event_id");

CREATE INDEX "staff_event_assignments_event_id_idx"
ON "staff_event_assignments"("event_id");

ALTER TABLE "staff_event_assignments"
ADD CONSTRAINT "staff_event_assignments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_event_assignments"
ADD CONSTRAINT "staff_event_assignments_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
