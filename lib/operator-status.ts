// In-memory heartbeat — considered online if pinged within THRESHOLD_MS
let lastHeartbeat = 0;
const THRESHOLD_MS = 600_000; // 10 minutes

export function updateHeartbeat(): void {
  lastHeartbeat = Date.now();
}

export function isOperatorOnline(): boolean {
  return lastHeartbeat > 0 && Date.now() - lastHeartbeat < THRESHOLD_MS;
}
