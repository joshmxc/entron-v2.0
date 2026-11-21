import app from "./app";
import { config } from "./config";
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$connect();
  console.log("✓ Database connected");

  const port = parseInt(process.env.PORT ?? String(config.port), 10);
  const server = app.listen(port, () => {
    console.log(`✓ Server running on http://localhost:${port}`);
  });

  const shutdown = async () => {
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
