import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/devices
export async function GET() {
  try {
    const devices = await db.device.findMany({ orderBy: { id: "asc" } });
    const data = devices.map((d) => ({
      id: d.id,
      serialNumber: d.serialNumber,
      model: d.model,
      firmwareVersion: d.firmwareVersion,
      ipAddress: d.ipAddress,
      port: d.port,
      location: d.location,
      status: d.status === 1 ? "Online" : d.status === 2 ? "Offline" : d.status === 3 ? "Error" : "Maintenance",
      lastSyncedDate: d.lastSyncedDate.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Devices fetch error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/devices — register device
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serialNumber, model, ipAddress, port, location } = body;

    if (!serialNumber || !ipAddress) {
      return NextResponse.json(
        { success: false, message: "Serial number and IP address are required" },
        { status: 400 }
      );
    }

    const existing = await db.device.findUnique({ where: { serialNumber } });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "Device with this serial number already exists" },
        { status: 409 }
      );
    }

    const device = await db.device.create({
      data: {
        serialNumber,
        model: model || "MB2000",
        firmwareVersion: "1.0",
        ipAddress,
        port: port || 4370,
        location: location || null,
        status: 2, // Offline until proven otherwise
      },
    });

    return NextResponse.json({
      success: true,
      message: "Device registered",
      data: { id: device.id },
    });
  } catch (error) {
    console.error("Device creation error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/devices?id=1
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") || "0");
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Device ID is required" },
        { status: 400 }
      );
    }

    await db.device.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Device removed" });
  } catch (error) {
    console.error("Device delete error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}