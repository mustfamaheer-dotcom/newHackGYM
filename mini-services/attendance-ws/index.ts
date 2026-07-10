import { Server } from "socket.io";

const PORT = 3003;
const io = new Server(PORT, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let connectedClients = 0;

io.on("connection", (socket) => {
  connectedClients++;
  console.log(`[WS] Client connected. Total: ${connectedClients}`);

  // Send current client count
  io.emit("clientCountChanged", connectedClients);

  // Allow subscribing to a specific device
  socket.on("subscribeToDevice", (deviceSerial: string) => {
    if (deviceSerial) {
      socket.join(`device-${deviceSerial}`);
      console.log(`[WS] Client ${socket.id} subscribed to device: ${deviceSerial}`);
    }
  });

  socket.on("unsubscribeFromDevice", (deviceSerial: string) => {
    if (deviceSerial) {
      socket.leave(`device-${deviceSerial}`);
    }
  });

  // Simulate a test check-in (for demo)
  socket.on("simulateCheckin", (data: {
    userId: number;
    employeeId: string;
    userName: string;
    department?: string;
    verificationType: string;
    status: string;
  }) => {
    const record = {
      id: Date.now(),
      userId: data.userId,
      employeeId: data.employeeId,
      userName: data.userName,
      department: data.department || "General",
      timestamp: new Date().toISOString(),
      status: data.status || "CheckIn",
      verificationType: data.verificationType || "FaceRecognition",
      verificationScore: Math.floor(Math.random() * 20) + 80,
      deviceSerialNumber: "ZKT001-DEMO",
    };

    io.emit("attendanceRecorded", record);
    console.log(`[WS] Simulated check-in: ${data.userName} (${data.employeeId})`);
  });

  socket.on("disconnect", () => {
    connectedClients = Math.max(0, connectedClients - 1);
    io.emit("clientCountChanged", connectedClients);
    console.log(`[WS] Client disconnected. Total: ${connectedClients}`);
  });
});

// Expose a simple HTTP endpoint for the Python bridge to POST events
import { createServer } from "http";

const httpServer = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/push-event") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const event = JSON.parse(body);
        // Broadcast to all connected dashboard clients
        if (event.type === "attendance") {
          io.emit("attendanceRecorded", event.record);
          console.log(`[WS] Device pushed attendance event: User ${event.record?.userId}`);
        } else if (event.type === "sync") {
          io.emit("recordsSynced", event.info);
          console.log(`[WS] Device pushed sync: ${event.info?.inserted} records`);
        } else if (event.type === "deviceStatus") {
          io.emit("deviceStatusChanged", event.info);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
      }
    });
  } else if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", clients: connectedClients, uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

httpServer.listen(PORT + 1, () => {
  console.log(`[HTTP] Event push endpoint on port ${PORT + 1}`);
});

console.log(`[WS] Attendance WebSocket service running on port ${PORT}`);