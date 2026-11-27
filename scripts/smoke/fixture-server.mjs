import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { fixturePhotoEnv } from "./photo-scanner.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function startFixtureServer({ demo = false } = {}) {
  await access(new URL("../../.next/BUILD_ID", import.meta.url)).catch(() => {
    throw new Error("Run npm run build before starting the local fixture.");
  });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise((resolve) => reservation.close(resolve));
  const origin = "http://localhost:" + port;
  const session = randomBytes(32).toString("hex");
  const helperSession = randomBytes(32).toString("hex");
  const server = spawn(
    process.execPath,
    [
      "--import", "./scripts/smoke/transport.mjs", "node_modules/next/dist/bin/next",
      "start", "--hostname", "127.0.0.1", "--port", String(port),
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        DATABASE_URL: "postgresql://fixture:fixture@ep-fixture.invalid/ward_smoke",
        SMOKE_ORIGIN: origin,
        SMOKE_SESSION: session,
        SMOKE_HELPER_SESSION: helperSession,
        SMOKE_MATCH_DISCUSSION: demo ? "1" : "",
        // Leave provider credentials outside the local fixture.
        RIOT_API_KEY: "fixture-only",
        __NEXT_PROCESSED_ENV: "true",
        CRON_SECRET: "",
        RESEND_API_KEY: "",
        BLOB_READ_WRITE_TOKEN: "",
        ...fixturePhotoEnv,
        VERCEL_ENV: "development",
        DUO_MATCHING_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let startupError;
  server.on("error", error => { startupError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", chunk => { output = (output + chunk).slice(-6000); });
  }
  async function stop() {
    if (server.exitCode !== null || server.signalCode !== null || !server.pid) return;
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const kill = setTimeout(() => server.kill("SIGKILL"), 3500);
    kill.unref();
    try { await exited; } finally { clearTimeout(kill); }
  }
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (startupError) throw startupError;
      if (server.exitCode !== null || server.signalCode !== null) throw new Error("Local production server exited");
      if (/Ready in|Ready on/.test(output)) {
        return { origin, port, session, helperSession, stop, output: () => output };
      }
      await delay(100);
    }
    throw new Error("Local production server startup timed out");
  } catch (error) {
    await stop();
    throw new Error(error.message + (output ? "\n" + output : ""), { cause: error });
  }
}
