import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  // Do NOT throw on a missing DATABASE_URL here: this module is imported while
  // Next.js collects page data during `next build`, so throwing would break the
  // production build on Vercel. The pg adapter connects lazily on first query, so
  // a missing/invalid URL surfaces as a clear connection error at runtime instead.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
