import { spawnSync } from "node:child_process";

const env = { ...process.env, ZEABUR_BUILD: "1" };

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["scripts/with-app-env.mjs", "vite", "build"]);
run(process.execPath, ["scripts/migrate.mjs"]);
