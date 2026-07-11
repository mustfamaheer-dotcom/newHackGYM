import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { users } = body as {
      users: Array<{
        userId: number;
        name: string;
        employeeId?: string;
        department?: string;
        position?: string;
        phoneNumber?: string;
      }>;
    };

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, message: "No users provided" },
        { status: 400 }
      );
    }

    const validUsers = users
      .filter((u) => {
        const userId = Number(u.userId);
        return Number.isFinite(userId) && (u.name || "").trim();
      })
      .map((u) => ({
        id: Number(u.userId),
        name: (u.name || "").trim(),
        employeeId: u.employeeId || `UID-${String(Number(u.userId)).padStart(3, "0")}`,
        department: u.department || null,
        position: u.position || null,
        phoneNumber: u.phoneNumber || null,
        status: 1,
      }));

    if (validUsers.length === 0) {
      return NextResponse.json(
        { success: false, message: "No valid users provided" },
        { status: 400 }
      );
    }

    // Batch upsert: createMany with skipDuplicates, then update existing ones
    const BATCH_SIZE = 200;
    let created = 0;
    let updated = 0;

    for (let i = 0; i < validUsers.length; i += BATCH_SIZE) {
      const batch = validUsers.slice(i, i + BATCH_SIZE);

      // Get existing user IDs in this batch
      const ids = batch.map((u) => u.id);
      const existing = await db.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((e) => e.id));

      const toCreate = batch.filter((u) => !existingIds.has(u.id));
      const toUpdate = batch.filter((u) => existingIds.has(u.id));

      // Bulk create new users
      if (toCreate.length > 0) {
        await db.employee.createMany({
          data: toCreate.map((u) => ({
            id: u.id,
            name: u.name,
            employeeId: u.employeeId,
            department: u.department,
            position: u.position,
            phoneNumber: u.phoneNumber,
            status: u.status,
          })),
          skipDuplicates: true,
        });
        created += toCreate.length;
      }

      // Bulk update existing users
      for (const u of toUpdate) {
        await db.employee.update({
          where: { id: u.id },
          data: {
            name: u.name,
            employeeId: u.employeeId,
            department: u.department,
            position: u.position,
            phoneNumber: u.phoneNumber,
          },
        });
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced users: ${created} created, ${updated} updated`,
      data: { created, updated, total: validUsers.length },
    });
  } catch (error) {
    console.error("Sync users failed:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
