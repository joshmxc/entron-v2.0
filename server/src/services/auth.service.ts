import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { config } from "../config";

const REFRESH_DAYS = 7;

export async function login(phone: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ phone }, { username: phone }] },
  });
  if (!user || !user.isActive) throw { status: 401, message: "Invalid credentials" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw { status: 401, message: "Invalid credentials" };

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });
  const assignments = await prisma.staffEventAssignment.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  });

  const payload = { sub: user.id, role: user.role, name: user.name };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: user.id });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_DAYS);

  await prisma.refreshToken.create({
    data: { id: uuidv4(), userId: user.id, token: refreshToken, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      language: user.language,
      canScan: user.canScan,
      canManageGuests: user.canManageGuests,
      canDesignCards: user.canDesignCards,
      canSendMessages: user.canSendMessages,
      eventIds: assignments.map((assignment) => assignment.eventId),
    },
  };
}

export async function refresh(token: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw { status: 401, message: "Invalid refresh token" };
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) {
    throw { status: 401, message: "Refresh token expired" };
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw { status: 401, message: "User not found" };

  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
  const assignments = await prisma.staffEventAssignment.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  });
  return { accessToken, eventIds: assignments.map((assignment) => assignment.eventId) };
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function createUser(data: {
  name: string;
  username: string;
  phone: string;
  password: string;
  role: "ADMIN" | "STAFF";
  canScan?: boolean;
  canManageGuests?: boolean;
  canDesignCards?: boolean;
  canSendMessages?: boolean;
  eventIds?: string[];
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: data.phone }, { username: data.username }] },
  });
  if (existing) throw { status: 409, message: "Phone number or username already registered" };

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      username: data.username,
      phone: data.phone,
      passwordHash,
      role: data.role,
      canScan: data.role === "ADMIN" ? true : (data.canScan ?? true),
      canManageGuests: data.role === "ADMIN" ? true : (data.canManageGuests ?? false),
      canDesignCards: data.role === "ADMIN" ? true : (data.canDesignCards ?? false),
      canSendMessages: data.role === "ADMIN" ? true : (data.canSendMessages ?? false),
    },
    select: {
      id: true, name: true, username: true, phone: true, role: true, isActive: true,
      canScan: true, canManageGuests: true, canDesignCards: true, canSendMessages: true,
      lastSeenAt: true, createdAt: true,
    },
  });
  if (data.role === "STAFF" && data.eventIds?.length) {
    await prisma.staffEventAssignment.createMany({
      data: data.eventIds.map((eventId) => ({ userId: user.id, eventId })),
      skipDuplicates: true,
    });
  }
  const assignments = data.role === "STAFF"
    ? await prisma.staffEventAssignment.findMany({
        where: { userId: user.id },
        select: { eventId: true },
      })
    : [];
  return { ...user, eventIds: assignments.map((assignment) => assignment.eventId) };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, username: true, phone: true, role: true, isActive: true,
      canScan: true, canManageGuests: true, canDesignCards: true, canSendMessages: true,
      lastSeenAt: true, createdAt: true, language: true,
      eventAssignments: { select: { eventId: true } },
    },
  });
  return users.map(({ eventAssignments, ...user }) => ({
    ...user,
    eventIds: eventAssignments.map((assignment) => assignment.eventId),
  }));
}

export async function updateUser(id: string, data: Partial<{
  name: string;
  username: string;
  isActive: boolean;
  role: "ADMIN" | "STAFF";
  password: string;
  canScan: boolean;
  canManageGuests: boolean;
  canDesignCards: boolean;
  canSendMessages: boolean;
  eventIds?: string[];
}>) {
  const update: Record<string, unknown> = {};
  if (data.name) update.name = data.name;
  if (typeof data.isActive === "boolean") update.isActive = data.isActive;
  if (data.role) update.role = data.role;
  if (data.username) update.username = data.username;
  if (typeof data.canScan === "boolean") update.canScan = data.canScan;
  if (typeof data.canManageGuests === "boolean") update.canManageGuests = data.canManageGuests;
  if (typeof data.canDesignCards === "boolean") update.canDesignCards = data.canDesignCards;
  if (typeof data.canSendMessages === "boolean") update.canSendMessages = data.canSendMessages;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.update({
    where: { id },
    data: update,
    select: {
      id: true, name: true, username: true, phone: true, role: true, isActive: true,
      canScan: true, canManageGuests: true, canDesignCards: true, canSendMessages: true,
      lastSeenAt: true,
    },
  });
  if (data.eventIds) {
    await prisma.staffEventAssignment.deleteMany({ where: { userId: id } });
    if (data.eventIds.length) {
      await prisma.staffEventAssignment.createMany({
        data: data.eventIds.map((eventId) => ({ userId: id, eventId })),
        skipDuplicates: true,
      });
    }
  }
  const assignments = await prisma.staffEventAssignment.findMany({
    where: { userId: id },
    select: { eventId: true },
  });
  return { ...user, eventIds: assignments.map((assignment) => assignment.eventId) };
}

export async function deleteUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!user) throw { status: 404, message: "Staff member not found" };
  if (user.role === "ADMIN") throw { status: 400, message: "Admin accounts cannot be deleted" };

  await prisma.$transaction(async (tx) => {
    await tx.staffEventAssignment.deleteMany({ where: { userId: id } });
    await tx.refreshToken.deleteMany({ where: { userId: id } });
    await tx.scan.deleteMany({ where: { staffId: id } });
    await tx.outboundMessage.deleteMany({ where: { sentBy: id } });
    await tx.offlineSyncLog.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });
}
