import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// POST /api/attendance/sync — called by the Python ZKTeco device bridge
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceSerialNumber, records } = body as {
      deviceSerialNumber?: string;
      records: Array<{
        userId: number;
        timestamp: string;
        status: number;
        verificationType?: number;
        verificationScore?: number;
        deviceSerialNumber?: string;
      }>;
    };

    if (!records || records.length === 0) {
      return NextResponse.json(
        { success: false, message: "No records provided" },
        { status: 400 }
      );
    }

    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
      const userId = r.userId;
      const timestamp = new Date(r.timestamp);
      const serial = r.deviceSerialNumber || deviceSerialNumber;

      // Check user exists
      const user = await db.employee.findUnique({ where: { id: userId } });
      if (!user) {
        skipped++;
        continue;
      }

      // De-duplicate: check if this exact record already exists
      const existing = await db.attendanceRecord.findFirst({
        where: {
          userId,
          timestamp,
          deviceSerialNumber: serial,
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Create attendance record
      await db.attendanceRecord.create({
        data: {
          userId,
          timestamp,
          status: r.status ?? 0,
          deviceSerialNumber: serial,
          verificationType: r.verificationType ?? 1,
          verificationScore: r.verificationScore ?? 0,
          isSynced: true,
          syncedDate: new Date(),
        },
      });
      inserted++;

      // Update daily summary
      await updateDailySummary(userId, timestamp);
    }

    // Update device last sync time
    if (deviceSerialNumber) {
      await db.device.updateMany({
        where: { serialNumber: deviceSerialNumber },
        data: { lastSyncedDate: new Date(), status: 1 },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${inserted} new records (${skipped} duplicates skipped)`,
      data: { inserted, skipped, total: inserted + skipped, deviceSerialNumber },
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

async function updateDailySummary(userId: number, timestamp: Date) {
  const dateOnly = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
  const nextDay = new Date(dateOnly);
  nextDay.setDate(nextDay.getDate() + 1);

  const records = await db.attendanceRecord.findMany({
    where: {
      userId,
      timestamp: { gte: dateOnly, lt: nextDay },
    },
    orderBy: { timestamp: "asc" },
  });

  if (records.length === 0) return;

  const checkInRecord = records.find((r) => r.status === 0);
  const checkOutRecord = [...records].reverse().find((r) => r.status === 1);

  const checkInTime = checkInRecord?.timestamp;
  const checkOutTime = checkOutRecord?.timestamp;

  // Late threshold: 9:15 AM
  const lateThreshold = new Date(dateOnly);
  lateThreshold.setHours(9, 15, 0, 0);

  // Early leave threshold: 5:00 PM
  const earlyLeaveThreshold = new Date(dateOnly);
  earlyLeaveThreshold.setHours(17, 0, 0, 0);

  let attendanceStatus = 1; // Present
  if (checkInTime && checkInTime > lateThreshold) {
    attendanceStatus = 3; // Late
  }
  if (checkOutTime && checkOutTime < earlyLeaveThreshold && checkInTime) {
    attendanceStatus = 4; // EarlyLeave
  }

  let workDurationMinutes: number | null = null;
  if (checkInTime && checkOutTime) {
    workDurationMinutes = Math.round(
      (checkOutTime.getTime() - checkInTime.getTime()) / 60000
    );
  }

  // Upsert the daily summary
  await db.attendanceSummary.upsert({
    where: {
      userId_date: {
        userId,
        date: dateOnly,
      },
    },
    create: {
      userId,
      date: dateOnly,
      checkInTime,
      checkOutTime,
      workDurationMinutes,
      attendanceStatus,
    },
    update: {
      checkInTime,
      checkOutTime,
      workDurationMinutes,
      attendanceStatus,
      updatedAt: new Date(),
    },
  });
}