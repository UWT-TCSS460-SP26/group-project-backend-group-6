/*
  Warnings:

  - The values [user,admin] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[subjectId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `subjectId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- Sprint 3 combined migration: subjectId + Issue (ship together per spec)
-- Run via:  npx prisma migrate dev --create-only --name add_subject_id_and_issue
-- then paste this file in, then:  npx prisma migrate dev

-- ============================================================================
-- 1. Rename the Role enum from lowercase to PascalCase so it matches Auth²'s
--    token claims.  PostgreSQL can't rename enum values directly, so we:
--    a) create a shadow enum with the new values
--    b) cast the column over
--    c) drop the old enum and rename the shadow
-- ============================================================================

-- 1a. New shadow enum
CREATE TYPE "Role_new" AS ENUM ('User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner');

-- 1b. Cast the existing column, mapping old lowercase → PascalCase
ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role_new"
    USING (
      CASE "role"::text
        WHEN 'user'  THEN 'User'::"Role_new"
        WHEN 'admin' THEN 'Admin'::"Role_new"
        -- safety fallback — should never hit in practice
        ELSE 'User'::"Role_new"
      END
    ),
  ALTER COLUMN "role" SET DEFAULT 'User'::"Role_new";

-- 1c. Swap names
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- ============================================================================
-- 2. Add subjectId, firstName, lastName to User
-- ============================================================================

ALTER TABLE "User" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "User" ADD COLUMN "firstName"  TEXT;
ALTER TABLE "User" ADD COLUMN "lastName"   TEXT;

-- Back-fill any existing dev rows so the NOT NULL constraint can be applied.
-- We prefix with 'legacy-' so these are clearly not real Auth² subjects.
UPDATE "User"
SET "subjectId" = 'legacy-' || "id"::text
WHERE "subjectId" IS NULL;

-- Now enforce uniqueness and NOT NULL
ALTER TABLE "User"
  ALTER COLUMN "subjectId" SET NOT NULL;

ALTER TABLE "User"
  ADD CONSTRAINT "User_subjectId_key" UNIQUE ("subjectId");

-- ============================================================================
-- 3. IssueStatus enum
-- ============================================================================

CREATE TYPE "IssueStatus" AS ENUM ('Open', 'InProgress', 'Resolved', 'Closed', 'Wontfix');

-- ============================================================================
-- 4. Issue table
-- ============================================================================

CREATE TABLE "Issue" (
  "id"              SERIAL        PRIMARY KEY,
  "title"           TEXT          NOT NULL,
  "description"     TEXT          NOT NULL,
  "reproSteps"      TEXT,
  "reporterContact" TEXT,
  "status"          "IssueStatus" NOT NULL DEFAULT 'Open',
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);