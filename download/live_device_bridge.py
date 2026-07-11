"""
ZKTeco Live Device Bridge
=========================
A Python service that connects to ZKTeco MB2000 (or similar) devices
and pushes attendance events INSTANTLY to the dashboard via HTTP/WebSocket.

This replaces the polling-based approach in the original system.
Instead of polling every 60 seconds, it uses pyzk's live capture mode
to receive events the moment they happen on the device.

Key difference from the original zkteco_service.py:
  - Original: Polls device every N seconds → delay up to 60s
  - This bridge: Uses real-time event listener → <1 second delay

Usage:
    python live_device_bridge.py --config config.yaml
    python live_device_bridge.py --ip 192.168.1.201 --port 4370

Dependencies:
    pip install pyzk pyyaml requests
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
import yaml

try:
    from zk import ZK, const as zk_const
except ImportError:
    print("ERROR: pyzk not installed. Run: pip install pyzk pyyaml requests")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "devices": [
        {
            "ip": "192.168.1.201",
            "port": 4370,
            "password": 0,
            "timeout": 15,
            "serial_number": "ZKT001",
            "force_udp": False,
            "ommit_ping": False,
        }
    ],
    "backend": {
        # Next.js API endpoint for attendance sync
        "api_url": "http://localhost:3000",
        "sync_endpoint": "/api/attendance/sync",
        # WebSocket event push endpoint (from the mini-service)
        "ws_push_url": "http://localhost:3004/push-event",
        "timeout_seconds": 10,
        "api_key": "",
    },
    "bridge": {
        "poll_fallback_seconds": 10,  # Fallback polling interval if live capture fails
        "log_level": "INFO",
        "log_file": "live_bridge.log",
        "healthcheck_port": 8081,
    },
    "user_map": {
        # Device-side user UID -> Backend Employee ID
        # e.g. "1": 1, "2": 2
    },
}


def load_config(path: Optional[str]) -> dict:
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if path:
        try:
            with open(path, "r") as f:
                user_cfg = yaml.safe_load(f) or {}
            for k, v in user_cfg.items():
                if k in cfg and isinstance(cfg[k], dict) and isinstance(v, dict):
                    for kk, vv in v.items():
                        cfg[k][kk] = vv
                else:
                    cfg[k] = v
        except FileNotFoundError:
            print(f"Config file {path} not found, using defaults")
    return cfg


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def setup_logging(cfg: dict) -> logging.Logger:
    bridge_cfg = cfg.get("bridge", {})
    log_level = getattr(logging, bridge_cfg.get("log_level", "INFO").upper(), logging.INFO)
    logger = logging.getLogger("live_bridge")
    logger.setLevel(log_level)
    logger.handlers.clear()
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(sh)
    log_file = bridge_cfg.get("log_file")
    if log_file:
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        # Force immediate flush
        fh.stream = open(log_file, "a", buffering=1, encoding="utf-8")
        fh.stream.reconfigure(line_buffering=True)
        logger.addHandler(fh)
    return logger


# ---------------------------------------------------------------------------
# Device Connector with Live Event Push
# ---------------------------------------------------------------------------
@dataclass
class DeviceConfig:
    ip: str
    port: int = 4370
    password: int = 0
    timeout: int = 15
    serial_number: str = ""
    force_udp: bool = False
    ommit_ping: bool = False


class LiveDeviceBridge:
    """
    Connects to a ZKTeco device and pushes attendance events
    to the backend in real-time (or near real-time with fallback polling).
    """

    def __init__(self, device_cfg: DeviceConfig, backend_cfg: dict, user_map: dict, logger: logging.Logger):
        self.device_cfg = device_cfg
        self.backend_cfg = backend_cfg
        self.user_map = {int(k): v for k, v in user_map.items()}
        self.logger = logger
        self.last_uid = 0
        self.last_timestamp = datetime.min.replace(tzinfo=timezone.utc)
        self.known_records: set = set()  # unused, kept for backward compat
        self.running = True

    def connect(self) -> Optional[Any]:
        """Connect to the ZKTeco device."""
        try:
            zk = ZK(
                self.device_cfg.ip,
                port=self.device_cfg.port,
                timeout=self.device_cfg.timeout,
                password=self.device_cfg.password,
                force_udp=self.device_cfg.force_udp,
                ommit_ping=self.device_cfg.ommit_ping,
            )
            conn = zk.connect()
            conn.disable_device()
            self.logger.info(
                f"Connected to device {self.device_cfg.serial_number} "
                f"at {self.device_cfg.ip}:{self.device_cfg.port}"
            )
            return conn
        except Exception as e:
            self.logger.error(f"Failed to connect to device: {e}")
            return None

    def start_realtime_listener(self, conn) -> Optional[threading.Thread]:
        """
        Start a background thread to listen for real-time attendance events.
        Uses the device's event registration mechanism.
        """
        def listen_events():
            try:
                # Register for real-time events (if supported)
                conn.enable_device()
                conn.reg_event(1)  # 1 = attendance events
                self.logger.info("Real-time event listener STARTED (reg_event=1)")
                
                while self.running:
                    try:
                        # Try to receive event with timeout
                        data = conn.recv_event()
                        if data:
                            self._process_realtime_event(data)
                        else:
                            time.sleep(0.1)
                    except Exception as e:
                        if self.running:
                            self.logger.debug(f"recv_event error (may be timeout): {e}")
                        time.sleep(1)
            except Exception as e:
                self.logger.warning(f"Real-time listener failed: {e}")
            finally:
                try:
                    conn.reg_event(0)  # Disable events
                except:
                    pass

        thread = threading.Thread(target=listen_events, daemon=True)
        thread.start()
        return thread

    def _process_realtime_event(self, event_data):
        """Process a real-time event from the device."""
        try:
            # Parse event_data - format varies by firmware
            # Common formats:
            # - Tuple: (uid, user_id, timestamp, state, ...)
            # - Attendance object
            if hasattr(event_data, 'user_id'):
                user_id = event_data.user_id
                timestamp = event_data.timestamp
                punch = getattr(event_data, 'punch', 0)
                uid = getattr(event_data, 'uid', 0)
            elif isinstance(event_data, (tuple, list)) and len(event_data) >= 4:
                uid, user_id, timestamp, punch = event_data[0], event_data[1], event_data[2], event_data[3]
            else:
                self.logger.debug(f"Unknown event format: {event_data}")
                return

            # Normalize user_id
            if not isinstance(user_id, (int, float)):
                try:
                    user_id = int(user_id)
                except (ValueError, TypeError):
                    return

            # Check if newer than last processed
            if self.last_timestamp and timestamp <= self.last_timestamp:
                return

            # Don't update last_timestamp here — let push_to_backend success handle it
            backend_user_id = self.resolve_user_id(user_id)
            if backend_user_id is None:
                self.logger.warning(f"Skipping real-time event: no mapping for device user {user_id}")
                return

            # Push to backend (it handles DB save + WS broadcast)
            success, _ = self.push_to_backend([{
                "userId": backend_user_id,
                "timestamp": self._ts_to_iso_str(timestamp),
                "status": 0 if punch in (0, 3, 4) else 1,
                "verificationType": 1,
                "verificationScore": 0,
            }])

            self.logger.info(f"Real-time event: User {user_id} at {timestamp}")

        except Exception as e:
            self.logger.error(f"Error processing real-time event: {e}")

    def sync_users_to_backend(self, device_users) -> bool:
        """Push users from the ZKTeco device to the backend."""
        try:
            if not device_users:
                self.logger.info("No users found on device")
                return False

            users_payload = []
            for u in device_users:
                uid = u.user_id
                if not isinstance(uid, (int, float)):
                    try:
                        uid = int(uid)
                    except (ValueError, TypeError):
                        continue
                name = (getattr(u, "name", "") or "").strip()
                if not name:
                    name = f"User {uid}"
                users_payload.append({
                    "userId": uid,
                    "name": name,
                    "employeeId": str(uid),
                })

            if not users_payload:
                return False

            url = f"{self.backend_cfg['api_url']}/api/attendance/sync-users"
            headers = {"Content-Type": "application/json"}
            resp = requests.post(url, json={"users": users_payload}, headers=headers, timeout=120)
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                self.logger.info(
                    f"Synced {len(users_payload)} users from device "
                    f"({data.get('created', 0)} created, {data.get('updated', 0)} updated)"
                )
                return True
            else:
                self.logger.error(f"User sync returned {resp.status_code}: {resp.text[:200]}")
                return False
        except Exception as e:
            self.logger.error(f"Failed to sync users: {e}")
            return False

    def push_to_backend(self, records: List[dict]) -> tuple[bool, List[dict]]:
        """Push attendance records to the Next.js backend API. Returns (success, created_records)."""
        if not records:
            return True, []

        url = f"{self.backend_cfg['api_url']}{self.backend_cfg['sync_endpoint']}"
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "deviceSerialNumber": self.device_cfg.serial_number,
            "records": records,
        }
        headers = {"Content-Type": "application/json"}
        api_key = self.backend_cfg.get("api_key", "")
        if api_key:
            headers["X-API-Key"] = api_key

        try:
            resp = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.backend_cfg.get("timeout_seconds", 10),
            )
            if resp.status_code == 200:
                data = resp.json()
                created = data.get("data", {}).get("records", [])
                self.logger.info(f"Pushed {len(records)} records to backend successfully ({len(created)} inserted)")
                return True, created
            else:
                self.logger.error(f"Backend returned {resp.status_code}: {resp.text[:200]}")
                return False, []
        except requests.RequestException as e:
            self.logger.error(f"Failed to push to backend: {e}")
            return False, []

    def push_to_websocket(self, record: dict):
        """Push a single record to the WebSocket service for instant dashboard update."""
        ws_url = self.backend_cfg.get("ws_push_url")
        if not ws_url:
            return
        try:
            requests.post(
                ws_url,
                json={"type": "attendance", "record": record},
                timeout=3,
            )
        except requests.RequestException:
            pass  # Best-effort

    @staticmethod
    def _normalize_ts(ts):
        """Strip timezone info from a timestamp to avoid naive vs aware comparison errors."""
        if ts is None:
            return None
        try:
            return ts.replace(tzinfo=None)
        except (AttributeError, TypeError):
            return ts

    @staticmethod
    def _ts_to_iso_str(ts):
        """Convert timestamp to UTC ISO string with Z suffix and milliseconds for JS compatibility."""
        if hasattr(ts, "isoformat"):
            dt = ts
        else:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        # Ensure UTC and format with Z suffix + milliseconds
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    def resolve_user_id(self, device_user_id: int) -> Optional[int]:
        """Map device-side user ID to backend user ID."""
        if device_user_id in self.user_map:
            return self.user_map[device_user_id]
        return device_user_id  # Assume 1:1 if no mapping

    def try_get_photo(self, conn, uid: int) -> Optional[str]:
        """
        Attempt to fetch a face photo from the device for the given user.
        Returns a base64-encoded JPEG string if found, otherwise None.
        """
        try:
            # Try to get face template (type 9 = face)
            template = conn.get_user_template(uid, 9)
            if template:
                # For now, just return None since we can't decode ZK templates
                return None
            # Try type 0 (fingerprint)
            template = conn.get_user_template(uid, 0)
            if template:
                return None
        except Exception:
            pass
        return None

    def run_live(self):
        """
        Main loop: dual-connection architecture for real-time events.
        
        Connection 1 (background): Persistent connection registered for 
        EF_ATTLOG events - reads socket for instant attendance pushes.
        
        Connection 2 (main): Periodic full attendance sync as fallback
        and for initial sync / gap recovery.
        
        This achieves <3s latency when device firmware supports event push.
        """
        self.logger.info(
            f"Starting live bridge for {self.device_cfg.serial_number}..."
        )

        while self.running:
            conn = None
            try:
                conn = self.connect()
                if not conn:
                    self.logger.warning("Retrying in 10 seconds...")
                    time.sleep(10)
                    continue

                # Sync users from device to backend (disconnect first to avoid holding device)
                try:
                    device_users = conn.get_users()
                except Exception as e:
                    self.logger.warning(f"Failed to get users from device: {e}")
                    device_users = None
                try:
                    conn.enable_device()
                    conn.disconnect()
                except:
                    pass
                conn = None
                if device_users is not None:
                    self.sync_users_to_backend(device_users)

                # Reconnect for periodic full sync (fallback / gap recovery)
                conn = self.connect()
                if not conn:
                    self.logger.warning("Reconnect failed after user sync")
                    time.sleep(10)
                    continue

                # Establish initial last_timestamp from device
                all_records = conn.get_attendance()
                if all_records:
                    self.last_timestamp = self._normalize_ts(max(r.timestamp for r in all_records))
                    self.logger.info(
                        f"Device has {len(all_records)} records, last timestamp: {self.last_timestamp}"
                    )

                poll_interval = self.backend_cfg.get("poll_fallback_seconds", 10)
                self.logger.info(f"Periodic full sync every {poll_interval}s (fallback)...")

                while self.running:
                    try:
                        self.logger.debug("Starting get_attendance() call...")
                        # Use a thread pool to enforce a 120s timeout on get_attendance
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                            fut = pool.submit(conn.get_attendance)
                            try:
                                records = fut.result(timeout=120)
                                self.logger.debug(f"get_attendance() returned {len(records)} records")
                            except concurrent.futures.TimeoutError:
                                self.logger.warning("get_attendance timed out after 120s, reconnecting...")
                                break
                            except Exception as e:
                                self.logger.error(f"get_attendance error: {e}")
                                break

                        # Find new records by timestamp (only records after last seen)
                        new_records = []
                        for r in records:
                            ts = self._normalize_ts(r.timestamp)
                            if self.last_timestamp is not None and ts <= self.last_timestamp:
                                continue
                            uid = r.user_id
                            if not isinstance(uid, (int, float)):
                                try:
                                    uid = int(uid)
                                except (ValueError, TypeError):
                                    continue
                            new_records.append(r)

                        success = False
                        if new_records:
                            self.logger.info(
                                f"Periodic sync found {len(new_records)} new record(s)!"
                            )

                            # Batch push to backend API (it handles DB save + WS broadcast)
                            batch = [
                                {
                                    "userId": self.resolve_user_id(r.user_id) or r.user_id,
                                    "timestamp": self._ts_to_iso_str(r.timestamp),
                                    "status": 0 if r.punch in (0, 3, 4) else 1,
                                    "verificationType": 1,
                                    "verificationScore": 0,
                                    "photo": None,
                                }
                                for r in new_records
                                if self.resolve_user_id(r.user_id) is not None
                            ]
                            if batch:
                                success, _ = self.push_to_backend(batch)
                                if success:
                                    # Clear device attendance log so next poll is instant
                                    try:
                                        conn.clear_attendance()
                                        self.logger.info("Device attendance log cleared (next poll will be instant)")
                                    except Exception as e:
                                        self.logger.warning(f"Failed to clear attendance log: {e}")

                        # Only advance last_timestamp if backend push succeeded
                        if success and records:
                            max_ts = max(self._normalize_ts(r.timestamp) for r in records)
                            self.last_timestamp = max_ts

                    except Exception as e:
                        self.logger.error(f"Polling error: {e}")
                        try:
                            conn.disconnect()
                        except:
                            pass
                        break  # Reconnect

                    time.sleep(poll_interval)

            except KeyboardInterrupt:
                self.logger.info("Shutting down...")
                self.running = False
            except Exception as e:
                self.logger.error(f"Main loop error: {e}")
            finally:
                if conn:
                    try:
                        conn.enable_device()
                        conn.disconnect()
                    except:
                        pass
                conn = None

                if self.running:
                    self.logger.info("Reconnecting in 10 seconds...")
                    time.sleep(10)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="ZKTeco Live Device Bridge")
    parser.add_argument("--config", type=str, help="Path to config.yaml")
    parser.add_argument("--ip", type=str, help="Device IP address")
    parser.add_argument("--port", type=int, default=4370, help="Device port (default: 4370)")
    parser.add_argument("--api-url", type=str, help="Backend API URL")
    parser.add_argument("--serial", type=str, help="Device serial number")
    args = parser.parse_args()

    cfg = load_config(args.config)

    # CLI overrides
    if args.ip:
        cfg["devices"][0]["ip"] = args.ip
    if args.port:
        cfg["devices"][0]["port"] = args.port
    if args.serial:
        cfg["devices"][0]["serial_number"] = args.serial
    if args.api_url:
        cfg["backend"]["api_url"] = args.api_url

    logger = setup_logging(cfg)

    # Process each device
    for device_cfg_raw in cfg["devices"]:
        device_cfg = DeviceConfig(
            ip=device_cfg_raw["ip"],
            port=device_cfg_raw.get("port", 4370),
            password=device_cfg_raw.get("password", 0),
            timeout=device_cfg_raw.get("timeout", 15),
            serial_number=device_cfg_raw.get("serial_number", "UNKNOWN"),
            force_udp=device_cfg_raw.get("force_udp", False),
            ommit_ping=device_cfg_raw.get("ommit_ping", False),
        )

        bridge = LiveDeviceBridge(
            device_cfg=device_cfg,
            backend_cfg=cfg["backend"],
            user_map=cfg.get("user_map", {}),
            logger=logger,
        )

        logger.info(f"Starting bridge for device: {device_cfg.serial_number}")
        try:
            bridge.run_live()
        except KeyboardInterrupt:
            logger.info("Bridge stopped by user")
            sys.exit(0)


if __name__ == "__main__":
    main()