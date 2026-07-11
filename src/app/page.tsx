"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  LogIn,
  Clock,
  UserX,
  Fingerprint,
  ScanFace,
  Wifi,
  WifiOff,
  RefreshCw,
  Plus,
  Trash2,
  MonitorSmartphone,
  Activity,
  AlertCircle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ======== Types ========
interface AttendanceRecord {
  id: number;
  userId: number;
  employeeId?: string;
  userName?: string;
  department?: string;
  timestamp: string;
  status: string;
  verificationType: string;
  verificationScore: number;
  deviceSerialNumber?: string;
  hasImage?: boolean;
}

interface DashboardStats {
  totalActiveUsers: number;
  checkedInToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  totalRecordsToday: number;
  devicesOnline: number;
}

interface UserRow {
  userId: number;
  name: string;
  employeeId: string;
  email?: string;
  phoneNumber?: string;
  department?: string;
  position?: string;
  hasBiometric: boolean;
  status: string;
}

interface DeviceRow {
  id: number;
  serialNumber: string;
  model: string;
  firmwareVersion: string;
  ipAddress: string;
  port: number;
  location?: string;
  status: string;
  lastSyncedDate: string;
}

interface ReportRow {
  userId: number;
  employeeId: string;
  name: string;
  department?: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  halfDays: number;
  onLeaveDays: number;
  totalWorkHours: number;
}

