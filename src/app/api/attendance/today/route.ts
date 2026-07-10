import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/attendance/today
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const records = await db.attendanceRecord.findMany({
      where: {
        timestamp: { gte: today, lt: tomorrow },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            department: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    const data = records.map((r) => ({
      id: r.id,
      userId: r.userId,
      employeeId: r.user?.employeeId,
      userName: r.user?.name,
      department: r.user?.department,
      timestamp: r.timestamp.toISOString(),
      status: r.status === 0 ? "CheckIn" : "CheckOut",
      verificationType:
        r.verificationType === 0
          ? "Fingerprint"
          : r.verificationType === 1
          ? "FaceRecognition"
          : r.verificationType === 2
          ? "Card"
          : "Password",
      verificationScore: r.verificationScore,
      deviceSerialNumber: r.deviceSerialNumber,
      hasImage: false,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Today attendance error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}