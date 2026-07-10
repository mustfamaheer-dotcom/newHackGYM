import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/attendance/dashboard-stats
export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [activeUsers, todayRecords, todaySummaries, onlineDevices] = await Promise.all([
      db.employee.count({ where: { status: 1 } }),
      db.attendanceRecord.findMany({
        where: { timestamp: { gte: today, lt: tomorrow } },
        select: { userId: true, status: true },
      }),
      db.attendanceSummary.findMany({
        where: { date: today },
        select: { attendanceStatus: true },
      }),
      db.device.count({ where: { status: 1 } }),
    ]);

    const checkedInUserIds = new Set(
      todayRecords.filter((r) => r.status === 0).map((r) => r.userId)
    );

    return NextResponse.json({
      success: true,
      data: {
        totalActiveUsers: activeUsers,
        checkedInToday: checkedInUserIds.size,
        absentToday: activeUsers - checkedInUserIds.size,
        lateToday: todaySummaries.filter((s) => s.attendanceStatus === 3).length,
        onLeaveToday: todaySummaries.filter((s) => s.attendanceStatus === 6).length,
        totalRecordsToday: todayRecords.length,
        devicesOnline: onlineDevices,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}