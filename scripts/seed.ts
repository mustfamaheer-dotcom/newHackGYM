import { db } from "@/lib/db";

async function seed() {
  console.log("Seeding database...");

  await db.device.upsert({
    where: { serialNumber: "ZKT001" },
    update: {},
    create: {
      serialNumber: "ZKT001",
      model: "MB2000",
      firmwareVersion: "Ver 6.60 Oct 18 2019",
      ipAddress: "192.168.1.201",
      port: 4370,
      status: 1,
      location: "Main Entrance",
    },
  });

  await db.device.upsert({
    where: { serialNumber: "ZKT002" },
    update: {},
    create: {
      serialNumber: "ZKT002",
      model: "SpeedFace-V5L",
      firmwareVersion: "Ver 7.20 Mar 10 2024",
      ipAddress: "192.168.1.202",
      port: 4370,
      status: 2,
      location: "Back Door",
    },
  });

  const employees = [
    { id: 1, name: "Ahmed Hassan", employeeId: "EMP-001", department: "Engineering", position: "Senior Developer" },
    { id: 2, name: "Sara Mohamed", employeeId: "EMP-002", department: "HR", position: "HR Manager" },
    { id: 3, name: "Omar Ali", employeeId: "EMP-003", department: "Engineering", position: "DevOps Engineer" },
    { id: 4, name: "Fatima Nour", employeeId: "EMP-004", department: "Finance", position: "Accountant" },
    { id: 5, name: "Youssef Ibrahim", employeeId: "EMP-005", department: "Marketing", position: "Marketing Lead" },
    { id: 6, name: "Layla Karim", employeeId: "EMP-006", department: "Engineering", position: "Frontend Developer" },
    { id: 7, name: "Hassan Tarek", employeeId: "EMP-007", department: "Operations", position: "Operations Manager" },
    { id: 8, name: "Nadia Samir", employeeId: "EMP-008", department: "Design", position: "UI/UX Designer" },
    { id: 9, name: "Khaled Mostafa", employeeId: "EMP-009", department: "Engineering", position: "Backend Developer" },
    { id: 10, name: "Mariam Adel", employeeId: "EMP-010", department: "Sales", position: "Sales Representative" },
  ];

  for (const emp of employees) {
    await db.employee.upsert({
      where: { id: emp.id },
      update: {},
      create: {
        id: emp.id,
        name: emp.name,
        employeeId: emp.employeeId,
        department: emp.department,
        position: emp.position,
        status: 1,
      },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const sampleRecords = [
    { userId: 1, hour: 8, minute: 45, status: 0, vType: 1, score: 95 },
    { userId: 2, hour: 8, minute: 30, status: 0, vType: 0, score: 88 },
    { userId: 3, hour: 9, minute: 20, status: 0, vType: 1, score: 92 },
    { userId: 4, hour: 8, minute: 55, status: 0, vType: 1, score: 97 },
    { userId: 5, hour: 9, minute: 25, status: 0, vType: 1, score: 85 },
    { userId: 6, hour: 8, minute: 10, status: 0, vType: 0, score: 91 },
    { userId: 7, hour: 7, minute: 50, status: 0, vType: 1, score: 94 },
    { userId: 1, hour: 17, minute: 5, status: 1, vType: 1, score: 96 },
    { userId: 2, hour: 17, minute: 0, status: 1, vType: 0, score: 87 },
    { userId: 6, hour: 17, minute: 15, status: 1, vType: 1, score: 90 },
    { userId: 7, hour: 16, minute: 30, status: 1, vType: 1, score: 93 },
    { userId: 8, hour: 9, minute: 5, status: 0, vType: 1, score: 98 },
  ];

  for (const rec of sampleRecords) {
    const ts = new Date(todayDate);
    ts.setHours(rec.hour, rec.minute, 0, 0);

    await db.attendanceRecord.create({
      data: {
        userId: rec.userId,
        timestamp: ts,
        status: rec.status,
        deviceSerialNumber: "ZKT001",
        verificationType: rec.vType,
        verificationScore: rec.score,
        isSynced: true,
        syncedDate: ts,
      },
    });
  }

  for (const userId of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const userRecords = sampleRecords.filter((r) => r.userId === userId);
    const checkIn = userRecords.find((r) => r.status === 0);
    const checkOut = userRecords.find((r) => r.status === 1);

    const checkInTime = checkIn ? (() => { const d = new Date(todayDate); d.setHours(checkIn.hour, checkIn.minute, 0, 0); return d; })() : null;
    const checkOutTime = checkOut ? (() => { const d = new Date(todayDate); d.setHours(checkOut.hour, checkOut.minute, 0, 0); return d; })() : null;

    const lateThreshold = new Date(todayDate);
    lateThreshold.setHours(9, 15, 0, 0);

    let attStatus = 1;
    if (checkInTime && checkInTime > lateThreshold) attStatus = 3;

    let workMin: number | null = null;
    if (checkInTime && checkOutTime) {
      workMin = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
    }

    await db.attendanceSummary.upsert({
      where: { userId_date: { userId, date: todayDate } },
      update: {
        checkInTime,
        checkOutTime,
        workDurationMinutes: workMin,
        attendanceStatus: attStatus,
      },
      create: {
        userId,
        date: todayDate,
        checkInTime,
        checkOutTime,
        workDurationMinutes: workMin,
        attendanceStatus: attStatus,
      },
    });
  }

  console.log("Database seeded successfully!");
  await db.$disconnect();
}

seed().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});