// macOS filesystem/signature/process integration with tiny signed fixture apps.
// This exercises the actual standalone helper, not a production upgrade claim.
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
if (process.platform !== "darwin") throw new Error("macOS integration only");
const [helper, metadataPath] = process.argv
  .slice(2)
  .map((path) => resolve(path));
assert.ok(
  process.env.SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY,
  "matching test private key required",
);
const directory = await realpath(
  await mkdtemp(join(tmpdir(), "songloft-helper-integration-")),
);
const dataRoot = join(directory, "隔离 Profile=GUI");
await mkdir(dataRoot);
const receipt = join(dataRoot, "launch-receipt");
const build = JSON.parse(await readFile(metadataPath, "utf8"));
assert.equal(build.channel, "dev", "use an isolated test-signed dev helper");
const previous = { ...build, version: "1.0.0" };
const candidate = {
  ...build,
  version: "1.0.1",
  builtAt: new Date().toISOString(),
};

const run = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, SONGLOFT_DESKTOP_DATA_ROOT: dataRoot },
  });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.error}`);
};
async function appLaunches(marker) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const observed = await readFile(receipt, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (observed === marker) return;
    await delay(150);
  }
  assert.fail(
    `Expected version ${marker} to relaunch in the selected data root`,
  );
}
async function application(name, marker, metadata) {
  const app = join(directory, name);
  await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
  await mkdir(join(app, "Contents", "Resources", "songloft"), {
    recursive: true,
  });
  const source = join(directory, `${marker}.c`);
  await writeFile(
    source,
    `
    #include <stdio.h>
    #include <stdlib.h>
    int main(void) {
      const char *root = getenv("SONGLOFT_DESKTOP_DATA_ROOT");
      if (!root) return 1;
      char path[4096];
      if (snprintf(path, sizeof(path), "%s/launch-receipt", root) >= sizeof(path)) return 2;
      FILE *receipt = fopen(path, "w");
      if (!receipt) return 3;
      fputs("${marker}", receipt);
      return fclose(receipt);
    }
  `,
  );
  run("/usr/bin/clang", [
    "-arch",
    build.target === "darwin-x64" ? "x86_64" : "arm64",
    source,
    "-o",
    join(app, "Contents", "MacOS", "Fixture"),
  ]);
  await writeFile(
    join(app, "Contents", "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.songloft.update.fixture.${process.pid}</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${metadata.version}</string><key>LSUIElement</key><true/></dict></plist>`,
  );
  await writeFile(
    join(app, "Contents", "Resources", "songloft", "build-info.json"),
    JSON.stringify(metadata),
  );
  await writeFile(join(app, "Contents", "Resources", "marker"), marker);
  run("/usr/bin/codesign", ["--force", "--sign", "-", app]);
  return app;
}
const current = await application("Current.app", "old", previous);
const next = await application("Next.app", "new", candidate);
const asset = join(directory, "application.zip");
run("/usr/bin/ditto", ["-c", "-k", "--keepParent", next, asset]);
const metadata = join(directory, "build-info.json");
const manifest = join(directory, "manifest.json");
async function signCandidate(buildMetadata) {
  await writeFile(metadata, JSON.stringify(buildMetadata));
  run(process.execPath, [
    resolve(import.meta.dirname, "../scripts/sign-update.mjs"),
    metadata,
    asset,
    "https://fixture.invalid/application.zip",
    manifest,
  ]);
}
const backupDirectory = join(directory, "backup"),
  data = join(directory, "data");
await mkdir(backupDirectory);
await mkdir(data);
const old = Buffer.from("matching pre-migration fixture database");
await writeFile(join(backupDirectory, "songloft.db"), old);
await writeFile(join(data, "songloft.db"), old);
const backup = join(backupDirectory, "backup.json");
await writeFile(
  backup,
  JSON.stringify({
    schema: 1,
    database: join(data, "songloft.db"),
    version: previous.version,
    backendSha: previous.backendSha,
    files: [
      {
        name: "songloft.db",
        sha256: createHash("sha256").update(old).digest("hex"),
      },
    ],
  }),
);
const args = [
  "-manifest",
  manifest,
  "-asset",
  asset,
  "-app",
  current,
  "-parent",
  "2147483647",
  "-channel",
  "dev",
  "-version",
  previous.version,
  "-client-sha",
  previous.clientSha,
  "-backup",
  backup,
];
await signCandidate({ ...candidate, version: "1.0.2" });
const rejected = spawnSync(helper, args, {
  env: { ...process.env, SONGLOFT_DESKTOP_DATA_ROOT: dataRoot },
});
assert.equal(rejected.status, 1);
assert.match(
  await readFile(join(directory, "install.log"), "utf8"),
  /packaged application identity does not match signed manifest/,
);
assert.equal(
  await readFile(join(directory, "last-install-failure"), "utf8"),
  "1\n",
);
await appLaunches("old");
assert.equal(await readFile(join(data, "songloft.db"), "utf8"), old.toString());
assert.ok(!(await readdir(directory)).includes("Current.previous.app"));

await signCandidate(candidate);
run(helper, args);
await appLaunches("new");
assert.ok(!(await readdir(directory)).includes("last-install-failure"));
assert.equal(
  await readFile(join(current, "Contents/Resources/marker"), "utf8"),
  "new",
);
assert.ok((await readdir(directory)).includes("Current.previous.app"));
await writeFile(join(data, "songloft.db"), "failed migrated fixture database");
await writeFile(join(data, "songloft.db-wal"), "failed WAL");
run(helper, ["-rollback", ...args]);
await appLaunches("old");
assert.equal(
  await readFile(join(current, "Contents/Resources/marker"), "utf8"),
  "old",
);
assert.equal(await readFile(join(data, "songloft.db"), "utf8"), old.toString());
assert.ok(
  (await readdir(data)).some((name) => name.startsWith("migration-failed-")),
);
assert.ok(
  (await readdir(directory)).some((name) => name.startsWith("Current.failed-")),
);
console.log(
  JSON.stringify({
    result: "pass",
    rejectedCandidateRelaunchedPreviousApp: true,
    signedInstall: true,
    matchingRecovery: true,
    dataRootPreservedOnBothLaunches: true,
    failedFilesRetained: true,
    evidence: directory,
  }),
);
