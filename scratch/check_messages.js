const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.scheduledMessage.findMany({
    where: { status: 'PENDING' },
    orderBy: { sendAt: 'asc' },
    take: 5
  });
  console.log('Now (ISO):', new Date().toISOString());
  console.log('Pending Messages:');
  console.log(JSON.stringify(pending, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
