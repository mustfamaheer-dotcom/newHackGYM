const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.attendanceRecord.findMany({
    take: 10,
    orderBy: { timestamp: 'desc' },
    select: { id: true, userId: true, timestamp: true, status: true, deviceSerialNumber: true }
  });
  console.log(JSON.stringify(records, null, 2));
}

main().finally(() => prisma.$disconnect());