// ======== Main Page ========
export default function AttendanceDashboard() {
  // State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState("live");
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", employeeId: "", email: "", department: "", position: "" });
  const [newDevice, setNewDevice] = useState({ serialNumber: "", model: "MB2000", ipAddress: "", port: 4370, location: "" });

  const socketRef = useRef<Socket | null>(null);
  const recordsEndRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<UserRow[]>([]);

  // ======== Data Fetchers ========
  const fetchDashboardStats = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/dashboard-stats");
      if (!res.ok) { console.error("Stats fetch HTTP error:", res.status); return; }
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch (e) {
      console.error("Stats fetch error:", e);
    }
  }, []);

  const timestampsMatch = (ts1: string, ts2: string, windowMs = 5000) => {
    const t1 = new Date(ts1).getTime();
    const t2 = new Date(ts2).getTime();
    return Math.abs(t1 - t2) <= windowMs;
  };

   const fetchTodayRecords = useCallback(async () => {
     try {
       const res = await fetch("/api/attendance/today");
       if (!res.ok) { console.error("Records fetch HTTP error:", res.status); return; }
       const json = await res.json();
       if (json.success) {
         const dbRecords: AttendanceRecord[] = json.data;

         // --- BUG A FIX: Merge DB records with current WS records ---
         // Keep WS records that are within 2 minutes or also present in DB
         const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
         const mergedRecords = [
           ...dbRecords, // Start with DB records
           ...records.filter(wsRecord => { // Add WS records that are not in DB OR are recent
             const isWsRecordWithinExpiry = new Date(wsRecord.timestamp) >= twoMinutesAgo;
             const isWsRecordInDb = dbRecords.some(dbRec => 
               dbRec.userId === wsRecord.userId && 
               timestampsMatch(dbRec.timestamp, wsRecord.timestamp)
             );
             return isWsRecordWithinExpiry && !isWsRecordInDb;
           })
         ].slice(0, 100); // Limit to avoid excessively large state

         // Remove duplicates from the merged list (prioritize WS record if timestamps match exactly)
         const finalRecordsMap = new Map<string, AttendanceRecord>();
         mergedRecords.forEach(rec => {
           // Use a more precise key to avoid overwriting slightly different timestamps if they are within match window
           const key = `${rec.userId}-${rec.timestamp}`; 
           if (!finalRecordsMap.has(key)) {
             finalRecordsMap.set(key, rec);
           } else {
             // If duplicate key, prefer WS record if it has more enriched data (like name/dept)
             // or if it's the latest timestamp within the window.
             // For now, simple overwrite by last seen:
             finalRecordsMap.set(key, rec);
           }
         });
         setRecords(Array.from(finalRecordsMap.values()));
         // --- END BUG A FIX ---
       }
     } catch (e) {
       console.error("Records fetch error:", e);
     }
   }, [records]); // Include 'records' in dependency array for the merge logic



  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) { console.error("Users fetch HTTP error:", res.status); return; }
      const json = await res.json();
      if (json.success) setUsers(json.data);
    } catch (e) {
      console.error("Users fetch error:", e);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      if (!res.ok) { console.error("Devices fetch HTTP error:", res.status); return; }
      const json = await res.json();
      if (json.success) setDevices(json.data);
    } catch (e) {
      console.error("Devices fetch error:", e);
    }
  }, []);

  const fetchReport = useCallback(async (year: number, month: number) => {
    try {
      const res = await fetch(`/api/attendance/report/monthly?year=${year}&month=${month}`);
      if (!res.ok) { console.error("Report fetch HTTP error:", res.status); return; }
      const json = await res.json();
      if (json.success) setReport(json.data);
    } catch (e) {
      console.error("Report fetch error:", e);
    }
  }, []);

  // ======== Clock ========
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep usersRef in sync for WS handler (avoids stale closure)
  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // ======== WebSocket ========
  useEffect(() => {
    const socketInstance = io("http://localhost:3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
    });
    socketRef.current = socketInstance;

    socketInstance.on("connect", () => {
      setConnected(true);
    });

    socketInstance.on("disconnect", () => {
      setConnected(false);
    });

    socketInstance.on("clientCountChanged", (count: number) => {
      setClientCount(count);
    });

    socketInstance.on("attendanceRecorded", (raw: Record<string, unknown>) => {
      const statusNum = raw.status as number | string;
      const statusStr = statusNum === 0 || statusNum === "CheckIn" ? "CheckIn" : "CheckOut";

      const vtNum = raw.verificationType as number | string;
      let vtStr = "FaceRecognition";
      if (vtNum === 0 || vtNum === "Fingerprint") vtStr = "Fingerprint";
      else if (vtNum === 2 || vtNum === "Card") vtStr = "Card";
      else if (vtNum === 3 || vtNum === "Password") vtStr = "Password";

      const uid = Number(raw.userId);
      const matched = usersRef.current.find((u) => u.userId === uid);

      const record: AttendanceRecord = {
        id: Number(raw.id) || Date.now(),
        userId: uid,
        employeeId: (raw.employeeId as string) || matched?.employeeId || String(uid),
        userName: (raw.userName as string) || matched?.name || "-",
        department: (raw.department as string) || matched?.department || undefined,
        timestamp: (raw.timestamp as string) || new Date().toISOString(),
        status: statusStr,
        verificationType: vtStr,
        verificationScore: Number(raw.verificationScore) || 0,
        deviceSerialNumber: (raw.deviceSerialNumber as string) || undefined,
        hasImage: false,
      };

      setRecords((prev) => {
        const isDuplicate = prev.some((r) => 
          r.userId === record.userId && timestampsMatch(r.timestamp, record.timestamp)
        );
        if (isDuplicate) {
          return prev.map((r) => 
            r.userId === record.userId && timestampsMatch(r.timestamp, record.timestamp) ? record : r
          );
        }
        return [record, ...prev].slice(0, 100);
      });
      toast.success(`${statusStr === "CheckIn" ? "Check-In" : "Check-Out"}: ${record.userName || record.employeeId}`, {
        description: `${new Date(record.timestamp).toLocaleTimeString()} via ${record.verificationType} (${record.verificationScore}%)`,
        duration: 4000,
      });
      fetchDashboardStats();
      fetchTodayRecords();
    });

    socketInstance.on("recordsSynced", (info: { deviceSerial: string; inserted: number }) => {
      toast.success(`Synced ${info.inserted} records from ${info.deviceSerial}`);
      fetchDashboardStats();
      fetchTodayRecords();
    });

    socketInstance.on("deviceStatusChanged", () => {
      fetchDevices();
    });

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
    };
  }, [fetchDashboardStats, fetchTodayRecords, fetchDevices]);

  // ======== Initial Load ========
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchDashboardStats(),
        fetchTodayRecords(),
        fetchUsers(),
        fetchDevices(),
        fetchReport(new Date().getFullYear(), new Date().getMonth() + 1),
      ]);
      setLoading(false);
    };
    loadAll();
  }, [fetchDashboardStats, fetchTodayRecords, fetchUsers, fetchDevices, fetchReport]);

  // ======== Auto-refresh every 8s ========
  useEffect(() => {
    const poll = setInterval(() => {
      fetchTodayRecords();
      fetchDashboardStats();
    }, 8000);
    return () => clearInterval(poll);
  }, [fetchTodayRecords, fetchDashboardStats]);

  // ======== Simulate Check-in ========
  const simulateCheckin = () => {
    if (!socketRef.current) return;
    const demoUsers = [
      { userId: 1, employeeId: "EMP-001", userName: "Ahmed Hassan", department: "Engineering" },
      { userId: 2, employeeId: "EMP-002", userName: "Sara Mohamed", department: "HR" },
      { userId: 3, employeeId: "EMP-003", userName: "Omar Ali", department: "Engineering" },
      { userId: 9, employeeId: "EMP-009", userName: "Khaled Mostafa", department: "Engineering" },
      { userId: 10, employeeId: "EMP-010", userName: "Mariam Adel", department: "Sales" },
    ];
    const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
    const isCheckOut = Math.random() > 0.5;
    socketRef.current.emit("simulateCheckin", {
      ...user,
      verificationType: Math.random() > 0.3 ? "FaceRecognition" : "Fingerprint",
      status: isCheckOut ? "CheckOut" : "CheckIn",
    });
  };

  // ======== Real API Check-in ========
  const doRealCheckin = async (userId: number, status: string) => {
    try {
      const res = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Attendance recorded successfully");
        fetchDashboardStats();
        fetchTodayRecords();
      }
    } catch {
      toast.error("Failed to record attendance");
    }
  };

  // ======== Create User ========
  const createUser = async () => {
    if (!newUser.name || !newUser.employeeId) {
      toast.error("Name and Employee ID are required");
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("User created successfully");
        setUserDialogOpen(false);
        setNewUser({ name: "", employeeId: "", email: "", department: "", position: "" });
        fetchUsers();
        fetchDashboardStats();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error("Failed to create user");
    }
  };

  // ======== Create Device ========
  const createDevice = async () => {
    if (!newDevice.serialNumber || !newDevice.ipAddress) {
      toast.error("Serial number and IP address are required");
      return;
    }
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDevice),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Device registered successfully");
        setDeviceDialogOpen(false);
        setNewDevice({ serialNumber: "", model: "MB2000", ipAddress: "", port: 4370, location: "" });
        fetchDevices();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error("Failed to register device");
    }
  };

  // ======== Delete ========
  const deleteUser = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    try {
      await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      toast.success("User deleted");
      fetchUsers();
      fetchDashboardStats();
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const deleteDevice = async (id: number) => {
    if (!confirm("Remove this device?")) return;
    try {
      await fetch(`/api/devices?id=${id}`, { method: "DELETE" });
      toast.success("Device removed");
      fetchDevices();
    } catch {
      toast.error("Failed to remove device");
    }
  };

  // ======== Report params ========
  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const handleReportGen = () => {
    fetchReport(reportYear, reportMonth);
  };

  // Auto-scroll live feed
  useEffect(() => {
    recordsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [records]);

  // ======== Render Helpers ========
  const getVerificationIcon = (type: string) => {
    if (type === "FaceRecognition") return <ScanFace className="h-4 w-4 text-emerald-600" />;
    if (type === "Fingerprint") return <Fingerprint className="h-4 w-4 text-amber-600" />;
    return <Activity className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    if (status === "CheckIn")
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">Check In</Badge>;
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Check Out</Badge>;
  };

  const getDeviceStatusBadge = (status: string) => {
    if (status === "Online") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><Wifi className="h-3 w-3 mr-1" />Online</Badge>;
    if (status === "Offline") return <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100"><WifiOff className="h-3 w-3 mr-1" />Offline</Badge>;
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><AlertCircle className="h-3 w-3 mr-1" />{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-80" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <ScanFace className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">ZKTeco Live Attendance</h1>
              <p className="text-xs text-slate-500">Real-time Face & Fingerprint Tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              <span className={`text-sm font-medium ${connected ? "text-emerald-600" : "text-red-600"}`}>
                {connected ? "Live" : "Reconnecting..."}
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <span className="text-sm text-slate-500 hidden sm:inline">
              Clients: {clientCount}
            </span>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <span className="text-sm text-slate-600 font-mono hidden md:inline">
              {currentTime.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={simulateCheckin}
              className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
            >
              <Zap className="h-4 w-4 mr-1" />
              Simulate
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalActiveUsers ?? 0}</p>
                <p className="text-xs text-slate-500">Active Employees</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-emerald-50 p-3 rounded-lg">
                <LogIn className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.checkedInToday ?? 0}</p>
                <p className="text-xs text-slate-500">Checked In Today</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-amber-50 p-3 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.lateToday ?? 0}</p>
                <p className="text-xs text-slate-500">Late Today</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="bg-red-50 p-3 rounded-lg">
                <UserX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats?.absentToday ?? 0}</p>
                <p className="text-xs text-slate-500">Absent Today</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Devices Online</span>
              </div>
              <span className="font-bold text-slate-900">{stats?.devicesOnline ?? 0}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">Total Records Today</span>
              </div>
              <span className="font-bold text-slate-900">{stats?.totalRecordsToday ?? 0}</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">On Leave</span>
              </div>
              <span className="font-bold text-slate-900">{stats?.onLeaveToday ?? 0}</span>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white border border-slate-200">
            <TabsTrigger value="live" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Live Feed
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Employees
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="devices" className="gap-1.5">
              <MonitorSmartphone className="h-3.5 w-3.5" />
              Devices
            </TabsTrigger>
          </TabsList>

          {/* ===== LIVE FEED TAB ===== */}
          <TabsContent value="live" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Today&apos;s Live Attendance
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => { fetchTodayRecords(); fetchDashboardStats(); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-[140px]">Time</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Department</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="hidden sm:table-cell">Verification</TableHead>
                        <TableHead className="hidden lg:table-cell">Device</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-slate-400 py-12">
                            No attendance records today
                          </TableCell>
                        </TableRow>
                      ) : (
                        records.map((r) => (
                          <TableRow key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            <TableCell className="font-mono text-sm">
                              {new Date(r.timestamp).toLocaleTimeString()}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{r.employeeId || "-"}</TableCell>
                            <TableCell className="font-medium text-sm">{r.userName || "-"}</TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-slate-600">{r.department || "-"}</TableCell>
                            <TableCell>{getStatusBadge(r.status)}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex items-center gap-1.5">
                                {getVerificationIcon(r.verificationType)}
                                <span className="text-sm text-slate-600">{r.verificationScore}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm text-slate-500">{r.deviceSerialNumber || "-"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => doRealCheckin(r.userId, r.status === "CheckIn" ? "CheckOut" : "CheckIn")}
                                className="text-xs h-7"
                              >
                                {r.status === "CheckIn" ? "Check Out" : "Check In"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                <div ref={recordsEndRef} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== EMPLOYEES TAB ===== */}
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Employee Management</CardTitle>
                <Button size="sm" onClick={() => setUserDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Employee
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead className="hidden md:table-cell">Department</TableHead>
                        <TableHead className="hidden lg:table-cell">Position</TableHead>
                        <TableHead className="hidden sm:table-cell">Biometric</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.userId} className="hover:bg-slate-50/80">
                          <TableCell className="text-sm">{u.userId}</TableCell>
                          <TableCell className="font-medium text-sm">{u.name}</TableCell>
                          <TableCell className="font-mono text-sm">{u.employeeId}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-slate-600">{u.department || "-"}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-slate-600">{u.position || "-"}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {u.hasBiometric ? (
                              <Badge variant="outline" className="text-emerald-600 border-emerald-200">Yes</Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                u.status === "Active"
                                  ? "text-emerald-600 border-emerald-200"
                                  : "text-slate-500"
                              }
                            >
                              {u.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 text-emerald-600 hover:text-emerald-700"
                                onClick={() => doRealCheckin(u.userId, "CheckIn")}
                              >
                                <LogIn className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 text-red-500 hover:text-red-600"
                                onClick={() => deleteUser(u.userId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== REPORTS TAB ===== */}
          <TabsContent value="reports" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-lg">Monthly Attendance Report</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(parseInt(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2024, m - 1).toLocaleString("default", { month: "long" })}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={reportYear}
                    onChange={(e) => setReportYear(parseInt(e.target.value))}
                  >
                    {[2024, 2025, 2026].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={handleReportGen}>
                    Generate
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Emp ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Department</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Late</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="hidden sm:table-cell text-center">Early Leave</TableHead>
                        <TableHead className="hidden sm:table-cell text-center">Half Day</TableHead>
                        <TableHead className="hidden md:table-cell text-center">On Leave</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-slate-400 py-12">
                            Select month/year and click Generate.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.map((r) => (
                          <TableRow key={r.userId} className="hover:bg-slate-50/80">
                            <TableCell className="font-mono text-sm">{r.employeeId}</TableCell>
                            <TableCell className="font-medium text-sm">{r.name}</TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-slate-600">{r.department || "-"}</TableCell>
                            <TableCell className="text-center text-sm font-medium text-emerald-600">{r.presentDays}</TableCell>
                            <TableCell className="text-center text-sm font-medium text-amber-600">{r.lateDays}</TableCell>
                            <TableCell className="text-center text-sm font-medium text-red-600">{r.absentDays}</TableCell>
                            <TableCell className="hidden sm:table-cell text-center text-sm">{r.earlyLeaveDays}</TableCell>
                            <TableCell className="hidden sm:table-cell text-center text-sm">{r.halfDays}</TableCell>
                            <TableCell className="hidden md:table-cell text-center text-sm">{r.onLeaveDays}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{r.totalWorkHours.toFixed(1)}h</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== DEVICES TAB ===== */}
          <TabsContent value="devices" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Registered Devices</CardTitle>
                <Button size="sm" onClick={() => setDeviceDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Device
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {devices.map((d) => (
                      <TableRow key={d.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono text-sm font-medium">{d.serialNumber}</TableCell>
                        <TableCell className="text-sm">{d.model}</TableCell>
                        <TableCell className="font-mono text-sm text-slate-600">{d.ipAddress}:{d.port}</TableCell>
                        <TableCell className="text-sm text-slate-600">{d.location || "-"}</TableCell>
                        <TableCell>{getDeviceStatusBadge(d.status)}</TableCell>
                        <TableCell className="text-sm text-slate-500 hidden sm:table-cell">
                          {new Date(d.lastSyncedDate).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 text-red-500 hover:text-red-600"
                            onClick={() => deleteDevice(d.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>ZKTeco MB2000 Attendance System — Live Dashboard</span>
          <span>Powered by WebSocket + Next.js</span>
        </div>
      </footer>

      {/* Add User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userName">Name *</Label>
              <Input id="userName" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="userEmpId">Employee ID *</Label>
              <Input id="userEmpId" value={newUser.employeeId} onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })} placeholder="EMP-XXX" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="userDept">Department</Label>
                <Input id="userDept" value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} placeholder="Department" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="userPos">Position</Label>
                <Input id="userPos" value={newUser.position} onChange={(e) => setNewUser({ ...newUser, position: e.target.value })} placeholder="Job title" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="userEmail">Email</Label>
              <Input id="userEmail" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="email@company.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancel</Button>
            <Button onClick={createUser} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Device</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="devSerial">Serial Number *</Label>
              <Input id="devSerial" value={newDevice.serialNumber} onChange={(e) => setNewDevice({ ...newDevice, serialNumber: e.target.value })} placeholder="ZKT003" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="devModel">Model</Label>
                <Input id="devModel" value={newDevice.model} onChange={(e) => setNewDevice({ ...newDevice, model: e.target.value })} placeholder="MB2000" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="devPort">Port</Label>
                <Input id="devPort" type="number" value={newDevice.port} onChange={(e) => setNewDevice({ ...newDevice, port: parseInt(e.target.value) || 4370 })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="devIp">IP Address *</Label>
              <Input id="devIp" value={newDevice.ipAddress} onChange={(e) => setNewDevice({ ...newDevice, ipAddress: e.target.value })} placeholder="192.168.1.203" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="devLoc">Location</Label>
              <Input id="devLoc" value={newDevice.location} onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })} placeholder="Building A, Floor 2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialogOpen(false)}>Cancel</Button>
            <Button onClick={createDevice} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}