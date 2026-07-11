import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/attendance/checkin — record a single attendance event (for demo / manual)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, status, verificationType, verificationScore, deviceSerialNumber } = body as {
      userId: number | string;
      status?: string;
      verificationType?: number;
      verificationScore?: number;
      deviceSerialNumber?: string;
    };

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "UserId is required" },
        { status: 400 }
      );
    }

    const userIdNum = Number(userId);
    if (!Number.isFinite(userIdNum)) {
      return NextResponse.json(
        { success: false, message: "Invalid userId" },
        { status: 400 }
      );
    }

    const user = await db.employee.findUnique({ where: { id: userIdNum } });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 400 }
      );
    }

    const checkInStatus = status?.toLowerCase() === "checkout" ? 1 : 0;
    const now = new Date();

    const record = await db.attendanceRecord.create({
      data: {
        userId: userIdNum,
        timestamp: now,
        status: checkInStatus,
        deviceSerialNumber: deviceSerialNumber || "MANUAL",
        verificationType: verificationType ?? 1,
        verificationScore: verificationScore ?? 0,
        isSynced: true,
        syncedDate: now,
      },
    });

    // Update daily summary
    const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextDay = new Date(dateOnly);
    nextDay.setDate(nextDay.getDate() + 1);

    const allDayRecords = await db.attendanceRecord.findMany({
      where: { userId: userIdNum, timestamp: { gte: dateOnly, lt: nextDay } },
      orderBy: { timestamp: "asc" },
    });

    const checkInRec = allDayRecords.find((r) => r.status === 0);
    const checkOutRec = [...allDayRecords].reverse().find((r) => r.status === 1);

    const lateThreshold = new Date(dateOnly);
    lateThreshold.setHours(9, 15, 0, 0);
    const earlyLeaveThreshold = new Date(dateOnly);
    earlyLeaveThreshold.setHours(17, 0, 0, 0);

    let attStatus = 1;
    if (checkInRec && checkInRec.timestamp > lateThreshold) attStatus = 3;
    if (checkOutRec && checkOutRec.timestamp < earlyLeaveThreshold && checkInRec) attStatus = 4;

    let workMin: number | null = null;
    if (checkInRec && checkOutRec) {
      workMin = Math.round((checkOutRec.timestamp.getTime() - checkInRec.timestamp.getTime()) / 60000);
    }

    await db.attendanceSummary.upsert({
      where: { userId_date: { userId, date: dateOnly } },
      create: {
        userId,
        date: dateOnly,
        checkInTime: checkInRec?.timestamp,
        checkOutTime: checkOutRec?.timestamp,
        workDurationMinutes: workMin,
        attendanceStatus: attStatus,
      },
      update: {
        checkInTime: checkInRec?.timestamp,
        checkOutTime: checkOutRec?.timestamp,
        workDurationMinutes: workMin,
        attendanceStatus: attStatus,
        updatedAt: now,
      },
    });

    // Push to WebSocket for real-time dashboard update
    try {
      await fetch("http://localhost:3004/push-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "attendance",
          record: {
            id: record.id,
            userId: record.userId,
            employeeId: user.employeeId,
            userName: user.name,
            department: user.department,
            timestamp: record.timestamp.toISOString(),
            status: checkInStatus === 0 ? "CheckIn" : "CheckOut",
            verificationType: record.verificationType === 1 ? "FaceRecognition" : "Fingerprint",
            verificationScore: record.verificationScore,
            deviceSerialNumber: record.deviceSerialNumber,
          },
        }),
      });
    } catch {
      // WS push is best-effort
    }

    return NextResponse.json({
      success: true,
      message: "Attendance recorded successfully",
      data: {
        id: record.id,
        userId: record.userId,
        timestamp: record.timestamp.toISOString(),
        status: checkInStatus === 0 ? "CheckIn" : "CheckOut",
      },
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}