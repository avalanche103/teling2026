const { spawn } = require("node:child_process");
const path = require("node:path");

const port = process.env.PORT && process.env.PORT.trim() ? process.env.PORT.trim() : "10024";
const host = process.env.HOST && process.env.HOST.trim() ? process.env.HOST.trim() : "127.0.0.1";
const nextBin = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next");

// VPS has ~1GB RAM; product import parses ~100MB JSON and needs a larger heap.
const env = { ...process.env };
if (!env.NODE_OPTIONS || !env.NODE_OPTIONS.includes("max-old-space-size")) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--max-old-space-size=768"].filter(Boolean).join(" ");
}

const child = spawn(process.execPath, [nextBin, "start", "-H", host, "-p", port], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
