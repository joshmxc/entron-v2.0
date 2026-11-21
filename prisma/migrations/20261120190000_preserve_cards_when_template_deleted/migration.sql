ALTER TABLE "guest_invitations"
  ALTER COLUMN "template_id" DROP NOT NULL;

ALTER TABLE "guest_invitations"
  DROP CONSTRAINT "guest_invitations_template_id_fkey",
  ADD CONSTRAINT "guest_invitations_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "invitation_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
