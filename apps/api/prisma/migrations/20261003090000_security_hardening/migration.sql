-- AlterTable: device details, "keep me signed in", and the last time the
-- person proved who they are.
ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reauthenticatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- Permission to read the school's audit log: Directors only, in every
-- existing school. (A new school's Director gets every permission in the
-- catalog automatically; the Principal role excludes this one.)
INSERT INTO "Permission" ("id", "key", "module", "action", "description") VALUES
  ('perm_audit_view', 'audit.view', 'audit', 'view', 'View the school''s audit log')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "scope", "readOnly")
SELECT 'rp_' || md5(r."id" || p."key"), r."id", p."id", 'ALL_SCHOOL', false
FROM "Role" r
JOIN "Permission" p ON p."key" = 'audit.view'
WHERE r."name" = 'Director' AND r."isSystem" = true AND r."deletedAt" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
