import {PrismaClient} from "@prisma/client";

let prismaSingleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }

  return prismaSingleton;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = undefined;
  }
}
