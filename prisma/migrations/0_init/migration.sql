-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "testIdentityNumber" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CITIZEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "userId" TEXT NOT NULL,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Household_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "relationship" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisasterEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "alertLevel" TEXT NOT NULL,
    "predictedStartTime" DATETIME NOT NULL,
    "predictedEndTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DisasterEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffectedZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disasterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "polygonGeoJson" TEXT NOT NULL,
    "radiusKm" REAL NOT NULL DEFAULT 5.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AffectedZone_disasterId_fkey" FOREIGN KEY ("disasterId") REFERENCES "DisasterEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpectedLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disasterId" TEXT NOT NULL,
    "householdMemberId" TEXT NOT NULL,
    "expectedType" TEXT NOT NULL,
    "shelterId" TEXT,
    "otherCity" TEXT,
    "reconfirmedStatus" TEXT,
    "reconfirmedAt" DATETIME,
    "submittedTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedTime" DATETIME NOT NULL,
    CONSTRAINT "ExpectedLocation_disasterId_fkey" FOREIGN KEY ("disasterId") REFERENCES "DisasterEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpectedLocation_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpectedLocation_shelterId_fkey" FOREIGN KEY ("shelterId") REFERENCES "Shelter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shelter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "capacity" INTEGER NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmergencyFacility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "disasterId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNREAD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_disasterId_fkey" FOREIGN KEY ("disasterId") REFERENCES "DisasterEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disasterId" TEXT NOT NULL,
    "householdMemberId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmergencyStatus_disasterId_fkey" FOREIGN KEY ("disasterId") REFERENCES "DisasterEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmergencyStatus_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disasterId" TEXT NOT NULL,
    "householdMemberId" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "address" TEXT,
    "description" TEXT,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "rescueStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmergencyRequest_disasterId_fkey" FOREIGN KEY ("disasterId") REFERENCES "DisasterEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmergencyRequest_householdMemberId_fkey" FOREIGN KEY ("householdMemberId") REFERENCES "HouseholdMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emergencyRequestId" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    CONSTRAINT "EmergencyCondition_emergencyRequestId_fkey" FOREIGN KEY ("emergencyRequestId") REFERENCES "EmergencyRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RescueAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emergencyRequestId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'TEAM_ASSIGNED',
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescueAssignment_emergencyRequestId_fkey" FOREIGN KEY ("emergencyRequestId") REFERENCES "EmergencyRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescueAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriorityConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conditionType" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Road" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "coordinatesJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_testIdentityNumber_key" ON "User"("testIdentityNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobileNumber_key" ON "User"("mobileNumber");

-- CreateIndex
CREATE INDEX "Household_userId_idx" ON "Household"("userId");

-- CreateIndex
CREATE INDEX "HouseholdMember_householdId_idx" ON "HouseholdMember"("householdId");

-- CreateIndex
CREATE INDEX "AffectedZone_disasterId_idx" ON "AffectedZone"("disasterId");

-- CreateIndex
CREATE INDEX "ExpectedLocation_disasterId_idx" ON "ExpectedLocation"("disasterId");

-- CreateIndex
CREATE INDEX "ExpectedLocation_shelterId_idx" ON "ExpectedLocation"("shelterId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpectedLocation_disasterId_householdMemberId_key" ON "ExpectedLocation"("disasterId", "householdMemberId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "EmergencyStatus_disasterId_idx" ON "EmergencyStatus"("disasterId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyStatus_disasterId_householdMemberId_key" ON "EmergencyStatus"("disasterId", "householdMemberId");

-- CreateIndex
CREATE INDEX "EmergencyRequest_disasterId_idx" ON "EmergencyRequest"("disasterId");

-- CreateIndex
CREATE INDEX "EmergencyRequest_householdMemberId_idx" ON "EmergencyRequest"("householdMemberId");

-- CreateIndex
CREATE INDEX "EmergencyCondition_emergencyRequestId_idx" ON "EmergencyCondition"("emergencyRequestId");

-- CreateIndex
CREATE INDEX "RescueAssignment_emergencyRequestId_idx" ON "RescueAssignment"("emergencyRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityConfiguration_conditionType_key" ON "PriorityConfiguration"("conditionType");
