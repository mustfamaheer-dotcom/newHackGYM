import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

async function pushToWs(event: Record<string, unknown>): Promise<void> {
  try {
    await fetch("http://localhost:3004/push-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // best-effort
  }
}

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
        select: { id: true, employeeId: true, name: true, department: true },
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

    // Push to WebSocket BEFORE returning response
    const wsPushPromises: Promise<void>[] = [];

    if (created.length > 0) {
      const userIds = [...new Set(created.map((r) => r.userId))];
      const users = await db.employee.findMany({
        where: { id: { in: userIds } },
        select: { id: true, employeeId: true, name: true, department: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      // Map created records back to their original input values to get status/type
      // The `created` array only contains {id, userId, timestamp}. We need the original input from `newRecords`.
      const createdRecordDetails = created.map(createdRec => {
        // Find the original record from newRecords that matches this created record's unique properties
        const originalInput = newRecords.find(inputRec => 
          inputRec.userId === createdRec.userId && 
          inputRec.timestamp.getTime() === createdRec.timestamp.getTime() // Check exact ms timestamp
        );
        // Merge: DB ID + original input details (status, verificationType, etc.)
        return { ...originalInput, ...createdRec }; 
      });

      for (const recWithDetails of createdRecordDetails) {
        const user = userMap.get(recWithDetails.userId);
        wsPushPromises.push(pushToWs({ // Collect the promise
          type: "attendance",
          record: {
            id: recWithDetails.id, // Use DB generated ID
            userId: recWithDetails.userId,
            employeeId: user?.employeeId,
            userName: user?.name,
            department: user?.department,
            timestamp: recWithDetails.timestamp.toISOString(), // Use timestamp from DB object (already ISO string)
            status: recWithDetails.status ?? 0, // Use status from original input
            verificationType: recWithDetails.verificationType ?? 1, // Use type from original input
            verificationScore: recWithDetails.verificationScore ?? 0,
            deviceSerialNumber: serial,
          },
        }));
      }

      wsPushPromises.push(pushToWs({ // Collect the promise for sync event
        type: "sync",
        info: { deviceSerial: serial, inserted },
      }));
    }
    
    // Wait for all push operations to complete
    await Promise.allSettled(wsPushPromises);

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
