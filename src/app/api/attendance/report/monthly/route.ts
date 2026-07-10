import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/attendance/report/monthly?year=2024&month=7&department=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
    const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());
    const department = searchParams.get("department");

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const employees = await db.employee.findMany({
      where: {
        status: 1,
        ...(department ? { department } : {}),
      },
      select: { id: true, employeeId: true, name: true, department: true },
    });

    const summaries = await db.attendanceSummary.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        userId: { in: employees.map((e) => e.id) },
      },
    });

    const data = employees.map((emp) => {
      const empSummaries = summaries.filter((s) => s.userId === emp.id);
      const presentDays = empSummaries.filter((s) => s.attendanceStatus === 1).length;
      const absentDays = empSummaries.filter((s) => s.attendanceStatus === 2).length;
      const lateDays = empSummaries.filter((s) => s.attendanceStatus === 3).length;
      const earlyLeaveDays = empSummaries.filter((s) => s.attendanceStatus === 4).length;
      const halfDays = empSummaries.filter((s) => s.attendanceStatus === 5).length;
      const onLeaveDays = empSummaries.filter((s) => s.attendanceStatus === 6).length;
      const totalWorkMinutes = empSummaries.reduce(
        (sum, s) => sum + (s.workDurationMinutes || 0),
        0
      );

      return {
        userId: emp.id,
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department,
        presentDays,
        absentDays,
        lateDays,
        earlyLeaveDays,
        halfDays,
        onLeaveDays,
        totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Monthly report error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}