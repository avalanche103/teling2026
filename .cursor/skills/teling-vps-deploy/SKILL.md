---
name: teling-vps-deploy
description: >-
  Deploy Teling to production VPS without building on the 1GB server. Use when
  deploying, updating prod, uploading .next, syncing images, or restarting
  teling.by /opt/teling.
---

# Teling VPS deploy (project)

Full access notes and credentials live in the personal skill `teling-vps-deploy`
(`~/.cursor/skills/teling-vps-deploy/`). Use that for host/user/key/panel details.

## Hard rule

Do not deploy/restart production unless the user explicitly asks.

## Preferred path (avoid OOM)

VPS has ~1 GB RAM and ~2 GB swap (`/swapfile` + `/swapfile2`). Large product
import uses `scripts/product-import-worker.mjs` (out-of-process streaming) —
do not parse ~100 MB JSON inside Next. **Do not** run `npm run build` or
`start-production.sh` on the server unless 2G+ swap is enabled.

```powershell
npm run build
.\scripts\pack-next-build.ps1
# set VPS_* / NEXT_TAR from personal skill credentials
python .\scripts\upload-next-build.py
```

Uploader: one Paramiko session → SFTP `.next` tar → `node scripts/start-next.cjs`.

## SSH flaky (banner / MaxStartups)

Fail fast, wait 60–90s+ between attempts, do upload+restart in **one** connection.
Do not hammer SSH.

## Code archive (excludes images)

```powershell
.\scripts\prepare-deploy.ps1
.\scripts\upload-prepared-deploy.ps1
```

Still prefer shipping a local `.next` afterward instead of a server rebuild.

## Images

```powershell
.\scripts\sync-images.ps1
# or: .\scripts\sync-images.ps1 -UseScp
```

Deploy archives exclude `public/images` on purpose.

## Restart Next only

Remote:

```bash
cd /opt/teling
ss -ltnp | grep ':10024' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | xargs -r kill
sleep 2
nohup /usr/bin/node scripts/start-next.cjs > next-only.log 2>&1 </dev/null &
```

## Verify

- `https://teling.by/` → 200
- Local on VPS: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:10024/`

## Microinform cron

`09:30 Europe/Minsk` via `scripts/install-microinform-cron.sh` → `microinform-daily-sync.sh`.
Fetch/apply only; pending new SKUs stay for admin (no auto-publish).
