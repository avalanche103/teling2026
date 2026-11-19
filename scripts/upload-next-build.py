#!/usr/bin/env python3
"""Upload a packed .next tar to the Teling VPS and start Next without a server build.

Requires: pip install paramiko

Env:
  VPS_HOST   (default 134.17.16.134)
  VPS_USER   (default user)
  VPS_KEY    (default ~/.ssh/id_ed25519_teling)
  VPS_PASS   (optional fallback if key missing/fails)
  NEXT_TAR   (default %TEMP%/teling-next-build.tar.gz)
  VPS_APP    (default /opt/teling)

Pack first:  .\\scripts\\pack-next-build.ps1
"""
from __future__ import annotations

import os
import sys
import time

try:
    import paramiko
except ImportError:
    raise SystemExit("paramiko missing — run: python -m pip install paramiko")

HOST = os.environ.get("VPS_HOST", "134.17.16.134")
USER = os.environ.get("VPS_USER", "user")
PASS = os.environ.get("VPS_PASS")
KEY = os.environ.get("VPS_KEY", os.path.expanduser("~/.ssh/id_ed25519_teling"))
LOCAL = os.environ.get(
    "NEXT_TAR",
    os.path.join(os.environ.get("TEMP", "/tmp"), "teling-next-build.tar.gz"),
)
REMOTE_TAR = "/tmp/teling-next-build.tar.gz"
APP = os.environ.get("VPS_APP", "/opt/teling")


def connect(retries: int = 24, delay: float = 90.0) -> paramiko.SSHClient:
    """Fail fast on banner; wait long between tries so MaxStartups can drain."""
    last: Exception | None = None
    for i in range(1, retries + 1):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            print(f"connect attempt {i}/{retries}...", flush=True)
            kwargs: dict = {
                "hostname": HOST,
                "port": 22,
                "username": USER,
                "timeout": 12,
                "banner_timeout": 15,
                "auth_timeout": 20,
                "allow_agent": False,
                "look_for_keys": False,
            }
            if os.path.isfile(KEY):
                kwargs["key_filename"] = KEY
            elif PASS:
                kwargs["password"] = PASS
            else:
                raise SystemExit(f"No key at {KEY} and VPS_PASS not set")
            client.connect(**kwargs)
            print("connected", flush=True)
            return client
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"fail: {type(e).__name__}: {e}", flush=True)
            try:
                client.close()
            except Exception:
                pass
            if i < retries:
                time.sleep(delay)
    raise SystemExit(f"SSH failed after {retries}: {last}")


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 240) -> int:
    print(f"$ {cmd[:100]}{'...' if len(cmd) > 100 else ''}", flush=True)
    _stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip(), flush=True)
    if err.strip():
        print(err.rstrip(), file=sys.stderr, flush=True)
    return code


def main() -> None:
    if not os.path.isfile(LOCAL):
        raise SystemExit(f"missing archive: {LOCAL} — run scripts/pack-next-build.ps1")
    size_mb = os.path.getsize(LOCAL) / (1024 * 1024)
    print(f"local archive {LOCAL} ({size_mb:.1f} MB)", flush=True)

    client = connect()
    try:
        run(client, "free -m | head -2; ss -ltnp | grep -E '10024|5050' || true")

        print("sftp upload...", flush=True)
        t0 = time.time()
        sftp = client.open_sftp()
        try:
            last_pct = -1

            def cb(transferred: int, total: int) -> None:
                nonlocal last_pct
                if total <= 0:
                    return
                pct = int(transferred * 100 / total)
                if pct >= last_pct + 10 or pct == 100:
                    last_pct = pct
                    print(f"  {pct}%", flush=True)

            sftp.put(LOCAL, REMOTE_TAR, callback=cb)
        finally:
            sftp.close()
        print(f"upload done in {time.time() - t0:.1f}s", flush=True)

        cmds = f"""
set -e
cd {APP}
test -f {REMOTE_TAR}
ls -lh {REMOTE_TAR}
pids=$(ss -ltnp 2>/dev/null | sed -n 's/.*:10024.*pid=\\([0-9]*\\).*/\\1/p' | sort -u)
if [ -n "$pids" ]; then kill $pids || true; sleep 2; fi
rm -rf .next.bak
if [ -d .next ]; then mv .next .next.bak; fi
tar -xzf {REMOTE_TAR} -C {APP}
test -f .next/BUILD_ID
echo BUILD_ID=$(cat .next/BUILD_ID)
rm -f {REMOTE_TAR}
nohup /usr/bin/node scripts/start-next.cjs > next-only.log 2>&1 </dev/null &
sleep 6
ss -ltnp | grep 10024 || true
curl -s -o /dev/null -w 'local:%{{http_code}}\\n' http://127.0.0.1:10024/ || true
tail -n 40 next-only.log || true
"""
        code = run(client, cmds, timeout=240)
        if code != 0:
            raise SystemExit(f"remote cmds failed: {code}")
        print("OK", flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
