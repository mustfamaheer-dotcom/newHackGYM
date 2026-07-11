# ZKTeco MB2000 Biometric Device Integration

## Complete Technical Specification & Implementation Guide

**Target Stack:** C# / .NET Framework / Entity Framework / SQL Server
**Device Model:** ZKTeco MB2000 (Face + Fingerprint)
**Protocol:** TCP/IP (zkemkeeper.dll / ZKLib SDK)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Device Communication](#2-device-communication)
3. [SDK Integration](#3-sdk-integration)
4. [Database Design](#4-database-design)
5. [Entity Framework Models](#5-entity-framework-models)
6. [Repository Layer](#6-repository-layer)
7. [Service Layer](#7-service-layer)
8. [Web API Layer](#8-web-api-layer)
9. [Background Synchronization](#9-background-synchronization)
10. [Real-Time Event Handling](#10-real-time-event-handling)
11. [Error Handling & Retry](#11-error-handling--retry)
12. [Logging & Monitoring](#12-logging--monitoring)
13. [Configuration](#13-configuration)
14. [Sequence Diagrams](#14-sequence-diagrams)
15. [Scalability Considerations](#15-scalability-considerations)
16. [Deployment Checklist](#16-deployment-checklist)

---

## 1. System Architecture

### 1.1 High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│   │ Web App  │  │Mobile App│  │ Desktop  │  │ 3rd Party│               │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
└────────┼──────────────┼──────────────┼──────────────┼────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY LAYER                                │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  ASP.NET Web API  (REST Endpoints + Authentication)         │       │
│   └────────────────────────────┬────────────────────────────────┘       │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────────┐
│                       SERVICE LAYER (Business Logic)                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│   │ Attendance   │  │   Device     │  │   Employee   │                 │
│   │  Service     │  │   Service    │  │   Service    │                 │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│          │                 │                  │                          │
│   ┌──────┴──────────────────┴──────────────────┴───────┐                │
│   │              Event Bus (MediatR / In-Memory)        │                │
│   └─────────────────────────┬──────────────────────────┘                │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────────┐
│                    DATA ACCESS LAYER                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│   │  Employee    │  │ Attendance   │  │   Device     │                 │
│   │ Repository   │  │ Repository   │  │ Repository   │                 │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│          │                 │                  │                          │
│   ┌──────┴──────────────────┴──────────────────┴───────┐                │
│   │         Entity Framework Core (DbContext)           │                │
│   └─────────────────────────┬──────────────────────────┘                │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────────────────────┐
│                       DATA STORE                                         │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │                    SQL Server Database                        │      │
│   │  ┌────────────┐ ┌────────────────┐ ┌───────────────────┐    │      │
│   │  │ Employees  │ │ AttendanceLogs │ │    Devices        │    │      │
│   │  └────────────┘ └────────────────┘ └───────────────────┘    │      │
│   └──────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                    DEVICE INTEGRATION LAYER                              │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │              DeviceBridgeService (Background)                 │      │
│   │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐     │      │
│   │  │ Connection │  │   Event    │  │    Attendance      │     │      │
│   │  │ Manager    │  │  Listener  │  │    Processor       │     │      │
│   │  └────────────┘  └────────────┘  └────────────────────┘     │      │
│   └──────────────────────────────────────────────────────────────┘      │
│                              │                                           │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │          zkemkeeper.dll / ZKLib SDK (COM Interop)            │      │
│   └──────────────────────────┬───────────────────────────────────┘      │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│                    ZKTeco MB2000 Device                                  │
│   ┌──────────────────────────────────────────────────────────────┐      │
│   │  IP: 192.168.1.201  |  Port: 4370  |  Protocol: TCP/IP      │      │
│   └──────────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Web API** | Exposes REST endpoints, handles HTTP requests, authentication |
| **Attendance Service** | Business logic for check-in/check-out, summary calculation |
| **Device Service** | Device registration, status monitoring, configuration |
| **Employee Service** | Employee CRUD, user sync from device |
| **DeviceBridgeService** | Persistent connection to device, real-time event capture |
| **Event Bus** | Decoupled communication between components |
| **Repositories** | Data access abstraction over Entity Framework |
| **Background Service** | Periodic sync, health checks, cleanup tasks |

---

## 2. Device Communication

### 2.1 Connection Protocol

The ZKTeco MB2000 communicates over TCP/IP using a proprietary protocol. The SDK (zkemkeeper.dll) handles the low-level protocol details.

```
Application  <-->  zkemkeeper.dll  <-->  TCP/IP Socket  <-->  Device (192.168.1.201:4370)
```

### 2.2 Connection Parameters

| Parameter | Default Value | Description |
|-----------|--------------|-------------|
| IP Address | 192.168.1.201 | Device IP on local network |
| Port | 4370 | TCP port (standard ZKTeco) |
| Password | 0 | Device admin password (0 = no password) |
| Timeout | 15 seconds | Connection timeout |
| Force UDP | false | Use UDP instead of TCP |
| Omit Ping | false | Skip ICMP ping before connect |

### 2.3 Communication Flow

```
┌─────────────┐                              ┌─────────────┐
│  Application │                              │    Device    │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  1. TCP Connect (IP:Port)                  │
       │───────────────────────────────────────────>│
       │                                            │
       │  2. Authenticate (Password)                │
       │───────────────────────────────────────────>│
       │                                            │
       │  3. Enable Device (Disable during read)    │
       │───────────────────────────────────────────>│
       │                                            │
       │  4. Read Users / Attendance / Templates    │
       │───────────────────────────────────────────>│
       │                                            │
       │  5. Register for Events (reg_event)        │
       │───────────────────────────────────────────>│
       │                                            │
       │  6. Receive Real-time Events               │
       │<───────────────────────────────────────────│
       │                                            │
       │  7. Clear Attendance Log (after sync)      │
       │───────────────────────────────────────────>│
       │                                            │
       │  8. Disconnect                             │
       │───────────────────────────────────────────>│
```

### 2.4 Multi-Device Architecture

```
                    ┌─────────────────────────┐
                    │  DeviceSyncService      │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
           ▼                     ▼                     ▼
    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
    │  Device #1   │     │  Device #2   │     │  Device #3   │
    │ ZKT001       │     │ ZKT002       │     │ ZKT003       │
    │ 192.168.1.201│     │ 192.168.1.202│     │ 192.168.1.203│
    │ Port: 4370   │     │ Port: 4370   │     │ Port: 4370   │
    └──────────────┘     └──────────────┘     └──────────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    SQL Server Database    │
                    └─────────────────────────┘
```

---

## 3. SDK Integration

### 3.1 Required Libraries

```xml
<!-- packages.config or .csproj -->
<PackageReference Include="Interop.zkemkeeper" Version="1.1.0" />
<!-- OR use COM reference directly -->
<Reference Include="zkemkeeper">
  <HintPath>..\lib\zkemkeeper.dll</HintPath>
  <EmbedInteropTypes>true</EmbedInteropTypes>
  <Private>true</Private>
</Reference>
```

### 3.2 zkemkeeper.dll Key Methods

| Method | Description | Return |
|--------|-------------|--------|
| `Connect(ip, port, password)` | Establish TCP connection | bool |
| `Disconnect()` | Close connection | void |
| `IsConnected()` | Check connection status | bool |
| `EnableDevice(enable)` | Enable/disable device | bool |
| `GetAllUserID()` | Enumerate all user IDs | bool |
| `GetUserInfo(uid, name, id, dept, priv, enabled)` | Read user info | bool |
| `SetUserInfo(uid, name, id, dept, priv, enabled)` | Write user info | bool |
| `GetAttLog()` | Load attendance records | bool |
| `GetStrRecord(index, records)` | Read attendance record | bool |
| `SetStrRecord(records)` | Write attendance record | bool |
| `ClearAttLog()` | Delete all attendance records | bool |
| `RegEvent(windowHandle, eventMask)` | Register for events | bool |
| `GetDeviceInfo(model, serial, firmware)` | Get device info | bool |
| `SetDeviceTime()` | Sync device time | bool |
| `GetDeviceStatus(statusCode)` | Query device status | bool |

### 3.3 Basic Connection Example

```csharp
using zkemkeeper;

public class ZKTecoConnection : IDisposable
{
    private CZKEM _device;
    private bool _isConnected;
    private string _ipAddress;
    private int _port;
    private int _password;

    public ZKTecoConnection(string ipAddress, int port = 4370, int password = 0)
    {
        _device = new CZKEM();
        _ipAddress = ipAddress;
        _port = port;
        _password = password;
    }

    public bool Connect()
    {
        try
        {
            _isConnected = _device.Connect_Net(_ipAddress, _port);
            if (_isConnected)
            {
                // Authenticate if password is set
                if (_password != 0)
                {
                    _isConnected = _device.ConnectByUSBKey(_password);
                }
            }
            return _isConnected;
        }
        catch (COMException ex)
        {
            Console.WriteLine($"COM Error: {ex.Message}");
            return false;
        }
    }

    public bool Disconnect()
    {
        if (_isConnected)
        {
            _isConnected = false;
            return _device.Disconnect();
        }
        return true;
    }

    public bool IsConnected => _isConnected;

    public List<DeviceUser> GetAllUsers()
    {
        var users = new List<DeviceUser>();
        if (!_isConnected) return users;

        _device.ReadAllUserID(1); // Read from device
        int userId = 0;
        string name = "";
        string password = "";
        int privilege = 0;
        bool enabled = false;

        while (_device.GetUserInfo(1, ref userId, ref name, ref password, ref privilege, ref enabled))
        {
            users.Add(new DeviceUser
            {
                UserId = userId,
                Name = name,
                Password = password,
                Privilege = privilege,
                Enabled = enabled
            });
        }

        return users;
    }

    public List<DeviceAttendanceRecord> GetAllAttendanceRecords()
    {
        var records = new List<DeviceAttendanceRecord>();
        if (!_isConnected) return records;

        _device.ReadAllAttLogs(1); // Read all attendance logs
        int userId = 0;
        int verifyMode = 0;
        int inOut = 0;
        int year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;

        while (_device.GetGeneralLogData(1, ref userId, ref verifyMode, ref inOut,
                                         ref year, ref month, ref day, ref hour, ref minute, ref second))
        {
            records.Add(new DeviceAttendanceRecord
            {
                UserId = userId,
                VerifyMode = verifyMode,
                InOutMode = inOut,
                Timestamp = new DateTime(year, month, day, hour, minute, second)
            });
        }

        return records;
    }

    public bool ClearAttendanceLog()
    {
        if (!_isConnected) return false;
        return _device.ClearAttLog(1);
    }

    public bool RegisterForEvents(IntPtr windowHandle, int eventMask)
    {
        if (!_isConnected) return false;
        return _device.RegEvent(windowHandle, eventMask);
    }

    public void Dispose()
    {
        Disconnect();
        if (_device != null)
        {
            Marshal.ReleaseComObject(_device);
            _device = null;
        }
    }
}
```

### 3.4 Device Data Models

```csharp
public class DeviceUser
{
    public int UserId { get; set; }
    public string Name { get; set; }
    public string Password { get; set; }
    public int Privilege { get; set; }  // 0=Normal, 1=Admin, 2=SuperAdmin
    public bool Enabled { get; set; }
}

public class DeviceAttendanceRecord
{
    public int UserId { get; set; }
    public int VerifyMode { get; set; }  // 0=Password, 1=Fingerprint, 2=Card
    public int InOutMode { get; set; }   // 0=CheckIn, 1=CheckOut
    public DateTime Timestamp { get; set; }
}

public enum DeviceVerifyMode
{
    Password = 0,
    Fingerprint = 1,
    Card = 2,
    Face = 3
}

public enum DeviceInOutMode
{
    CheckIn = 0,
    CheckOut = 1
}
```

---

## 4. Database Design

### 4.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                  │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐          ┌──────────────────────┐
│      DEVICES         │          │     EMPLOYEES        │
├──────────────────────┤          ├──────────────────────┤
│ PK DeviceId          │          │ PK EmployeeId        │
│    SerialNumber      │          │    FullName          │
│    DeviceName        │          │    EmployeeCode      │
│    IPAddress         │          │    Email             │
│    Port              │          │    Department        │
│    Model             │          │    Position          │
│    Status            │          │    DeviceUserId      │
│    Location          │          │    Status            │
│    LastSyncedDate    │          │    CreatedDate       │
│    CreatedDate       │          │    LastModified      │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                 │
           │ 1                             1 │
           │                                 │
           │ *                             * │
┌──────────┴─────────────────────────────────┴───────────┐
│                   ATTENDANCE_RECORDS                    │
├─────────────────────────────────────────────────────────┤
│ PK RecordId        │ FK DeviceId      │ FK EmployeeId  │
│    Timestamp       │    Status        │    Type        │
│    Method          │    Score         │    DeviceSerial│
│    CreatedDate     │                                       │
└───────────────────────────┬─────────────────────────────┘
                            │
                            │ 1
                            │
                            │ *
┌───────────────────────────┴─────────────────────────────┐
│                  ATTENDANCE_SUMMARY                      │
├─────────────────────────────────────────────────────────┤
│ PK SummaryId      │ FK EmployeeId   │    Date          │
│    CheckInTime    │    CheckOutTime  │    WorkDuration  │
│    Status         │    IsLate        │    IsEarlyLeave  │
│    CreatedDate    │    UpdatedDate   │                   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 SQL Table Definitions

```sql
-- DEVICES TABLE
CREATE TABLE Devices (
    DeviceId INT IDENTITY(1,1) PRIMARY KEY,
    SerialNumber NVARCHAR(50) NOT NULL UNIQUE,
    DeviceName NVARCHAR(100) NOT NULL,
    IPAddress NVARCHAR(50) NOT NULL,
    Port INT DEFAULT 4370,
    Model NVARCHAR(50) DEFAULT 'MB2000',
    Status NVARCHAR(20) DEFAULT 'Offline',
    Location NVARCHAR(200) NULL,
    LastSyncedDate DATETIME2 NULL,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_Devices_SerialNumber (SerialNumber),
    INDEX IX_Devices_IPAddress (IPAddress)
);

-- EMPLOYEES TABLE
CREATE TABLE Employees (
    EmployeeId INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(100) NOT NULL,
    EmployeeCode NVARCHAR(50) UNIQUE NULL,
    Email NVARCHAR(100) NULL,
    Department NVARCHAR(100) NULL,
    Position NVARCHAR(100) NULL,
    DeviceUserId INT NOT NULL UNIQUE,
    Status NVARCHAR(20) DEFAULT 'Active',
    HasBiometric BIT DEFAULT 0,
    Photo VARBINARY(MAX) NULL,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    LastModified DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_Employees_DeviceUserId (DeviceUserId),
    INDEX IX_Employees_EmployeeCode (EmployeeCode),
    INDEX IX_Employees_Department (Department)
);

-- ATTENDANCE_RECORDS TABLE
CREATE TABLE AttendanceRecords (
    RecordId INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL,
    DeviceId INT NOT NULL,
    Timestamp DATETIME2 NOT NULL,
    Status NVARCHAR(20) NOT NULL,  -- 'CheckIn' or 'CheckOut'
    Method NVARCHAR(50) NULL,      -- 'FaceRecognition', 'Fingerprint', 'Card'
    Score INT NULL,                -- Verification score (0-100)
    DeviceSerialNumber NVARCHAR(50) NULL,
    IsSynced BIT DEFAULT 0,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_AttendanceRecords_Employees FOREIGN KEY (EmployeeId)
        REFERENCES Employees(EmployeeId),
    CONSTRAINT FK_AttendanceRecords_Devices FOREIGN KEY (DeviceId)
        REFERENCES Devices(DeviceId),
    INDEX IX_AttendanceRecords_EmployeeId (EmployeeId),
    INDEX IX_AttendanceRecords_DeviceId (DeviceId),
    INDEX IX_AttendanceRecords_Timestamp (Timestamp),
    INDEX IX_AttendanceRecords_Employee_Timestamp (EmployeeId, Timestamp)
);

-- ATTENDANCE_SUMMARY TABLE
CREATE TABLE AttendanceSummary (
    SummaryId INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL,
    Date DATE NOT NULL,
    CheckInTime TIME(7) NULL,
    CheckOutTime TIME(7) NULL,
    WorkDurationMinutes FLOAT NULL,
    Status NVARCHAR(20) DEFAULT 'Present',  -- 'Present', 'Late', 'Absent', 'EarlyLeave'
    IsLate BIT DEFAULT 0,
    IsEarlyLeave BIT DEFAULT 0,
    Notes NVARCHAR(500) NULL,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedDate DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_AttendanceSummary_Employees FOREIGN KEY (EmployeeId)
        REFERENCES Employees(EmployeeId),
    CONSTRAINT UQ_AttendanceSummary_Employee_Date UNIQUE (EmployeeId, Date),
    INDEX IX_AttendanceSummary_Date (Date),
    INDEX IX_AttendanceSummary_Status (Status)
);

-- LEAVE_REQUESTS TABLE (Optional - for future extension)
CREATE TABLE LeaveRequests (
    LeaveId INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeId INT NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    LeaveType NVARCHAR(50) NOT NULL,
    Reason NVARCHAR(500) NULL,
    Status NVARCHAR(20) DEFAULT 'Pending',
    ApprovedBy INT NULL,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_LeaveRequests_Employees FOREIGN KEY (EmployeeId)
        REFERENCES Employees(EmployeeId),
    INDEX IX_LeaveRequests_EmployeeId (EmployeeId),
    INDEX IX_LeaveRequests_Status (Status)
);
```

---

## 5. Entity Framework Models

### 5.1 Core Entities

```csharp
// ============================================================
// Device Entity
// ============================================================
[Table("Devices")]
public class Device
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int DeviceId { get; set; }

    [Required]
    [MaxLength(50)]
    public string SerialNumber { get; set; }

    [Required]
    [MaxLength(100)]
    public string DeviceName { get; set; }

    [Required]
    [MaxLength(50)]
    public string IPAddress { get; set; }

    [Range(1, 65535)]
    public int Port { get; set; } = 4370;

    [MaxLength(50)]
    public string Model { get; set; } = "MB2000";

    [MaxLength(20)]
    public string Status { get; set; } = "Offline";

    [MaxLength(200)]
    public string Location { get; set; }

    public DateTime? LastSyncedDate { get; set; }

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public virtual ICollection<AttendanceRecord> AttendanceRecords { get; set; }
        = new List<AttendanceRecord>();
}

// ============================================================
// Employee Entity
// ============================================================
[Table("Employees")]
public class Employee
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int EmployeeId { get; set; }

    [Required]
    [MaxLength(100)]
    public string FullName { get; set; }

    [MaxLength(50)]
    public string EmployeeCode { get; set; }

    [MaxLength(100)]
    [EmailAddress]
    public string Email { get; set; }

    [MaxLength(100)]
    public string Department { get; set; }

    [MaxLength(100)]
    public string Position { get; set; }

    [Required]
    public int DeviceUserId { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Active";

    public bool HasBiometric { get; set; } = false;

    public byte[] Photo { get; set; }

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    public DateTime LastModified { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public virtual ICollection<AttendanceRecord> AttendanceRecords { get; set; }
        = new List<AttendanceRecord>();

    public virtual ICollection<AttendanceSummary> AttendanceSummaries { get; set; }
        = new List<AttendanceSummary>();
}

// ============================================================
// AttendanceRecord Entity
// ============================================================
[Table("AttendanceRecords")]
public class AttendanceRecord
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int RecordId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [Required]
    public int DeviceId { get; set; }

    [Required]
    public DateTime Timestamp { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; }  // "CheckIn" or "CheckOut"

    [MaxLength(50)]
    public string Method { get; set; }  // "FaceRecognition", "Fingerprint", "Card"

    public int? Score { get; set; }

    [MaxLength(50)]
    public string DeviceSerialNumber { get; set; }

    public bool IsSynced { get; set; } = false;

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey("EmployeeId")]
    public virtual Employee Employee { get; set; }

    [ForeignKey("DeviceId")]
    public virtual Device Device { get; set; }
}

// ============================================================
// AttendanceSummary Entity
// ============================================================
[Table("AttendanceSummary")]
public class AttendanceSummary
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int SummaryId { get; set; }

    [Required]
    public int EmployeeId { get; set; }

    [Required]
    public DateTime Date { get; set; }

    public TimeSpan? CheckInTime { get; set; }

    public TimeSpan? CheckOutTime { get; set; }

    public double? WorkDurationMinutes { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Present";

    public bool IsLate { get; set; } = false;

    public bool IsEarlyLeave { get; set; } = false;

    [MaxLength(500)]
    public string Notes { get; set; }

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedDate { get; set; } = DateTime.UtcNow;

    // Navigation property
    [ForeignKey("EmployeeId")]
    public virtual Employee Employee { get; set; }
}
```

### 5.2 DbContext Configuration

```csharp
public class AttendanceDbContext : DbContext
{
    public DbSet<Device> Devices { get; set; }
    public DbSet<Employee> Employees { get; set; }
    public DbSet<AttendanceRecord> AttendanceRecords { get; set; }
    public DbSet<AttendanceSummary> AttendanceSummaries { get; set; }

    public AttendanceDbContext(DbContextOptions<AttendanceDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // --------------------------------------------------------
        // Device Configuration
        // --------------------------------------------------------
        modelBuilder.Entity<Device>(entity =>
        {
            entity.HasKey(d => d.DeviceId);

            entity.Property(d => d.SerialNumber)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(d => d.DeviceName)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(d => d.IPAddress)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(d => d.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Offline");

            entity.HasIndex(d => d.SerialNumber)
                .IsUnique();

            entity.HasIndex(d => d.IPAddress);
        });

        // --------------------------------------------------------
        // Employee Configuration
        // --------------------------------------------------------
        modelBuilder.Entity<Employee>(entity =>
        {
            entity.HasKey(e => e.EmployeeId);

            entity.Property(e => e.FullName)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(e => e.EmployeeCode)
                .HasMaxLength(50);

            entity.Property(e => e.Email)
                .HasMaxLength(100);

            entity.Property(e => e.Department)
                .HasMaxLength(100);

            entity.Property(e => e.Position)
                .HasMaxLength(100);

            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Active");

            entity.HasIndex(e => e.DeviceUserId)
                .IsUnique();

            entity.HasIndex(e => e.EmployeeCode)
                .IsUnique()
                .HasFilter("[EmployeeCode] IS NOT NULL");

            entity.HasIndex(e => e.Department);
        });

        // --------------------------------------------------------
        // AttendanceRecord Configuration
        // --------------------------------------------------------
        modelBuilder.Entity<AttendanceRecord>(entity =>
        {
            entity.HasKey(a => a.RecordId);

            entity.Property(a => a.Timestamp)
                .IsRequired();

            entity.Property(a => a.Status)
                .IsRequired()
                .HasMaxLength(20);

            entity.Property(a => a.Method)
                .HasMaxLength(50);

            entity.Property(a => a.DeviceSerialNumber)
                .HasMaxLength(50);

            entity.HasOne(a => a.Employee)
                .WithMany(e => e.AttendanceRecords)
                .HasForeignKey(a => a.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(a => a.Device)
                .WithMany(d => d.AttendanceRecords)
                .HasForeignKey(a => a.DeviceId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(a => a.EmployeeId);
            entity.HasIndex(a => a.DeviceId);
            entity.HasIndex(a => a.Timestamp);
            entity.HasIndex(a => new { a.EmployeeId, a.Timestamp });
        });

        // --------------------------------------------------------
        // AttendanceSummary Configuration
        // --------------------------------------------------------
        modelBuilder.Entity<AttendanceSummary>(entity =>
        {
            entity.HasKey(s => s.SummaryId);

            entity.Property(s => s.Status)
                .HasMaxLength(20)
                .HasDefaultValue("Present");

            entity.Property(s => s.Notes)
                .HasMaxLength(500);

            entity.HasOne(s => s.Employee)
                .WithMany(e => e.AttendanceSummaries)
                .HasForeignKey(s => s.EmployeeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(s => s.Date);
            entity.HasIndex(s => s.Status);

            entity.HasIndex(s => new { s.EmployeeId, s.Date })
                .IsUnique();
        });
    }

    public override int SaveChanges()
    {
        HandleAuditFields();
        return base.SaveChanges();
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        HandleAuditFields();
        return await base.SaveChangesAsync(cancellationToken);
    }

    private void HandleAuditFields()
    {
        var entries = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified);

        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Entity is AttendanceRecord record)
                    record.CreatedDate = DateTime.UtcNow;
                else if (entry.Entity is Employee employee)
                    employee.CreatedDate = DateTime.UtcNow;
                else if (entry.Entity is Device device)
                    device.CreatedDate = DateTime.UtcNow;
            }

            if (entry.State == EntityState.Modified)
            {
                if (entry.Entity is Employee emp)
                    emp.LastModified = DateTime.UtcNow;
                else if (entry.Entity is AttendanceSummary summary)
                    summary.UpdatedDate = DateTime.UtcNow;
            }
        }
    }
}
```

---

## 6. Repository Layer

### 6.1 Repository Interfaces

```csharp
// ============================================================
// Generic Repository Interface
// ============================================================
public interface IRepository<T> where T : class
{
    Task<T> GetByIdAsync(int id);
    Task<IEnumerable<T>> GetAllAsync();
    Task<T> AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(int id);
    Task<bool> ExistsAsync(int id);
}

// ============================================================
// Device Repository Interface
// ============================================================
public interface IDeviceRepository : IRepository<Device>
{
    Task<Device> GetBySerialNumberAsync(string serialNumber);
    Task<Device> GetByIPAddressAsync(string ipAddress);
    Task<IEnumerable<Device>> GetActiveDevicesAsync();
    Task<int> GetActiveCountAsync();
    Task UpdateDeviceStatusAsync(int deviceId, string status);
    Task UpdateLastSyncedDateAsync(int deviceId);
}

// ============================================================
// Employee Repository Interface
// ============================================================
public interface IEmployeeRepository : IRepository<Employee>
{
    Task<Employee> GetByDeviceUserIdAsync(int deviceUserId);
    Task<Employee> GetByEmployeeCodeAsync(string employeeCode);
    Task<IEnumerable<Employee>> GetByDepartmentAsync(string department);
    Task<IEnumerable<Employee>> GetActiveEmployeesAsync();
    Task<int> GetCountAsync();
    Task<int> GetNextDeviceUserIdAsync();
    Task SyncUsersFromDeviceAsync(List<DeviceUser> deviceUsers, int deviceId);
}

// ============================================================
// AttendanceRecord Repository Interface
// ============================================================
public interface IAttendanceRecordRepository : IRepository<AttendanceRecord>
{
    Task<IEnumerable<AttendanceRecord>> GetByEmployeeIdAsync(int employeeId);
    Task<IEnumerable<AttendanceRecord>> GetByDateAsync(DateTime date);
    Task<IEnumerable<AttendanceRecord>> GetByDateRangeAsync(DateTime startDate, DateTime endDate);
    Task<IEnumerable<AttendanceRecord>> GetByEmployeeAndDateAsync(int employeeId, DateTime date);
    Task<IEnumerable<AttendanceRecord>> GetTodayRecordsAsync();
    Task<int> GetRecordCountAsync(DateTime date);
    Task<int> GetCountByDateAsync(DateTime date);
    Task<TimeSpan?> CalculateWorkDurationAsync(int employeeId, DateTime date);
}

// ============================================================
// AttendanceSummary Repository Interface
// ============================================================
public interface IAttendanceSummaryRepository : IRepository<AttendanceSummary>
{
    Task<AttendanceSummary> GetByEmployeeAndDateAsync(int employeeId, DateTime date);
    Task<IEnumerable<AttendanceSummary>> GetByEmployeeAndMonthAsync(int employeeId, int year, int month);
    Task<IEnumerable<AttendanceSummary>> GetMonthlySummariesAsync(int year, int month);
    Task<AttendanceSummary> GetOrCreateTodaySummaryAsync(int employeeId, DateTime date);
    Task UpdateCheckInAsync(int employeeId, DateTime timestamp);
    Task UpdateCheckOutAsync(int employeeId, DateTime timestamp);
}
```

### 6.2 Repository Implementations

```csharp
// ============================================================
// Generic Repository
// ============================================================
public abstract class Repository<T> : IRepository<T> where T : class
{
    protected readonly AttendanceDbContext _context;
    protected readonly DbSet<T> _dbSet;
    protected readonly ILogger _logger;

    protected Repository(AttendanceDbContext context, ILogger logger)
    {
        _context = context;
        _dbSet = context.Set<T>();
        _logger = logger;
    }

    public virtual async Task<T> GetByIdAsync(int id)
    {
        return await _dbSet.FindAsync(id);
    }

    public virtual async Task<IEnumerable<T>> GetAllAsync()
    {
        return await _dbSet.ToListAsync();
    }

    public virtual async Task<T> AddAsync(T entity)
    {
        await _dbSet.AddAsync(entity);
        await _context.SaveChangesAsync();
        return entity;
    }

    public virtual async Task UpdateAsync(T entity)
    {
        _dbSet.Update(entity);
        await _context.SaveChangesAsync();
    }

    public virtual async Task DeleteAsync(int id)
    {
        var entity = await GetByIdAsync(id);
        if (entity != null)
        {
            _dbSet.Remove(entity);
            await _context.SaveChangesAsync();
        }
    }

    public virtual async Task<bool> ExistsAsync(int id)
    {
        return await _dbSet.FindAsync(id) != null;
    }
}

// ============================================================
// Device Repository
// ============================================================
public class DeviceRepository : Repository<Device>, IDeviceRepository
{
    public DeviceRepository(AttendanceDbContext context, ILogger<DeviceRepository> logger)
        : base(context, logger)
    {
    }

    public async Task<Device> GetBySerialNumberAsync(string serialNumber)
    {
        return await _dbSet
            .FirstOrDefaultAsync(d => d.SerialNumber == serialNumber);
    }

    public async Task<Device> GetByIPAddressAsync(string ipAddress)
    {
        return await _dbSet
            .FirstOrDefaultAsync(d => d.IPAddress == ipAddress);
    }

    public async Task<IEnumerable<Device>> GetActiveDevicesAsync()
    {
        return await _dbSet
            .Where(d => d.Status == "Online")
            .ToListAsync();
    }

    public async Task<int> GetActiveCountAsync()
    {
        return await _dbSet
            .CountAsync(d => d.Status == "Online");
    }

    public async Task UpdateDeviceStatusAsync(int deviceId, string status)
    {
        var device = await GetByIdAsync(deviceId);
        if (device != null)
        {
            device.Status = status;
            await UpdateAsync(device);
        }
    }

    public async Task UpdateLastSyncedDateAsync(int deviceId)
    {
        var device = await GetByIdAsync(deviceId);
        if (device != null)
        {
            device.LastSyncedDate = DateTime.UtcNow;
            await UpdateAsync(device);
        }
    }
}

// ============================================================
// Employee Repository
// ============================================================
public class EmployeeRepository : Repository<Employee>, IEmployeeRepository
{
    public EmployeeRepository(AttendanceDbContext context, ILogger<EmployeeRepository> logger)
        : base(context, logger)
    {
    }

    public async Task<Employee> GetByDeviceUserIdAsync(int deviceUserId)
    {
        return await _dbSet
            .FirstOrDefaultAsync(e => e.DeviceUserId == deviceUserId);
    }

    public async Task<Employee> GetByEmployeeCodeAsync(string employeeCode)
    {
        return await _dbSet
            .FirstOrDefaultAsync(e => e.EmployeeCode == employeeCode);
    }

    public async Task<IEnumerable<Employee>> GetByDepartmentAsync(string department)
    {
        return await _dbSet
            .Where(e => e.Department == department && e.Status == "Active")
            .ToListAsync();
    }

    public async Task<IEnumerable<Employee>> GetActiveEmployeesAsync()
    {
        return await _dbSet
            .Where(e => e.Status == "Active")
            .ToListAsync();
    }

    public async Task<int> GetCountAsync()
    {
        return await _dbSet.CountAsync();
    }

    public async Task<int> GetNextDeviceUserIdAsync()
    {
        var maxId = await _dbSet.MaxAsync(e => (int?)e.DeviceUserId) ?? 0;
        return maxId + 1;
    }

    public async Task SyncUsersFromDeviceAsync(List<DeviceUser> deviceUsers, int deviceId)
    {
        using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            foreach (var deviceUser in deviceUsers)
            {
                var existing = await GetByDeviceUserIdAsync(deviceUser.UserId);

                if (existing == null)
                {
                    var newEmployee = new Employee
                    {
                        FullName = deviceUser.Name,
                        EmployeeCode = $"UID-{deviceUser.UserId:D3}",
                        DeviceUserId = deviceUser.UserId,
                        Status = deviceUser.Enabled ? "Active" : "Inactive",
                        CreatedDate = DateTime.UtcNow,
                        LastModified = DateTime.UtcNow
                    };
                    await AddAsync(newEmployee);
                }
                else
                {
                    existing.FullName = deviceUser.Name;
                    existing.Status = deviceUser.Enabled ? "Active" : "Inactive";
                    existing.LastModified = DateTime.UtcNow;
                    await UpdateAsync(existing);
                }
            }

            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }
}

// ============================================================
// AttendanceRecord Repository
// ============================================================
public class AttendanceRecordRepository : Repository<AttendanceRecord>, IAttendanceRecordRepository
{
    public AttendanceRecordRepository(AttendanceDbContext context, ILogger<AttendanceRecordRepository> logger)
        : base(context, logger)
    {
    }

    public async Task<IEnumerable<AttendanceRecord>> GetByEmployeeIdAsync(int employeeId)
    {
        return await _dbSet
            .Where(a => a.EmployeeId == employeeId)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();
    }

    public async Task<IEnumerable<AttendanceRecord>> GetByDateAsync(DateTime date)
    {
        return await _dbSet
            .Where(a => a.Timestamp.Date == date.Date)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();
    }

    public async Task<IEnumerable<AttendanceRecord>> GetByDateRangeAsync(
        DateTime startDate, DateTime endDate)
    {
        return await _dbSet
            .Where(a => a.Timestamp.Date >= startDate.Date && a.Timestamp.Date <= endDate.Date)
            .OrderByDescending(a => a.Timestamp)
            .ToListAsync();
    }

    public async Task<IEnumerable<AttendanceRecord>> GetByEmployeeAndDateAsync(
        int employeeId, DateTime date)
    {
        return await _dbSet
            .Where(a => a.EmployeeId == employeeId && a.Timestamp.Date == date.Date)
            .OrderBy(a => a.Timestamp)
            .ToListAsync();
    }

    public async Task<IEnumerable<AttendanceRecord>> GetTodayRecordsAsync()
    {
        var today = DateTime.Today;
        return await GetByDateAsync(today);
    }

    public async Task<int> GetRecordCountAsync(DateTime date)
    {
        return await _dbSet
            .CountAsync(a => a.Timestamp.Date == date.Date);
    }

    public async Task<int> GetCountByDateAsync(DateTime date)
    {
        return await GetRecordCountAsync(date);
    }

    public async Task<TimeSpan?> CalculateWorkDurationAsync(int employeeId, DateTime date)
    {
        var summary = await _context.AttendanceSummaries
            .FirstOrDefaultAsync(s => s.EmployeeId == employeeId && s.Date == date.Date);

        if (summary?.CheckInTime.HasValue == true && summary?.CheckOutTime.HasValue == true)
        {
            return summary.CheckOutTime.Value - summary.CheckInTime.Value;
        }

        return null;
    }
}

// ============================================================
// AttendanceSummary Repository
// ============================================================
public class AttendanceSummaryRepository : Repository<AttendanceSummary>, IAttendanceSummaryRepository
{
    public AttendanceSummaryRepository(
        AttendanceDbContext context,
        ILogger<AttendanceSummaryRepository> logger)
        : base(context, logger)
    {
    }

    public async Task<AttendanceSummary> GetByEmployeeAndDateAsync(int employeeId, DateTime date)
    {
        return await _dbSet
            .FirstOrDefaultAsync(s => s.EmployeeId == employeeId && s.Date == date.Date);
    }

    public async Task<IEnumerable<AttendanceSummary>> GetByEmployeeAndMonthAsync(
        int employeeId, int year, int month)
    {
        var startDate = new DateTime(year, month, 1);
        var endDate = startDate.AddMonths(1).AddDays(-1);

        return await _dbSet
            .Where(s => s.EmployeeId == employeeId &&
                        s.Date >= startDate && s.Date <= endDate)
            .OrderBy(s => s.Date)
            .ToListAsync();
    }

    public async Task<IEnumerable<AttendanceSummary>> GetMonthlySummariesAsync(
        int year, int month)
    {
        var startDate = new DateTime(year, month, 1);
        var endDate = startDate.AddMonths(1).AddDays(-1);

        return await _dbSet
            .Where(s => s.Date >= startDate && s.Date <= endDate)
            .Include(s => s.Employee)
            .ToListAsync();
    }

    public async Task<AttendanceSummary> GetOrCreateTodaySummaryAsync(
        int employeeId, DateTime date)
    {
        var summary = await GetByEmployeeAndDateAsync(employeeId, date);

        if (summary == null)
        {
            summary = new AttendanceSummary
            {
                EmployeeId = employeeId,
                Date = date.Date,
                Status = "Present",
                CreatedDate = DateTime.UtcNow,
                UpdatedDate = DateTime.UtcNow
            };
            await AddAsync(summary);
        }

        return summary;
    }

    public async Task UpdateCheckInAsync(int employeeId, DateTime timestamp)
    {
        var summary = await GetOrCreateTodaySummaryAsync(employeeId, timestamp);
        summary.CheckInTime = timestamp.TimeOfDay;
        summary.UpdatedDate = DateTime.UtcNow;

        // Determine if late (after 9:15 AM)
        var lateThreshold = new TimeSpan(9, 15, 0);
        summary.IsLate = timestamp.TimeOfDay > lateThreshold;
        summary.Status = summary.IsLate ? "Late" : "Present";

        await UpdateAsync(summary);
    }

    public async Task UpdateCheckOutAsync(int employeeId, DateTime timestamp)
    {
        var summary = await GetOrCreateTodaySummaryAsync(employeeId, timestamp);
        summary.CheckOutTime = timestamp.TimeOfDay;
        summary.UpdatedDate = DateTime.UtcNow;

        // Calculate work duration
        if (summary.CheckInTime.HasValue)
        {
            summary.WorkDurationMinutes =
                (timestamp.TimeOfDay - summary.CheckInTime.Value).TotalMinutes;

            // Determine if early leave (before 5:00 PM)
            var earlyLeaveThreshold = new TimeSpan(17, 0, 0);
            summary.IsEarlyLeave = timestamp.TimeOfDay < earlyLeaveThreshold;

            if (summary.IsEarlyLeave)
                summary.Status = "EarlyLeave";
        }

        await UpdateAsync(summary);
    }
}
```

---

## 7. Service Layer

### 7.1 Service Interfaces

```csharp
// ============================================================
// Attendance Service Interface
// ============================================================
public interface IAttendanceService
{
    Task<DashboardStatsDto> GetDashboardStatsAsync();
    Task<List<AttendanceDto>> GetTodayAttendanceAsync();
    Task<List<AttendanceDto>> GetAttendanceByDateRangeAsync(DateTime start, DateTime end);
    Task<AttendanceDto> RecordManualCheckInAsync(int employeeId, int deviceId);
    Task<SyncResultDto> ProcessNewRecordsAsync(string deviceSerial, List<AttendanceRecordDto> records);
    Task<SyncUserResultDto> SyncUsersFromDeviceAsync(List<UserSyncDto> users);
    Task<List<MonthlyReportDto>> GetMonthlyReportAsync(int year, int month);
}

// ============================================================
// Device Service Interface
// ============================================================
public interface IDeviceService
{
    Task<DeviceDto> RegisterDeviceAsync(DeviceDto deviceDto);
    Task RemoveDeviceAsync(int deviceId);
    Task<List<DeviceDto>> GetAllDevicesAsync();
    Task<DeviceDto> GetByIdAsync(int deviceId);
    Task EnableDeviceAsync(int deviceId, bool isEnabled);
    Task<DeviceStatusDto> TestConnectionAsync(DeviceConfig config);
    Task<DeviceStatusDto> GetDeviceStatusAsync(int deviceId);
}

// ============================================================
// Device Sync Service Interface
// ============================================================
public interface IDeviceSyncService
{
    Task SyncDeviceAsync(DeviceConfig config);
    Task<List<DeviceAttendanceRecord>> GetAttendanceRecordsAsync(DeviceConfig config);
    Task<List<DeviceUser>> GetDeviceUsersAsync(DeviceConfig config);
    Task ClearDeviceAttendanceAsync(DeviceConfig config);
    Task<DeviceStatus> GetDeviceStatusAsync(DeviceConfig config);
}

// ============================================================
// Employee Service Interface
// ============================================================
public interface IEmployeeService
{
    Task<List<EmployeeDto>> GetAllEmployeesAsync();
    Task<EmployeeDto> GetByIdAsync(int employeeId);
    Task<EmployeeDto> CreateAsync(CreateEmployeeDto dto);
    Task<EmployeeDto> UpdateAsync(int employeeId, UpdateEmployeeDto dto);
    Task DeleteAsync(int employeeId);
    Task<List<EmployeeDto>> GetByDepartmentAsync(string department);
}
```

### 7.2 Service Implementations

```csharp
// ============================================================
// Attendance Service Implementation
// ============================================================
public class AttendanceService : IAttendanceService
{
    private readonly IAttendanceRecordRepository _attendanceRepo;
    private readonly IAttendanceSummaryRepository _summaryRepo;
    private readonly IEmployeeRepository _employeeRepo;
    private readonly IDeviceRepository _deviceRepo;
    private readonly IEventPublisher _eventPublisher;
    private readonly ILogger<AttendanceService> _logger;

    public AttendanceService(
        IAttendanceRecordRepository attendanceRepo,
        IAttendanceSummaryRepository summaryRepo,
        IEmployeeRepository employeeRepo,
        IDeviceRepository deviceRepo,
        IEventPublisher eventPublisher,
        ILogger<AttendanceService> logger)
    {
        _attendanceRepo = attendanceRepo;
        _summaryRepo = summaryRepo;
        _employeeRepo = employeeRepo;
        _deviceRepo = deviceRepo;
        _eventPublisher = eventPublisher;
        _logger = logger;
    }

    public async Task<DashboardStatsDto> GetDashboardStatsAsync()
    {
        var today = DateTime.Today;
        var totalEmployees = await _employeeRepo.GetCountAsync();
        var todayRecords = await _attendanceRepo.GetByDateAsync(today);
        var checkedInToday = todayRecords
            .Where(r => r.Status == "CheckIn")
            .Select(r => r.EmployeeId)
            .Distinct()
            .Count();

        var summaries = await _summaryRepo.GetMonthlySummariesAsync(today.Year, today.Month);
        var todaySummaries = summaries.Where(s => s.Date == today);

        return new DashboardStatsDto
        {
            TotalActiveUsers = totalEmployees,
            CheckedInToday = checkedInToday,
            AbsentToday = totalEmployees - checkedInToday,
            LateToday = todaySummaries.Count(s => s.IsLate),
            OnLeaveToday = todaySummaries.Count(s => s.Status == "OnLeave"),
            TotalRecordsToday = todayRecords.Count(),
            DevicesOnline = await _deviceRepo.GetActiveCountAsync(),
            LastUpdated = DateTime.UtcNow
        };
    }

    public async Task<List<AttendanceDto>> GetTodayAttendanceAsync()
    {
        var today = DateTime.Today;
        var records = await _attendanceRepo.GetByDateAsync(today);
        var dtos = new List<AttendanceDto>();

        foreach (var record in records)
        {
            var employee = await _employeeRepo.GetByIdAsync(record.EmployeeId);
            var device = await _deviceRepo.GetByIdAsync(record.DeviceId);

            dtos.Add(new AttendanceDto
            {
                RecordId = record.RecordId,
                EmployeeId = record.EmployeeId,
                EmployeeName = employee?.FullName ?? "Unknown",
                EmployeeCode = employee?.EmployeeCode ?? "-",
                Department = employee?.Department ?? "-",
                Timestamp = record.Timestamp,
                Status = record.Status,
                Method = record.Method ?? "Unknown",
                Score = record.Score ?? 0,
                DeviceSerialNumber = device?.SerialNumber ?? record.DeviceSerialNumber ?? "-"
            });
        }

        return dtos.OrderByDescending(d => d.Timestamp).ToList();
    }

    public async Task<List<AttendanceDto>> GetAttendanceByDateRangeAsync(
        DateTime startDate, DateTime endDate)
    {
        var records = await _attendanceRepo.GetByDateRangeAsync(startDate, endDate);
        var dtos = new List<AttendanceDto>();

        foreach (var record in records)
        {
            var employee = await _employeeRepo.GetByIdAsync(record.EmployeeId);
            var device = await _deviceRepo.GetByIdAsync(record.DeviceId);

            dtos.Add(new AttendanceDto
            {
                RecordId = record.RecordId,
                EmployeeId = record.EmployeeId,
                EmployeeName = employee?.FullName ?? "Unknown",
                EmployeeCode = employee?.EmployeeCode ?? "-",
                Department = employee?.Department ?? "-",
                Timestamp = record.Timestamp,
                Status = record.Status,
                Method = record.Method ?? "Unknown",
                Score = record.Score ?? 0,
                DeviceSerialNumber = device?.SerialNumber ?? record.DeviceSerialNumber ?? "-"
            });
        }

        return dtos.OrderByDescending(d => d.Timestamp).ToList();
    }

    public async Task<AttendanceDto> RecordManualCheckInAsync(int employeeId, int deviceId)
    {
        var employee = await _employeeRepo.GetByIdAsync(employeeId);
        if (employee == null)
            throw new KeyNotFoundException($"Employee {employeeId} not found");

        var device = await _deviceRepo.GetByIdAsync(deviceId);
        if (device == null)
            throw new KeyNotFoundException($"Device {deviceId} not found");

        var record = new AttendanceRecord
        {
            EmployeeId = employeeId,
            DeviceId = deviceId,
            Timestamp = DateTime.UtcNow,
            Status = "CheckIn",
            Method = "Manual",
            Score = 100,
            DeviceSerialNumber = device.SerialNumber,
            CreatedDate = DateTime.UtcNow
        };

        await _attendanceRepo.AddAsync(record);
        await _summaryRepo.UpdateCheckInAsync(employeeId, record.Timestamp);

        await _eventPublisher.PublishAsync(new AttendanceRecordedEvent
        {
            EmployeeId = employeeId,
            EmployeeName = employee.FullName,
            Timestamp = record.Timestamp,
            Status = "CheckIn",
            DeviceSerial = device.SerialNumber
        });

        return new AttendanceDto
        {
            RecordId = record.RecordId,
            EmployeeId = employeeId,
            EmployeeName = employee.FullName,
            EmployeeCode = employee.EmployeeCode,
            Department = employee.Department,
            Timestamp = record.Timestamp,
            Status = record.Status,
            Method = record.Method,
            Score = record.Score.Value,
            DeviceSerialNumber = device.SerialNumber
        };
    }

    public async Task<SyncResultDto> ProcessNewRecordsAsync(
        string deviceSerial, List<AttendanceRecordDto> records)
    {
        var device = await _deviceRepo.GetBySerialNumberAsync(deviceSerial);
        if (device == null)
            throw new InvalidOperationException($"Device {deviceSerial} not found");

        var inserted = 0;
        var skipped = 0;

        foreach (var record in records)
        {
            var employee = await _employeeRepo.GetByDeviceUserIdAsync(record.UserId);
            if (employee == null)
            {
                _logger.LogWarning($"No employee for device user {record.UserId}");
                skipped++;
                continue;
            }

            // Check for duplicate
            var existing = await _attendanceRepo.GetByEmployeeAndDateAsync(
                employee.EmployeeId, record.Timestamp);
            if (existing.Any(r => Math.Abs(
                (r.Timestamp - record.Timestamp).TotalSeconds) < 2))
            {
                skipped++;
                continue;
            }

            var attendanceRecord = new AttendanceRecord
            {
                EmployeeId = employee.EmployeeId,
                DeviceId = device.DeviceId,
                Timestamp = record.Timestamp,
                Status = record.Status,
                Method = record.Method,
                Score = record.Score,
                DeviceSerialNumber = deviceSerial,
                CreatedDate = DateTime.UtcNow
            };

            await _attendanceRepo.AddAsync(attendanceRecord);

            // Update summary
            if (record.Status == "CheckIn")
                await _summaryRepo.UpdateCheckInAsync(employee.EmployeeId, record.Timestamp);
            else
                await _summaryRepo.UpdateCheckOutAsync(employee.EmployeeId, record.Timestamp);

            // Publish event
            await _eventPublisher.PublishAsync(new AttendanceRecordedEvent
            {
                EmployeeId = employee.EmployeeId,
                EmployeeName = employee.FullName,
                Timestamp = record.Timestamp,
                Status = record.Status,
                DeviceSerial = deviceSerial
            });

            inserted++;
        }

        // Update device sync time
        await _deviceRepo.UpdateLastSyncedDateAsync(device.DeviceId);

        _logger.LogInformation(
            $"Synced {inserted} records from {deviceSerial} ({skipped} skipped)");

        return new SyncResultDto
        {
            Success = true,
            DeviceSerialNumber = deviceSerial,
            TotalRecords = records.Count,
            InsertedRecords = inserted,
            SkippedRecords = skipped,
            ProcessedAt = DateTime.UtcNow
        };
    }

    public async Task<SyncUserResultDto> SyncUsersFromDeviceAsync(List<UserSyncDto> users)
    {
        var created = 0;
        var updated = 0;

        foreach (var user in users)
        {
            var existing = await _employeeRepo.GetByDeviceUserIdAsync(user.UserId);

            if (existing == null)
            {
                var newEmployee = new Employee
                {
                    FullName = user.Name,
                    EmployeeCode = user.EmployeeId ?? $"UID-{user.UserId:D3}",
                    DeviceUserId = user.UserId,
                    Department = user.Department,
                    Position = user.Position,
                    Email = user.Email,
                    Status = "Active",
                    CreatedDate = DateTime.UtcNow,
                    LastModified = DateTime.UtcNow
                };

                await _employeeRepo.AddAsync(newEmployee);
                created++;
            }
            else
            {
                existing.FullName = user.Name;
                existing.EmployeeCode = user.EmployeeId ?? existing.EmployeeCode;
                existing.Department = user.Department ?? existing.Department;
                existing.Position = user.Position ?? existing.Position;
                existing.Email = user.Email ?? existing.Email;
                existing.LastModified = DateTime.UtcNow;

                await _employeeRepo.UpdateAsync(existing);
                updated++;
            }
        }

        return new SyncUserResultDto
        {
            Success = true,
            CreatedCount = created,
            UpdatedCount = updated,
            TotalProcessed = users.Count
        };
    }

    public async Task<List<MonthlyReportDto>> GetMonthlyReportAsync(int year, int month)
    {
        var employees = await _employeeRepo.GetActiveEmployeesAsync();
        var report = new List<MonthlyReportDto>();

        foreach (var employee in employees)
        {
            var summaries = await _summaryRepo.GetByEmployeeAndMonthAsync(
                employee.EmployeeId, year, month);

            var presentDays = summaries.Count(s => s.Status == "Present" || s.Status == "Late");
            var lateDays = summaries.Count(s => s.IsLate);
            var earlyLeaveDays = summaries.Count(s => s.IsEarlyLeave);
            var totalWorkHours = summaries
                .Where(s => s.WorkDurationMinutes.HasValue)
                .Sum(s => s.WorkDurationMinutes.Value) / 60.0;

            var daysInMonth = DateTime.DaysInMonth(year, month);
            var absentDays = daysInMonth - presentDays;

            report.Add(new MonthlyReportDto
            {
                EmployeeId = employee.EmployeeId,
                EmployeeName = employee.FullName,
                Department = employee.Department ?? "-",
                PresentDays = presentDays,
                LateDays = lateDays,
                AbsentDays = absentDays,
                EarlyLeaveDays = earlyLeaveDays,
                TotalWorkHours = Math.Round(totalWorkHours, 1)
            });
        }

        return report;
    }
}

// ============================================================
// Device Service Implementation
// ============================================================
public class DeviceService : IDeviceService
{
    private readonly IDeviceRepository _deviceRepo;
    private readonly ILogger<DeviceService> _logger;

    public DeviceService(IDeviceRepository deviceRepo, ILogger<DeviceService> logger)
    {
        _deviceRepo = deviceRepo;
        _logger = logger;
    }

    public async Task<DeviceDto> RegisterDeviceAsync(DeviceDto deviceDto)
    {
        var existing = await _deviceRepo.GetBySerialNumberAsync(deviceDto.SerialNumber);
        if (existing != null)
            throw new InvalidOperationException(
                $"Device with serial {deviceDto.SerialNumber} already exists");

        var device = new Device
        {
            SerialNumber = deviceDto.SerialNumber,
            DeviceName = deviceDto.DeviceName,
            IPAddress = deviceDto.IPAddress,
            Port = deviceDto.Port,
            Model = deviceDto.Model,
            Location = deviceDto.Location,
            Status = "Offline",
            CreatedDate = DateTime.UtcNow
        };

        var result = await _deviceRepo.AddAsync(device);

        return new DeviceDto
        {
            DeviceId = result.DeviceId,
            SerialNumber = result.SerialNumber,
            DeviceName = result.DeviceName,
            IPAddress = result.IPAddress,
            Port = result.Port,
            Model = result.Model,
            Location = result.Location,
            Status = result.Status,
            CreatedDate = result.CreatedDate
        };
    }

    public async Task RemoveDeviceAsync(int deviceId)
    {
        await _deviceRepo.DeleteAsync(deviceId);
    }

    public async Task<List<DeviceDto>> GetAllDevicesAsync()
    {
        var devices = await _deviceRepo.GetAllAsync();
        return devices.Select(d => new DeviceDto
        {
            DeviceId = d.DeviceId,
            SerialNumber = d.SerialNumber,
            DeviceName = d.DeviceName,
            IPAddress = d.IPAddress,
            Port = d.Port,
            Model = d.Model,
            Location = d.Location,
            Status = d.Status,
            LastSyncedDate = d.LastSyncedDate,
            CreatedDate = d.CreatedDate
        }).ToList();
    }

    public async Task<DeviceDto> GetByIdAsync(int deviceId)
    {
        var device = await _deviceRepo.GetByIdAsync(deviceId);
        if (device == null)
            throw new KeyNotFoundException($"Device {deviceId} not found");

        return new DeviceDto
        {
            DeviceId = device.DeviceId,
            SerialNumber = device.SerialNumber,
            DeviceName = device.DeviceName,
            IPAddress = device.IPAddress,
            Port = device.Port,
            Model = device.Model,
            Location = device.Location,
            Status = device.Status,
            LastSyncedDate = device.LastSyncedDate,
            CreatedDate = device.CreatedDate
        };
    }

    public async Task EnableDeviceAsync(int deviceId, bool isEnabled)
    {
        await _deviceRepo.UpdateDeviceStatusAsync(
            deviceId, isEnabled ? "Online" : "Offline");
    }

    public async Task<DeviceStatusDto> TestConnectionAsync(DeviceConfig config)
    {
        try
        {
            using var connection = new ZKTecoConnection(
                config.IPAddress, config.Port, config.Password);

            var connected = connection.Connect();
            return new DeviceStatusDto
            {
                IsConnected = connected,
                Status = connected ? "Online" : "Offline",
                IPAddress = config.IPAddress,
                Port = config.Port,
                LastChecked = DateTime.UtcNow
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Connection test failed for {config.IPAddress}");
            return new DeviceStatusDto
            {
                IsConnected = false,
                Status = "Error",
                IPAddress = config.IPAddress,
                Port = config.Port,
                Error = ex.Message,
                LastChecked = DateTime.UtcNow
            };
        }
    }

    public async Task<DeviceStatusDto> GetDeviceStatusAsync(int deviceId)
    {
        var device = await _deviceRepo.GetByIdAsync(deviceId);
        if (device == null)
            throw new KeyNotFoundException($"Device {deviceId} not found");

        return new DeviceStatusDto
        {
            IsConnected = device.Status == "Online",
            Status = device.Status,
            IPAddress = device.IPAddress,
            Port = device.Port,
            LastChecked = DateTime.UtcNow
        };
    }
}
```

---

## 8. Web API Layer

### 8.1 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/attendance/today` | Get today's attendance records |
| `GET` | `/api/attendance/stats` | Get dashboard statistics |
| `GET` | `/api/attendance/date-range?start=&end=` | Get records by date range |
| `POST` | `/api/attendance/checkin` | Manual check-in |
| `POST` | `/api/attendance/sync` | Sync attendance from device |
| `POST` | `/api/attendance/sync-users` | Sync users from device |
| `GET` | `/api/employees` | List all employees |
| `GET` | `/api/employees/{id}` | Get employee by ID |
| `POST` | `/api/employees` | Create employee |
| `PUT` | `/api/employees/{id}` | Update employee |
| `DELETE` | `/api/employees/{id}` | Delete employee |
| `GET` | `/api/devices` | List all devices |
| `GET` | `/api/devices/{id}` | Get device by ID |
| `POST` | `/api/devices` | Register device |
| `PUT` | `/api/devices/{id}` | Update device |
| `DELETE` | `/api/devices/{id}` | Remove device |
| `POST` | `/api/devices/{id}/enable` | Enable/disable device |
| `POST` | `/api/devices/test` | Test device connection |
| `GET` | `/api/reports/monthly?year=&month=` | Monthly report |
| `GET` | `/api/health` | Health check |

### 8.2 Controllers

```csharp
// ============================================================
// Attendance Controller
// ============================================================
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class AttendanceController : ControllerBase
{
    private readonly IAttendanceService _attendanceService;
    private readonly ILogger<AttendanceController> _logger;

    public AttendanceController(
        IAttendanceService attendanceService,
        ILogger<AttendanceController> logger)
    {
        _attendanceService = attendanceService;
        _logger = logger;
    }

    [HttpGet("today")]
    [ProducesResponseType(typeof(ApiResponse<List<AttendanceDto>>), 200)]
    public async Task<IActionResult> GetTodayAttendance()
    {
        try
        {
            var records = await _attendanceService.GetTodayAttendanceAsync();
            return Ok(ApiResponse<List<AttendanceDto>>.Success(records));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting today's attendance");
            return StatusCode(500, ApiResponse<List<AttendanceDto>>.Error(ex.Message));
        }
    }

    [HttpGet("stats")]
    [ProducesResponseType(typeof(ApiResponse<DashboardStatsDto>), 200)]
    public async Task<IActionResult> GetDashboardStats()
    {
        try
        {
            var stats = await _attendanceService.GetDashboardStatsAsync();
            return Ok(ApiResponse<DashboardStatsDto>.Success(stats));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting dashboard stats");
            return StatusCode(500, ApiResponse<DashboardStatsDto>.Error(ex.Message));
        }
    }

    [HttpGet("date-range")]
    [ProducesResponseType(typeof(ApiResponse<List<AttendanceDto>>), 200)]
    public async Task<IActionResult> GetByDateRange(
        [FromQuery] DateTime start, [FromQuery] DateTime end)
    {
        try
        {
            var records = await _attendanceService.GetAttendanceByDateRangeAsync(start, end);
            return Ok(ApiResponse<List<AttendanceDto>>.Success(records));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting attendance by date range");
            return StatusCode(500, ApiResponse<List<AttendanceDto>>.Error(ex.Message));
        }
    }

    [HttpPost("checkin")]
    [ProducesResponseType(typeof(ApiResponse<AttendanceDto>), 200)]
    public async Task<IActionResult> RecordCheckIn([FromBody] CheckInRequest request)
    {
        try
        {
            var result = await _attendanceService.RecordManualCheckInAsync(
                request.EmployeeId, request.DeviceId);
            return Ok(ApiResponse<AttendanceDto>.Success(result));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<AttendanceDto>.Error(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording check-in");
            return StatusCode(500, ApiResponse<AttendanceDto>.Error(ex.Message));
        }
    }

    [HttpPost("sync")]
    [ProducesResponseType(typeof(ApiResponse<SyncResultDto>), 200)]
    public async Task<IActionResult> SyncAttendance([FromBody] SyncRequest request)
    {
        try
        {
            var result = await _attendanceService.ProcessNewRecordsAsync(
                request.DeviceSerialNumber, request.Records);
            return Ok(ApiResponse<SyncResultDto>.Success(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing attendance");
            return StatusCode(500, ApiResponse<SyncResultDto>.Error(ex.Message));
        }
    }

    [HttpPost("sync-users")]
    [ProducesResponseType(typeof(ApiResponse<SyncUserResultDto>), 200)]
    public async Task<IActionResult> SyncUsers([FromBody] List<UserSyncDto> users)
    {
        try
        {
            var result = await _attendanceService.SyncUsersFromDeviceAsync(users);
            return Ok(ApiResponse<SyncUserResultDto>.Success(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing users");
            return StatusCode(500, ApiResponse<SyncUserResultDto>.Error(ex.Message));
        }
    }
}

// ============================================================
// Devices Controller
// ============================================================
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;
    private readonly ILogger<DevicesController> _logger;

    public DevicesController(
        IDeviceService deviceService,
        ILogger<DevicesController> logger)
    {
        _deviceService = deviceService;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<List<DeviceDto>>), 200)]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var devices = await _deviceService.GetAllDevicesAsync();
            return Ok(ApiResponse<List<DeviceDto>>.Success(devices));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting devices");
            return StatusCode(500, ApiResponse<List<DeviceDto>>.Error(ex.Message));
        }
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(ApiResponse<DeviceDto>), 200)]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var device = await _deviceService.GetByIdAsync(id);
            return Ok(ApiResponse<DeviceDto>.Success(device));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<DeviceDto>.Error(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error getting device {id}");
            return StatusCode(500, ApiResponse<DeviceDto>.Error(ex.Message));
        }
    }

    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<DeviceDto>), 201)]
    public async Task<IActionResult> Register([FromBody] DeviceDto deviceDto)
    {
        try
        {
            var device = await _deviceService.RegisterDeviceAsync(deviceDto);
            return CreatedAtAction(nameof(GetById),
                new { id = device.DeviceId },
                ApiResponse<DeviceDto>.Success(device));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ApiResponse<DeviceDto>.Error(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering device");
            return StatusCode(500, ApiResponse<DeviceDto>.Error(ex.Message));
        }
    }

    [HttpDelete("{id}")]
    [ProducesResponseType(typeof(ApiResponse), 200)]
    public async Task<IActionResult> Remove(int id)
    {
        try
        {
            await _deviceService.RemoveDeviceAsync(id);
            return Ok(ApiResponse.Success("Device removed"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error removing device {id}");
            return StatusCode(500, ApiResponse.Error(ex.Message));
        }
    }

    [HttpPost("{id}/enable")]
    [ProducesResponseType(typeof(ApiResponse), 200)]
    public async Task<IActionResult> Enable(int id, [FromBody] EnableRequest request)
    {
        try
        {
            await _deviceService.EnableDeviceAsync(id, request.IsEnabled);
            return Ok(ApiResponse.Success("Device status updated"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error enabling device {id}");
            return StatusCode(500, ApiResponse.Error(ex.Message));
        }
    }

    [HttpPost("test")]
    [ProducesResponseType(typeof(ApiResponse<DeviceStatusDto>), 200)]
    public async Task<IActionResult> TestConnection([FromBody] DeviceConfig config)
    {
        try
        {
            var result = await _deviceService.TestConnectionAsync(config);
            return Ok(ApiResponse<DeviceStatusDto>.Success(result));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error testing device connection");
            return StatusCode(500, ApiResponse<DeviceStatusDto>.Error(ex.Message));
        }
    }
}

// ============================================================
// Employees Controller
// ============================================================
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _employeeService;
    private readonly ILogger<EmployeesController> _logger;

    public EmployeesController(
        IEmployeeService employeeService,
        ILogger<EmployeesController> logger)
    {
        _employeeService = employeeService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var employees = await _employeeService.GetAllEmployeesAsync();
            return Ok(ApiResponse<List<EmployeeDto>>.Success(employees));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting employees");
            return StatusCode(500, ApiResponse<List<EmployeeDto>>.Error(ex.Message));
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var employee = await _employeeService.GetByIdAsync(id);
            return Ok(ApiResponse<EmployeeDto>.Success(employee));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<EmployeeDto>.Error(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error getting employee {id}");
            return StatusCode(500, ApiResponse<EmployeeDto>.Error(ex.Message));
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEmployeeDto dto)
    {
        try
        {
            var employee = await _employeeService.CreateAsync(dto);
            return CreatedAtAction(nameof(GetById),
                new { id = employee.EmployeeId },
                ApiResponse<EmployeeDto>.Success(employee));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating employee");
            return StatusCode(500, ApiResponse<EmployeeDto>.Error(ex.Message));
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateEmployeeDto dto)
    {
        try
        {
            var employee = await _employeeService.UpdateAsync(id, dto);
            return Ok(ApiResponse<EmployeeDto>.Success(employee));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<EmployeeDto>.Error(ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error updating employee {id}");
            return StatusCode(500, ApiResponse<EmployeeDto>.Error(ex.Message));
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            await _employeeService.DeleteAsync(id);
            return Ok(ApiResponse.Success("Employee deleted"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error deleting employee {id}");
            return StatusCode(500, ApiResponse.Error(ex.Message));
        }
    }
}

// ============================================================
// Reports Controller
// ============================================================
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class ReportsController : ControllerBase
{
    private readonly IAttendanceService _attendanceService;
    private readonly ILogger<ReportsController> _logger;

    public ReportsController(
        IAttendanceService attendanceService,
        ILogger<ReportsController> logger)
    {
        _attendanceService = attendanceService;
        _logger = logger;
    }

    [HttpGet("monthly")]
    public async Task<IActionResult> GetMonthlyReport(
        [FromQuery] int year, [FromQuery] int month)
    {
        try
        {
            var report = await _attendanceService.GetMonthlyReportAsync(year, month);
            return Ok(ApiResponse<List<MonthlyReportDto>>.Success(report));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error getting monthly report for {year}-{month}");
            return StatusCode(500, ApiResponse<List<MonthlyReportDto>>.Error(ex.Message));
        }
    }
}

// ============================================================
// Health Controller
// ============================================================
[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly AttendanceDbContext _context;
    private readonly IDeviceRepository _deviceRepo;

    public HealthController(
        AttendanceDbContext context,
        IDeviceRepository deviceRepo)
    {
        _context = context;
        _deviceRepo = deviceRepo;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var canConnect = await _context.Database.CanConnectAsync();
        var devicesOnline = await _deviceRepo.GetActiveCountAsync();

        return Ok(new
        {
            Status = canConnect ? "Healthy" : "Unhealthy",
            Database = canConnect ? "Connected" : "Disconnected",
            DevicesOnline = devicesOnline,
            Timestamp = DateTime.UtcNow
        });
    }
}
```

### 8.3 DTOs

```csharp
// ============================================================
// Request DTOs
// ============================================================
public class CheckInRequest
{
    [Required]
    public int EmployeeId { get; set; }

    [Required]
    public int DeviceId { get; set; }
}

public class SyncRequest
{
    [Required]
    public string DeviceSerialNumber { get; set; }

    [Required]
    public List<AttendanceRecordDto> Records { get; set; }
}

public class EnableRequest
{
    public bool IsEnabled { get; set; }
}

public class AttendanceRecordDto
{
    public int UserId { get; set; }
    public DateTime Timestamp { get; set; }
    public string Status { get; set; }
    public string Method { get; set; }
    public int? Score { get; set; }
}

public class UserSyncDto
{
    public int UserId { get; set; }
    public string Name { get; set; }
    public string EmployeeId { get; set; }
    public string Department { get; set; }
    public string Position { get; set; }
    public string Email { get; set; }
}

// ============================================================
// Response DTOs
// ============================================================
public class AttendanceDto
{
    public int RecordId { get; set; }
    public int EmployeeId { get; set; }
    public string EmployeeName { get; set; }
    public string EmployeeCode { get; set; }
    public string Department { get; set; }
    public DateTime Timestamp { get; set; }
    public string Status { get; set; }
    public string Method { get; set; }
    public int Score { get; set; }
    public string DeviceSerialNumber { get; set; }
}

public class DeviceDto
{
    public int DeviceId { get; set; }
    public string SerialNumber { get; set; }
    public string DeviceName { get; set; }
    public string IPAddress { get; set; }
    public int Port { get; set; }
    public string Model { get; set; }
    public string Location { get; set; }
    public string Status { get; set; }
    public DateTime? LastSyncedDate { get; set; }
    public DateTime CreatedDate { get; set; }
}

public class EmployeeDto
{
    public int EmployeeId { get; set; }
    public string FullName { get; set; }
    public string EmployeeCode { get; set; }
    public string Email { get; set; }
    public string Department { get; set; }
    public string Position { get; set; }
    public int DeviceUserId { get; set; }
    public string Status { get; set; }
    public bool HasBiometric { get; set; }
    public DateTime CreatedDate { get; set; }
}

public class CreateEmployeeDto
{
    [Required]
    public string FullName { get; set; }
    public string EmployeeCode { get; set; }
    public string Email { get; set; }
    public string Department { get; set; }
    public string Position { get; set; }
    [Required]
    public int DeviceUserId { get; set; }
}

public class UpdateEmployeeDto
{
    public string FullName { get; set; }
    public string EmployeeCode { get; set; }
    public string Email { get; set; }
    public string Department { get; set; }
    public string Position { get; set; }
    public string Status { get; set; }
}

public class DashboardStatsDto
{
    public int TotalActiveUsers { get; set; }
    public int CheckedInToday { get; set; }
    public int AbsentToday { get; set; }
    public int LateToday { get; set; }
    public int OnLeaveToday { get; set; }
    public int TotalRecordsToday { get; set; }
    public int DevicesOnline { get; set; }
    public DateTime LastUpdated { get; set; }
}

public class SyncResultDto
{
    public bool Success { get; set; }
    public string DeviceSerialNumber { get; set; }
    public int TotalRecords { get; set; }
    public int InsertedRecords { get; set; }
    public int SkippedRecords { get; set; }
    public DateTime ProcessedAt { get; set; }
}

public class SyncUserResultDto
{
    public bool Success { get; set; }
    public int CreatedCount { get; set; }
    public int UpdatedCount { get; set; }
    public int TotalProcessed { get; set; }
}

public class MonthlyReportDto
{
    public int EmployeeId { get; set; }
    public string EmployeeName { get; set; }
    public string Department { get; set; }
    public int PresentDays { get; set; }
    public int LateDays { get; set; }
    public int AbsentDays { get; set; }
    public int EarlyLeaveDays { get; set; }
    public double TotalWorkHours { get; set; }
}

public class DeviceStatusDto
{
    public bool IsConnected { get; set; }
    public string Status { get; set; }
    public string IPAddress { get; set; }
    public int Port { get; set; }
    public string Error { get; set; }
    public DateTime LastChecked { get; set; }
}

// ============================================================
// Generic API Response
// ============================================================
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T Data { get; set; }
    public string Message { get; set; }
    public List<string> Errors { get; set; }

    public static ApiResponse<T> Success(T data, string message = null)
        => new ApiResponse<T> { Success = true, Data = data, Message = message };

    public static ApiResponse<T> Error(string error)
        => new ApiResponse<T> { Success = false, Errors = new List<string> { error } };
}

public class ApiResponse
{
    public bool Success { get; set; }
    public string Message { get; set; }
    public List<string> Errors { get; set; }

    public static ApiResponse Success(string message = null)
        => new ApiResponse { Success = true, Message = message };

    public static ApiResponse Error(string error)
        => new ApiResponse { Success = false, Errors = new List<string> { error } };
}
```

---

## 9. Background Synchronization

### 9.1 Configuration Model

```csharp
public class DeviceSyncOptions
{
    public const string SectionName = "DeviceSync";

    public int PollIntervalSeconds { get; set; } = 10;
    public int ConnectionTimeoutSeconds { get; set; } = 15;
    public int MaxRetryAttempts { get; set; } = 5;
    public int RetryDelaySeconds { get; set; } = 30;
    public bool EnableRealTimeEvents { get; set; } = true;
    public bool ClearDeviceAfterSync { get; set; } = true;
}
```

### 9.2 Background Service

```csharp
// ============================================================
// Device Sync Hosted Service
// ============================================================
public class DeviceSyncHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DeviceSyncHostedService> _logger;
    private readonly DeviceSyncOptions _options;

    public DeviceSyncHostedService(
        IServiceProvider serviceProvider,
        ILogger<DeviceSyncHostedService> logger,
        IOptions<DeviceSyncOptions> options)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Device Sync Service starting");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllDevicesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in device sync cycle");
            }

            await Task.Delay(
                TimeSpan.FromSeconds(_options.PollIntervalSeconds), stoppingToken);
        }

        _logger.LogInformation("Device Sync Service stopped");
    }

    private async Task SyncAllDevicesAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var deviceRepo = scope.ServiceProvider.GetRequiredService<IDeviceRepository>();
        var syncService = scope.ServiceProvider.GetRequiredService<IDeviceSyncService>();

        var devices = await deviceRepo.GetActiveDevicesAsync();

        foreach (var device in devices)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var config = new DeviceConfig
                {
                    IPAddress = device.IPAddress,
                    Port = device.Port,
                    SerialNumber = device.SerialNumber
                };

                await syncService.SyncDeviceAsync(config);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    $"Error syncing device {device.SerialNumber} ({device.IPAddress})");
            }
        }
    }
}

// ============================================================
// Real-Time Event Listener Service
// ============================================================
public class RealTimeEventListenerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<RealTimeEventListenerService> _logger;

    public RealTimeEventListenerService(
        IServiceProvider serviceProvider,
        ILogger<RealTimeEventListenerService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Real-Time Event Listener starting");

        var connections = new Dictionary<string, ZKTecoConnection>();

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var deviceRepo = scope.ServiceProvider.GetRequiredService<IDeviceRepository>();
            var devices = await deviceRepo.GetActiveDevicesAsync();

            foreach (var device in devices)
            {
                try
                {
                    var connection = new ZKTecoConnection(
                        device.IPAddress, device.Port);
                    if (connection.Connect())
                    {
                        connections[device.SerialNumber] = connection;
                        _logger.LogInformation(
                            $"Connected to {device.SerialNumber} for real-time events");

                        // Register for events
                        connection.RegisterForEvents(IntPtr.Zero, 65535);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        $"Failed to connect to {device.SerialNumber} for events");
                }
            }

            // Keep running until cancellation
            while (!stoppingToken.IsCancellationRequested)
            {
                // Process any queued events from connections
                await Task.Delay(100, stoppingToken);
            }
        }
        finally
        {
            foreach (var connection in connections.Values)
            {
                connection.Dispose();
            }
            _logger.LogInformation("Real-Time Event Listener stopped");
        }
    }
}
```

---

## 10. Real-Time Event Handling

### 10.1 Event Models

```csharp
// ============================================================
// Base Event
// ============================================================
public abstract class Event
{
    public Guid EventId { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

// ============================================================
// Attendance Events
// ============================================================
public class AttendanceRecordedEvent : Event
{
    public int EmployeeId { get; set; }
    public string EmployeeName { get; set; }
    public string Status { get; set; }
    public DateTime AttendanceTimestamp { get; set; }
    public string DeviceSerial { get; set; }
    public string Method { get; set; }
}

public class AttendanceSyncedEvent : Event
{
    public string DeviceSerial { get; set; }
    public int RecordsCount { get; set; }
}

// ============================================================
// Device Events
// ============================================================
public class DeviceConnectedEvent : Event
{
    public string DeviceSerial { get; set; }
    public string IPAddress { get; set; }
}

public class DeviceDisconnectedEvent : Event
{
    public string DeviceSerial { get; set; }
    public string Reason { get; set; }
}

public class DeviceStatusChangedEvent : Event
{
    public string DeviceSerial { get; set; }
    public string OldStatus { get; set; }
    public string NewStatus { get; set; }
}
```

### 10.2 Event Bus

```csharp
// ============================================================
// Event Bus Interface
// ============================================================
public interface IEventBus
{
    Task PublishAsync<TEvent>(TEvent @event) where TEvent : Event;
    void Subscribe<TEvent, THandler>() where TEvent : Event where THandler : IEventHandler<TEvent>;
}

// ============================================================
// Event Handler Interface
// ============================================================
public interface IEventHandler<in TEvent> where TEvent : Event
{
    Task HandleAsync(TEvent @event);
}

// ============================================================
// In-Memory Event Bus
// ============================================================
public class InMemoryEventBus : IEventBus
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<InMemoryEventBus> _logger;

    public InMemoryEventBus(
        IServiceProvider serviceProvider,
        ILogger<InMemoryEventBus> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task PublishAsync<TEvent>(TEvent @event) where TEvent : Event
    {
        _logger.LogDebug($"Publishing event: {typeof(TEvent).Name}");

        var handlers = _serviceProvider.GetServices<IEventHandler<TEvent>>();
        foreach (var handler in handlers)
        {
            try
            {
                await handler.HandleAsync(@event);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    $"Error handling event {typeof(TEvent).Name} in {handler.GetType().Name}");
            }
        }
    }

    public void Subscribe<TEvent, THandler>()
        where TEvent : Event
        where THandler : IEventHandler<TEvent>
    {
        _logger.LogDebug(
            $"Subscribed: {typeof(THandler).Name} to {typeof(TEvent).Name}");
    }
}

// ============================================================
// Event Publisher (Simplified for DI)
// ============================================================
public interface IEventPublisher
{
    Task PublishAsync<TEvent>(TEvent @event) where TEvent : Event;
}

public class EventPublisher : IEventPublisher
{
    private readonly IEventBus _eventBus;

    public EventPublisher(IEventBus eventBus)
    {
        _eventBus = eventBus;
    }

    public async Task PublishAsync<TEvent>(TEvent @event) where TEvent : Event
    {
        await _eventBus.PublishAsync(@event);
    }
}

// ============================================================
// Event Handlers
// ============================================================
public class AttendanceEventHandler :
    IEventHandler<AttendanceRecordedEvent>,
    IEventHandler<AttendanceSyncedEvent>
{
    private readonly ILogger<AttendanceEventHandler> _logger;

    public AttendanceEventHandler(ILogger<AttendanceEventHandler> logger)
    {
        _logger = logger;
    }

    public async Task HandleAsync(AttendanceRecordedEvent @event)
    {
        _logger.LogInformation(
            $"Attendance: {@event.EmployeeName} {@event.Status} at " +
            $"{@event.AttendanceTimestamp:HH:mm:ss} via {@event.Method}");

        // In production: push to WebSocket clients, send notifications, etc.
        await Task.CompletedTask;
    }

    public async Task HandleAsync(AttendanceSyncedEvent @event)
    {
        _logger.LogInformation(
            $"Synced {@event.RecordsCount} records from {@event.DeviceSerial}");
        await Task.CompletedTask;
    }
}

public class DeviceEventHandler :
    IEventHandler<DeviceConnectedEvent>,
    IEventHandler<DeviceDisconnectedEvent>
{
    private readonly IDeviceRepository _deviceRepo;
    private readonly ILogger<DeviceEventHandler> _logger;

    public DeviceEventHandler(
        IDeviceRepository deviceRepo,
        ILogger<DeviceEventHandler> logger)
    {
        _deviceRepo = deviceRepo;
        _logger = logger;
    }

    public async Task HandleAsync(DeviceConnectedEvent @event)
    {
        _logger.LogInformation(
            $"Device connected: {@event.DeviceSerial} ({@event.IPAddress})");
        await _deviceRepo.UpdateDeviceStatusAsync(
            (await _deviceRepo.GetBySerialNumberAsync(@event.DeviceSerial))?.DeviceId ?? 0,
            "Online");
    }

    public async Task HandleAsync(DeviceDisconnectedEvent @event)
    {
        _logger.LogWarning(
            $"Device disconnected: {@event.DeviceSerial} - {@event.Reason}");
        var device = await _deviceRepo.GetBySerialNumberAsync(@event.DeviceSerial);
        if (device != null)
        {
            await _deviceRepo.UpdateDeviceStatusAsync(device.DeviceId, "Offline");
        }
    }
}
```

---

## 11. Error Handling & Retry

### 11.1 Retry Policy

```csharp
// ============================================================
// Retry Helper
// ============================================================
public static class RetryHelper
{
    public static async Task<T> ExecuteWithRetryAsync<T>(
        Func<Task<T>> operation,
        int maxRetries = 3,
        int delayMs = 1000,
        ILogger logger = null)
    {
        int attempt = 0;
        while (true)
        {
            try
            {
                return await operation();
            }
            catch (Exception ex)
            {
                attempt++;
                if (attempt >= maxRetries)
                {
                    logger?.LogError(ex, $"Operation failed after {maxRetries} attempts");
                    throw;
                }

                logger?.LogWarning(ex,
                    $"Attempt {attempt}/{maxRetries} failed. Retrying in {delayMs}ms...");
                await Task.Delay(delayMs * attempt); // Exponential-ish backoff
            }
        }
    }

    public static async Task ExecuteWithRetryAsync(
        Func<Task> operation,
        int maxRetries = 3,
        int delayMs = 1000,
        ILogger logger = null)
    {
        await ExecuteWithRetryAsync<object>(async () =>
        {
            await operation();
            return null;
        }, maxRetries, delayMs, logger);
    }
}

// ============================================================
// Circuit Breaker
// ============================================================
public class CircuitBreaker
{
    private int _failureCount;
    private DateTime? _lastFailureTime;
    private readonly int _failureThreshold;
    private readonly TimeSpan _recoveryTime;
    private readonly object _lock = new object();

    public CircuitBreaker(int failureThreshold = 5, int recoveryTimeSeconds = 60)
    {
        _failureThreshold = failureThreshold;
        _recoveryTime = TimeSpan.FromSeconds(recoveryTimeSeconds);
    }

    public bool IsOpen
    {
        get
        {
            lock (_lock)
            {
                if (_failureCount < _failureThreshold) return false;
                if (_lastFailureTime.HasValue &&
                    DateTime.UtcNow - _lastFailureTime > _recoveryTime)
                {
                    _failureCount = 0;
                    return false;
                }
                return true;
            }
        }
    }

    public void RecordSuccess()
    {
        lock (_lock)
        {
            _failureCount = 0;
        }
    }

    public void RecordFailure()
    {
        lock (_lock)
        {
            _failureCount++;
            _lastFailureTime = DateTime.UtcNow;
        }
    }
}

// ============================================================
// Device Connection Manager with Circuit Breaker
// ============================================================
public class DeviceConnectionManager : IDisposable
{
    private readonly DeviceConfig _config;
    private readonly ILogger<DeviceConnectionManager> _logger;
    private readonly CircuitBreaker _circuitBreaker;
    private ZKTecoConnection _connection;
    private bool _isConnected;
    private readonly object _lock = new object();

    public DeviceConnectionManager(
        DeviceConfig config,
        ILogger<DeviceConnectionManager> logger)
    {
        _config = config;
        _logger = logger;
        _circuitBreaker = new CircuitBreaker(failureThreshold: 5, recoveryTimeSeconds: 60);
    }

    public bool IsConnected => _isConnected;

    public async Task<bool> ConnectAsync()
    {
        if (_circuitBreaker.IsOpen)
        {
            _logger.LogWarning(
                $"Circuit breaker OPEN for {_config.SerialNumber}. Skipping connection.");
            return false;
        }

        return await RetryHelper.ExecuteWithRetryAsync(async () =>
        {
            lock (_lock)
            {
                if (_connection != null)
                {
                    _connection.Dispose();
                }

                _connection = new ZKTecoConnection(
                    _config.IPAddress, _config.Port, _config.Password);
                _isConnected = _connection.Connect();
            }

            if (_isConnected)
            {
                _circuitBreaker.RecordSuccess();
                _logger.LogInformation(
                    $"Connected to {_config.SerialNumber} at {_config.IPAddress}");
            }

            return _isConnected;
        }, maxRetries: 3, delayMs: 2000, logger: _logger);
    }

    public void Disconnect()
    {
        lock (_lock)
        {
            if (_connection != null)
            {
                _connection.Disconnect();
                _connection.Dispose();
                _connection = null;
            }
            _isConnected = false;
        }
    }

    public ZKTecoConnection GetConnection()
    {
        if (!_isConnected || _connection == null)
        {
            throw new InvalidOperationException(
                $"Not connected to device {_config.SerialNumber}");
        }
        return _connection;
    }

    public void Dispose()
    {
        Disconnect();
    }
}
```

---

## 12. Logging & Monitoring

### 12.1 Logging Configuration

```csharp
// ============================================================
// Serilog Configuration (appsettings.json)
// ============================================================
// {
//   "Serilog": {
//     "MinimumLevel": {
//       "Default": "Information",
//       "Override": {
//         "Microsoft": "Warning",
//         "System": "Warning"
//       }
//     },
//     "WriteTo": [
//       { "Name": "Console" },
//       {
//         "Name": "File",
//         "Args": {
//           "path": "logs/attendance-.log",
//           "rollingInterval": "Day",
//           "retainedFileCountLimit": 30
//         }
//       },
//       {
//         "Name": "MSSqlServer",
//         "Args": {
//           "connectionString": "Server=.;Database=Logs;Trusted_Connection=True;",
//           "tableName": "Logs",
//           "autoCreateSqlTable": true
//         }
//       }
//     ],
//     "Enrich": ["FromLogContext", "WithMachineName", "WithThreadId"]
//   }
// }

// ============================================================
// Custom Logging Extensions
// ============================================================
public static class DeviceLoggingExtensions
{
    public static void LogDeviceConnected(
        this ILogger logger, string serial, string ip, int port)
    {
        logger.LogInformation(
            "[DEVICE] Connected: {Serial} at {IP}:{Port}", serial, ip, port);
    }

    public static void LogDeviceDisconnected(
        this ILogger logger, string serial, string reason)
    {
        logger.LogWarning(
            "[DEVICE] Disconnected: {Serial} - {Reason}", serial, reason);
    }

    public static void LogAttendanceProcessed(
        this ILogger logger, int employeeId, string status, DateTime timestamp)
    {
        logger.LogInformation(
            "[ATTENDANCE] Employee {EmployeeId} {Status} at {Timestamp:HH:mm:ss}",
            employeeId, status, timestamp);
    }

    public static void LogSyncResult(
        this ILogger logger, string serial, int inserted, int skipped)
    {
        logger.LogInformation(
            "[SYNC] {Serial}: {Inserted} inserted, {Skipped} skipped",
            serial, inserted, skipped);
    }

    public static void LogDeviceError(
        this ILogger logger, string serial, Exception ex)
    {
        logger.LogError(ex, "[ERROR] Device {Serial} error", serial);
    }
}

// ============================================================
// Health Monitoring Service
// ============================================================
public class HealthMonitoringService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HealthMonitoringService> _logger;

    public HealthMonitoringService(
        IServiceProvider serviceProvider,
        ILogger<HealthMonitoringService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await PerformHealthCheckAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Health check failed");
            }

            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
    }

    private async Task PerformHealthCheckAsync()
    {
        using var scope = _serviceProvider.CreateScope();
        var deviceRepo = scope.ServiceProvider.GetRequiredService<IDeviceRepository>();

        var devices = await deviceRepo.GetAllAsync();
        foreach (var device in devices)
        {
            var status = device.Status;
            var lastSync = device.LastSyncedDate;

            if (lastSync.HasValue &&
                DateTime.UtcNow - lastSync.Value > TimeSpan.FromMinutes(30))
            {
                _logger.LogWarning(
                    "[HEALTH] Device {Serial} hasn't synced in {Minutes} minutes",
                    device.SerialNumber,
                    (DateTime.UtcNow - lastSync.Value).TotalMinutes);
            }

            _logger.LogDebug(
                "[HEALTH] Device {Serial}: Status={Status}, LastSync={LastSync}",
                device.SerialNumber, status,
                lastSync?.ToString("yyyy-MM-dd HH:mm:ss") ?? "Never");
        }
    }
}
```

---

## 13. Configuration

### 13.1 appsettings.json

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=AttendanceSystem;Trusted_Connection=True;TrustServerCertificate=True;"
  },
  "DeviceSync": {
    "PollIntervalSeconds": 10,
    "ConnectionTimeoutSeconds": 15,
    "MaxRetryAttempts": 5,
    "RetryDelaySeconds": 30,
    "EnableRealTimeEvents": true,
    "ClearDeviceAfterSync": true
  },
  "Devices": [
    {
      "SerialNumber": "ZKT001",
      "IPAddress": "192.168.1.201",
      "Port": 4370,
      "Password": 0,
      "Location": "Main Entrance"
    },
    {
      "SerialNumber": "ZKT002",
      "IPAddress": "192.168.1.202",
      "Port": 4370,
      "Password": 0,
      "Location": "Office Floor 1"
    }
  ],
  "Attendance": {
    "LateThreshold": "09:15",
    "EarlyLeaveThreshold": "17:00",
    "WorkHoursPerDay": 8
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

### 13.2 Device Configuration Model

```csharp
public class DeviceConfig
{
    public string SerialNumber { get; set; }
    public string IPAddress { get; set; }
    public int Port { get; set; } = 4370;
    public int Password { get; set; } = 0;
    public string Location { get; set; }
    public int PollIntervalMs { get; set; } = 10000;
}

public class DevicesConfig
{
    public List<DeviceConfig> Devices { get; set; } = new();
}

public class AttendanceConfig
{
    public string LateThreshold { get; set; } = "09:15";
    public string EarlyLeaveThreshold { get; set; } = "17:00";
    public int WorkHoursPerDay { get; set; } = 8;

    public TimeSpan GetLateThresholdTime()
    {
        return TimeSpan.Parse(LateThreshold);
    }

    public TimeSpan GetEarlyLeaveThresholdTime()
    {
        return TimeSpan.Parse(EarlyLeaveThreshold);
    }
}
```

### 13.3 Program.cs / Startup.cs

```csharp
// ============================================================
// Program.cs (Minimal API style for .NET 6+)
// ============================================================
var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database
builder.Services.AddDbContext<AttendanceDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")));

// Repositories
builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.AddScoped<IEmployeeRepository, EmployeeRepository>();
builder.Services.AddScoped<IAttendanceRecordRepository, AttendanceRecordRepository>();
builder.Services.AddScoped<IAttendanceSummaryRepository, AttendanceSummaryRepository>();

// Services
builder.Services.AddScoped<IAttendanceService, AttendanceService>();
builder.Services.AddScoped<IDeviceService, DeviceService>();
builder.Services.AddScoped<IDeviceSyncService, DeviceSyncService>();
builder.Services.AddScoped<IEmployeeService, EmployeeService>();

// Event System
builder.Services.AddSingleton<IEventBus, InMemoryEventBus>();
builder.Services.AddScoped<IEventPublisher, EventPublisher>();
builder.Services.AddScoped<IEventHandler<AttendanceRecordedEvent>, AttendanceEventHandler>();
builder.Services.AddScoped<IEventHandler<AttendanceSyncedEvent>, AttendanceEventHandler>();
builder.Services.AddScoped<IEventHandler<DeviceConnectedEvent>, DeviceEventHandler>();
builder.Services.AddScoped<IEventHandler<DeviceDisconnectedEvent>, DeviceEventHandler>();

// Configuration
builder.Services.Configure<DeviceSyncOptions>(
    builder.Configuration.GetSection(DeviceSyncOptions.SectionName));
builder.Services.Configure<DevicesConfig>(
    builder.Configuration.GetSection("Devices"));
builder.Services.Configure<AttendanceConfig>(
    builder.Configuration.GetSection("Attendance"));

// Background Services
builder.Services.AddHostedService<DeviceSyncHostedService>();
builder.Services.AddHostedService<RealTimeEventListenerService>();
builder.Services.AddHostedService<HealthMonitoringService>();

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Middleware
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AttendanceDbContext>();
    context.Database.EnsureCreated();
}

app.Run();
```

---

## 14. Sequence Diagrams

### 14.1 Device Connection Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  Device   │     │   Device     │     │   Sync       │     │   DB    │
│  Bridge   │     │   Service    │     │   Service    │     │         │
└────┬─────┘     └──────┬───────┘     └──────┬───────┘     └────┬────┘
     │                  │                     │                   │
     │  Start Sync      │                     │                   │
     │─────────────────>│                     │                   │
     │                  │                     │                   │
     │                  │  Connect to Device  │                   │
     │                  │────────────────────>│                   │
     │                  │                     │                   │
     │                  │                     │  TCP Connect      │
     │                  │                     │──────────────────>│
     │                  │                     │                   │
     │                  │                     │  Auth Request     │
     │                  │                     │──────────────────>│
     │                  │                     │                   │
     │                  │                     │  Auth Response    │
     │                  │                     │<──────────────────│
     │                  │                     │                   │
     │                  │  Connection OK      │                   │
     │                  │<────────────────────│                   │
     │                  │                     │                   │
     │  Read Users      │                     │                   │
     │─────────────────>│                     │                   │
     │                  │                     │                   │
     │                  │  Get Device Users   │                   │
     │                  │────────────────────>│                   │
     │                  │                     │                   │
     │                  │                     │  Query Users      │
     │                  │                     │──────────────────>│
     │                  │                     │                   │
     │                  │                     │  User List        │
     │                  │                     │<──────────────────│
     │                  │                     │                   │
     │                  │  Users List         │                   │
     │                  │<────────────────────│                   │
     │                  │                     │                   │
     │  Sync Users      │                     │                   │
     │─────────────────>│                     │                   │
     │                  │                     │                   │
     │                  │  Upsert Users       │                   │
     │                  │───────────────────────────────────────>│
     │                  │                     │                   │
     │                  │  Read Attendance    │                   │
     │                  │────────────────────>│                   │
     │                  │                     │                   │
     │                  │                     │  Query Records    │
     │                  │                     │──────────────────>│
     │                  │                     │                   │
     │                  │                     │  Records          │
     │                  │                     │<──────────────────│
     │                  │                     │                   │
     │  Records List    │                     │                   │
     │<─────────────────│                     │                   │
     │                  │                     │                   │
     │  Process Records │                     │                   │
     │─────────────────>│                     │                   │
     │                  │                     │                   │
     │                  │  Insert Records     │                   │
     │                  │───────────────────────────────────────>│
     │                  │                     │                   │
     │                  │  Update Summary     │                   │
     │                  │───────────────────────────────────────>│
     │                  │                     │                   │
     │  Success         │                     │                   │
     │<─────────────────│                     │                   │
     │                  │                     │                   │
```

### 14.2 Real-Time Check-In Flow

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌─────────┐
│  Device   │     │  Bridge  │     │   Event      │     │   DB    │
│  MB2000   │     │ Service  │     │   Bus        │     │         │
└────┬─────┘     └────┬─────┘     └──────┬───────┘     └────┬────┘
     │                │                   │                   │
     │  Face/Finger   │                   │                   │
     │  Detected      │                   │                   │
     │───────────────>│                   │                   │
     │                │                   │                   │
     │  Verify OK     │                   │                   │
     │<───────────────│                   │                   │
     │                │                   │                   │
     │  Attendance    │                   │                   │
     │  Event         │                   │                   │
     │───────────────>│                   │                   │
     │                │                   │                   │
     │                │  Publish Event    │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │                   │  Handle Event     │
     │                │                   │  (Attendance)     │
     │                │                   │──────────────────>│
     │                │                   │                   │
     │                │                   │  Insert Record    │
     │                │                   │──────────────────>│
     │                │                   │                   │
     │                │                   │  Update Summary   │
     │                │                   │──────────────────>│
     │                │                   │                   │
     │                │                   │  Push to Clients  │
     │                │                   │  (WebSocket)      │
     │                │                   │                   │
     │                │                   │                   │
```

### 14.3 Error Recovery Flow

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌─────────┐
│  Device   │     │  Bridge  │     │  Circuit     │     │   Log   │
│  MB2000   │     │ Service  │     │  Breaker     │     │         │
└────┬─────┘     └────┬─────┘     └──────┬───────┘     └────┬────┘
     │                │                   │                   │
     │  Connection    │                   │                   │
     │  Attempt 1     │                   │                   │
     │───────────────>│                   │                   │
     │                │                   │                   │
     │  Timeout       │                   │                   │
     │<───────────────│                   │                   │
     │                │                   │                   │
     │                │  Record Failure   │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │                   │  Count: 1/5       │
     │                │                   │                   │
     │  Wait 2s       │                   │                   │
     │                │                   │                   │
     │  Connection    │                   │                   │
     │  Attempt 2     │                   │                   │
     │───────────────>│                   │                   │
     │                │                   │                   │
     │  Timeout       │                   │                   │
     │<───────────────│                   │                   │
     │                │                   │                   │
     │                │  Record Failure   │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │                   │  Count: 2/5       │
     │                │                   │                   │
     │  Wait 4s       │                   │                   │
     │                │                   │                   │
     │  ... continue until threshold ...  │                   │
     │                │                   │                   │
     │                │  Record Failure   │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │                   │  Count: 5/5       │
     │                │                   │  OPEN CIRCUIT     │
     │                │                   │──────────────────>│
     │                │                   │                   │
     │                │  Circuit Open     │                   │
     │                │  Skip Connection  │                   │
     │                │<──────────────────│                   │
     │                │                   │                   │
     │  Wait 60s      │                   │                   │
     │                │                   │                   │
     │  Recovery      │                   │                   │
     │  Attempt       │                   │                   │
     │───────────────>│                   │                   │
     │                │                   │                   │
     │  Success       │                   │                   │
     │<───────────────│                   │                   │
     │                │                   │                   │
     │                │  Record Success   │                   │
     │                │──────────────────>│                   │
     │                │                   │                   │
     │                │                   │  RESET CIRCUIT    │
     │                │                   │──────────────────>│
```

---

## 15. Scalability Considerations

### 15.1 Multi-Device Scaling

```
┌──────────────────────────────────────────────────────────────┐
│                    Load Balancer                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  App Server 1│   │  App Server 2│   │  App Server 3│
│  (10 devices)│   │  (10 devices)│   │  (10 devices)│
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   SQL Server        │
              │   (Always On AG)    │
              └─────────────────────┘
```

### 15.2 Performance Optimization

| Strategy | Implementation |
|----------|---------------|
| **Connection Pooling** | Reuse device connections across sync cycles |
| **Batch Processing** | Process attendance records in batches of 100 |
| **Async Operations** | Use async/await throughout the stack |
| **Database Indexing** | Index on Timestamp, EmployeeId, DeviceId |
| **Caching** | Cache employee lookups in-memory (IMemoryCache) |
| **Parallel Sync** | Sync multiple devices concurrently with SemaphoreSlim |

### 15.3 Database Optimization

```sql
-- Partition attendance records by month
CREATE PARTITION FUNCTION pf_AttendanceDate (DATE)
AS RANGE RIGHT FOR VALUES (
    '2024-01-01', '2024-02-01', '2024-03-01',
    '2024-04-01', '2024-05-01', '2024-06-01',
    '2024-07-01', '2024-08-01', '2024-09-01',
    '2024-10-01', '2024-11-01', '2024-12-01'
);

CREATE PARTITION SCHEME ps_AttendanceDate
AS PARTITION pf_AttendanceDate ALL TO ([PRIMARY]);

-- Apply partition to AttendanceRecords table
CREATE TABLE AttendanceRecords_Partitioned (
    RecordId INT IDENTITY(1,1),
    EmployeeId INT NOT NULL,
    DeviceId INT NOT NULL,
    Timestamp DATETIME2 NOT NULL,
    -- ... other columns
    CONSTRAINT PK_AttendanceRecords PRIMARY KEY CLUSTERED (RecordId, Timestamp)
) ON ps_AttendanceDate(Timestamp);

-- Archive old data
INSERT INTO AttendanceRecords_Archive
SELECT * FROM AttendanceRecords
WHERE Timestamp < DATEADD(YEAR, -1, GETUTCDATE());

DELETE FROM AttendanceRecords
WHERE Timestamp < DATEADD(YEAR, -1, GETUTCDATE());
```

### 15.4 Horizontal Scaling Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         MESSAGE QUEUE                             │
│                    (RabbitMQ / Azure Service Bus)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ attendance   │  │ user-sync    │  │ device-status│          │
│  │ events       │  │ queue        │  │ queue        │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└──────────────────────────────┬───────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Worker 1    │   │  Worker 2    │   │  Worker 3    │
│  (Process)   │   │  (Process)   │   │  (Process)   │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## 16. Deployment Checklist

### 16.1 Prerequisites

- [ ] SQL Server 2016+ installed and accessible
- [ ] .NET Framework 4.7.2+ or .NET 6.0+ runtime
- [ ] zkemkeeper.dll registered (COM interop)
- [ ] Device network connectivity verified (ping test)
- [ ] Firewall rules configured (port 4370 for devices)
- [ ] Service account with appropriate permissions

### 16.2 Installation Steps

```bash
# 1. Register zkemkeeper.dll (run as Administrator)
regsvr32 zkemkeeper.dll

# 2. Build the solution
dotnet build -c Release

# 3. Run database migrations
dotnet ef database update

# 4. Update connection string in appsettings.json
# 5. Configure device IP addresses in appsettings.json
# 6. Start the application
dotnet run --project AttendanceSystem
```

### 16.3 Verification Steps

```bash
# 1. Test database connection
curl http://localhost:5000/api/health

# 2. Test device connection
curl -X POST http://localhost:5000/api/devices/test \
  -H "Content-Type: application/json" \
  -d '{"IPAddress":"192.168.1.201","Port":4370,"Password":0}'

# 3. Check devices are registered
curl http://localhost:5000/api/devices

# 4. Check employees are synced
curl http://localhost:5000/api/employees

# 5. Check attendance records
curl http://localhost:5000/api/attendance/today
```

### 16.4 Monitoring Setup

| Metric | Threshold | Action |
|--------|-----------|--------|
| Device Connection | > 5 failures | Alert operations |
| Sync Latency | > 30 seconds | Check network |
| Database Size | > 10 GB | Archive old data |
| API Response Time | > 2 seconds | Scale horizontally |
| Memory Usage | > 80% | Check for leaks |

---

## Appendix A: Complete Project Structure

```
AttendanceSystem/
├── src/
│   ├── AttendanceSystem.API/
│   │   ├── Controllers/
│   │   │   ├── AttendanceController.cs
│   │   │   ├── DevicesController.cs
│   │   │   ├── EmployeesController.cs
│   │   │   └── ReportsController.cs
│   │   ├── Program.cs
│   │   └── appsettings.json
│   │
│   ├── AttendanceSystem.Core/
│   │   ├── Entities/
│   │   │   ├── Device.cs
│   │   │   ├── Employee.cs
│   │   │   ├── AttendanceRecord.cs
│   │   │   └── AttendanceSummary.cs
│   │   ├── Interfaces/
│   │   │   ├── IRepository.cs
│   │   │   ├── IDeviceRepository.cs
│   │   │   ├── IEmployeeRepository.cs
│   │   │   ├── IAttendanceRecordRepository.cs
│   │   │   ├── IAttendanceSummaryRepository.cs
│   │   │   ├── IAttendanceService.cs
│   │   │   ├── IDeviceService.cs
│   │   │   ├── IDeviceSyncService.cs
│   │   │   └── IEmployeeService.cs
│   │   ├── DTOs/
│   │   │   ├── AttendanceDto.cs
│   │   │   ├── DeviceDto.cs
│   │   │   ├── EmployeeDto.cs
│   │   │   ├── DashboardStatsDto.cs
│   │   │   └── SyncResultDto.cs
│   │   ├── Events/
│   │   │   ├── Event.cs
│   │   │   ├── AttendanceRecordedEvent.cs
│   │   │   ├── DeviceConnectedEvent.cs
│   │   │   └── IEventHandler.cs
│   │   └── Configuration/
│   │       ├── DeviceConfig.cs
│   │       ├── DeviceSyncOptions.cs
│   │       └── AttendanceConfig.cs
│   │
│   ├── AttendanceSystem.Infrastructure/
│   │   ├── Data/
│   │   │   ├── AttendanceDbContext.cs
│   │   │   └── Migrations/
│   │   ├── Repositories/
│   │   │   ├── Repository.cs
│   │   │   ├── DeviceRepository.cs
│   │   │   ├── EmployeeRepository.cs
│   │   │   ├── AttendanceRecordRepository.cs
│   │   │   └── AttendanceSummaryRepository.cs
│   │   ├── Services/
│   │   │   ├── AttendanceService.cs
│   │   │   ├── DeviceService.cs
│   │   │   ├── DeviceSyncService.cs
│   │   │   └── EmployeeService.cs
│   │   ├── DeviceIntegration/
│   │   │   ├── ZKTecoConnection.cs
│   │   │   ├── DeviceConnectionManager.cs
│   │   │   └── CircuitBreaker.cs
│   │   ├── Events/
│   │   │   ├── InMemoryEventBus.cs
│   │   │   ├── EventPublisher.cs
│   │   │   └── AttendanceEventHandler.cs
│   │   └── BackgroundServices/
│   │       ├── DeviceSyncHostedService.cs
│   │       ├── RealTimeEventListenerService.cs
│   │       └── HealthMonitoringService.cs
│   │
│   └── AttendanceSystem.Web/
│       ├── wwwroot/
│       └── Pages/
│
├── tests/
│   └── AttendanceSystem.Tests/
│       ├── Unit/
│       └── Integration/
│
├── docs/
│   └── deviceIntegration.md  (This document)
│
├── lib/
│   └── zkemkeeper.dll
│
├── AttendanceSystem.sln
└── README.md
```

---

## Appendix B: NuGet Packages

```xml
<ItemGroup>
  <!-- Entity Framework Core -->
  <PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />
  <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />
  <PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="8.0.0" />

  <!-- ASP.NET Core -->
  <PackageReference Include="Microsoft.AspNetCore.Mvc" Version="2.2.0" />
  <PackageReference Include="Swashbuckle.AspNetCore" Version="6.5.0" />

  <!-- Logging -->
  <PackageReference Include="Serilog" Version="3.1.1" />
  <PackageReference Include="Serilog.AspNetCore" Version="7.0.0" />
  <PackageReference Include="Serilog.Sinks.File" Version="5.0.0" />
  <PackageReference Include="Serilog.Sinks.MSSqlServer" Version="6.3.0" />

  <!-- Utilities -->
  <PackageReference Include="AutoMapper" Version="12.0.1" />
  <PackageReference Include="MediatR" Version="12.2.0" />
  <PackageReference Include="Microsoft.Extensions.Caching.Memory" Version="8.0.0" />
</ItemGroup>
```

---

**Document Version:** 1.0
**Last Updated:** July 2026
**Author:** Technical Integration Team
**Status:** Production-Ready
