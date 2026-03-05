-- Remove orphaned personal workspaces left behind by historical user deletions.
-- A valid personal workspace should always have an OWNER membership.

BEGIN;

DELETE FROM "Team"
WHERE "isPersonal" = 1
  AND NOT EXISTS (
    SELECT 1
    FROM "TeamMember"
    WHERE "TeamMember"."teamId" = "Team"."id"
      AND "TeamMember"."role" = 'OWNER'
  );

COMMIT;
