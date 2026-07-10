import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/users
export async function GET() {
  try {
    const users = await db.employee.findMany({
      where: { status: { not: 4 } },
      orderBy: { id: "asc" },
    });

    const data = users.map((u) => ({
      userId: u.id,
      name: u.name,
      employeeId: u.employeeId,
      email: u.email,
      phoneNumber: u.phoneNumber,
      department: u.department,
      position: u.position,
      hasBiometric: !!u.biometricTemplate,
      status: u.status === 1 ? "Active" : u.status === 2 ? "Inactive" : u.status === 3 ? "Suspended" : "Deleted",
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Users fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/users — create user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, employeeId, email, phoneNumber, department, position } = body;

    if (!name || !employeeId) {
      return NextResponse.json(
        { success: false, message: "Name and EmployeeId are required" },
        { status: 400 }
      );
    }

    const existing = await db.employee.findUnique({ where: { employeeId } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "Employee ID already exists" },
        { status: 409 }
      );
    }

    const user = await db.employee.create({
      data: {
        name,
        employeeId,
        email: email || null,
        phoneNumber: phoneNumber || null,
        department: department || null,
        position: position || null,
        status: 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: "User created successfully",
      data: { userId: user.id },
    });
  } catch (error) {
    console.error("User creation error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/users?id=1
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") || "0");
    if (!id) {
      return NextResponse.json(
        { success: false, message: "User ID is required" },
        { status: 400 }
      );
    }

    await db.employee.update({
      where: { id },
      data: { status: 4 },
    });

    return NextResponse.json({ success: true, message: "User deleted (soft)" });
  } catch (error) {
    console.error("User delete error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}