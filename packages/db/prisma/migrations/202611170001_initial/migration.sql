-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "reminderTime" TEXT NOT NULL DEFAULT '10:00',
    "digestTime" TEXT NOT NULL DEFAULT '16:00',
    "template" TEXT NOT NULL DEFAULT 'ENGINEERING',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "reminders" BOOLEAN NOT NULL DEFAULT true,
    "emailOptIn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "done" TEXT NOT NULL,
    "next" TEXT NOT NULL,
    "impediments" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT NOT NULL DEFAULT '',
    "links" TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Standup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyReply" (
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "StandupRevision" (
    "workspaceId" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandupRevision_pkey" PRIMARY KEY ("workspaceId","standupId","version")
);

-- CreateTable
CREATE TABLE "Draft" (
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("workspaceId","authorId","day")
);

-- CreateTable
CREATE TABLE "Blocker" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ownerId" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'NORMAL',
    "status" "BlockerStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockerSource" (
    "workspaceId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,

    CONSTRAINT "BlockerSource_pkey" PRIMARY KEY ("workspaceId","blockerId","standupId")
);

-- CreateTable
CREATE TABLE "BlockerComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockerComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDay" TEXT NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "status" "CommitmentStatus" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "workspaceId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "ai" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("workspaceId","period","day")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mailState" TEXT NOT NULL DEFAULT 'NONE',
    "mailClaimedAt" TIMESTAMP(3),
    "mailClaimToken" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "window" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key","window")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Membership_userId_removedAt_idx" ON "Membership"("userId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_digest_key" ON "Invite"("digest");

-- CreateIndex
CREATE INDEX "Invite_workspaceId_expiresAt_idx" ON "Invite"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "Standup_workspaceId_day_id_idx" ON "Standup"("workspaceId", "day", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Standup_workspaceId_id_key" ON "Standup"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Standup_workspaceId_authorId_day_key" ON "Standup"("workspaceId", "authorId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyReply_path_key" ON "LegacyReply"("path");

-- CreateIndex
CREATE INDEX "LegacyReply_workspaceId_sourceId_createdAt_idx" ON "LegacyReply"("workspaceId", "sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Blocker_workspaceId_status_createdAt_idx" ON "Blocker"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Blocker_workspaceId_id_key" ON "Blocker"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Blocker_workspaceId_fingerprint_key" ON "Blocker"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "BlockerSource_workspaceId_standupId_idx" ON "BlockerSource"("workspaceId", "standupId");

-- CreateIndex
CREATE INDEX "BlockerComment_workspaceId_blockerId_createdAt_idx" ON "BlockerComment"("workspaceId", "blockerId", "createdAt");

-- CreateIndex
CREATE INDEX "Commitment_workspaceId_ownerId_status_dueDay_idx" ON "Commitment"("workspaceId", "ownerId", "status", "dueDay");

-- CreateIndex
CREATE INDEX "Commitment_workspaceId_status_dueDay_idx" ON "Commitment"("workspaceId", "status", "dueDay");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_workspaceId_id_key" ON "Commitment"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "CommitmentChange_workspaceId_commitmentId_createdAt_idx" ON "CommitmentChange"("workspaceId", "commitmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_workspaceId_createdAt_id_idx" ON "Activity"("workspaceId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_readAt_createdAt_idx" ON "Notification"("workspaceId", "userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_mailState_createdAt_idx" ON "Notification"("mailState", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_userId_key_key" ON "Notification"("workspaceId", "userId", "key");

-- CreateIndex
CREATE INDEX "RateBucket_window_idx" ON "RateBucket"("window");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standup" ADD CONSTRAINT "Standup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standup" ADD CONSTRAINT "Standup_workspaceId_authorId_fkey" FOREIGN KEY ("workspaceId", "authorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyReply" ADD CONSTRAINT "LegacyReply_workspaceId_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "Standup"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandupRevision" ADD CONSTRAINT "StandupRevision_workspaceId_standupId_fkey" FOREIGN KEY ("workspaceId", "standupId") REFERENCES "Standup"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandupRevision" ADD CONSTRAINT "StandupRevision_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_authorId_fkey" FOREIGN KEY ("workspaceId", "authorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerSource" ADD CONSTRAINT "BlockerSource_workspaceId_blockerId_fkey" FOREIGN KEY ("workspaceId", "blockerId") REFERENCES "Blocker"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerSource" ADD CONSTRAINT "BlockerSource_workspaceId_standupId_fkey" FOREIGN KEY ("workspaceId", "standupId") REFERENCES "Standup"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerComment" ADD CONSTRAINT "BlockerComment_workspaceId_blockerId_fkey" FOREIGN KEY ("workspaceId", "blockerId") REFERENCES "Blocker"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockerComment" ADD CONSTRAINT "BlockerComment_workspaceId_authorId_fkey" FOREIGN KEY ("workspaceId", "authorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_workspaceId_sourceId_fkey" FOREIGN KEY ("workspaceId", "sourceId") REFERENCES "Standup"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentChange" ADD CONSTRAINT "CommitmentChange_workspaceId_commitmentId_fkey" FOREIGN KEY ("workspaceId", "commitmentId") REFERENCES "Commitment"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentChange" ADD CONSTRAINT "CommitmentChange_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "Membership"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
