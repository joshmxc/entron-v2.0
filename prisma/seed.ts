import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPhone = process.env.SEED_ADMIN_PHONE;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPhone || !adminPassword || adminPassword.length < 6) {
    throw new Error("Set SEED_ADMIN_PHONE and a SEED_ADMIN_PASSWORD of at least 6 characters before seeding");
  }
  const adminName = process.env.SEED_ADMIN_NAME || "Admin";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      name: adminName,
      phone: adminPhone,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Seeded admin account for", admin.phone);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
