import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
        photo?: string;
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
    const userIdsToEnsure = new Set<number>();

    const validRecords = records.filter((r) => {
      const userId = Number(r.userId);
      if (!Number.isFinite(userId)) { skipped++; return false; }
      userIdsToEnsure.add(userId);
      return true;
    });

    // Bulk ensure all employees exist
    if (userIdsToEnsure.size > 0) {
      const ids = Array.from(userIdsToEnsure);
      const existing = await db.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((e) => e.id));
      const missing = ids.filter((id) => !existingIds.has(id));

      if (missing.length > 0) {
        await db.employee.createMany({
          data: missing.map((id) => ({
            id,
            name: `Employee #${id}`,
            employeeId: `UID-${String(id).padStart(3, "0")}`,
            status: 1,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Batch dedup check: get all existing records for these users/timestamps
    const timestamps = validRecords.map((r) => new Date(r.timestamp));
    const uniqueUserIds = [...new Set(validRecords.map((r) => Number(r.userId)))];
    const serial = deviceSerialNumber || validRecords[0]?.deviceSerialNumber;

    const existingRecords = await db.attendanceRecord.findMany({
      where: {
        userId: { in: uniqueUserIds },
        timestamp: { in: timestamps },
        deviceSerialNumber: serial || undefined,
      },
      select: { userId: true, timestamp: true },
    });
    const existingSet = new Set(
      existingRecords.map((r) => `${r.userId}-${r.timestamp.getTime()}`)
    );

    // Create new records in batch
    const newRecords: Array<{
      userId: number;
      timestamp: Date;
      status: number;
      deviceSerialNumber: string | undefined;
      verificationType: number;
      verificationScore: number;
      photo: string | null;
      isSynced: boolean;
      syncedDate: Date;
    }> = [];

    for (const r of validRecords) {
      const userId = Number(r.userId);
      const timestamp = new Date(r.timestamp);
      const key = `${userId}-${timestamp.getTime()}`;

      if (existingSet.has(key)) {
        skipped++;
        continue;
      }

      newRecords.push({
        userId,
        timestamp,
        status: r.status ?? 0,
        deviceSerialNumber: serial,
        verificationType: r.verificationType ?? 1,
        verificationScore: r.verificationScore ?? 0,
        photo: r.photo ?? null,
        isSynced: true,
        syncedDate: new Date(),
      });
      existingSet.add(key);
    }

    let created: Array<{ id: number; userId: number; timestamp: Date }> = [];

    if (newRecords.length > 0) {
      created = await db.attendanceRecord.createManyAndReturn({
        data: newRecords,
        select: { id: true, userId: true, timestamp: true },
      });
      inserted = created.length;
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
      data: { inserted, skipped, total: inserted + skipped, deviceSerialNumber, records: created || [] },
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
