import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const configPath = new URL("../src/config.js", import.meta.url).href;
const baseEnv = {
  ...process.env,
  DISCORD_TOKEN: "test-token",
  CLIENT_ID: "123456789012345678",
  LAVALINK_PASSWORD: "a-test-secret-that-is-not-the-default",
};

function loadConfig(overrides = {}) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `import(${JSON.stringify(configPath)}).then(({config}) => console.log(JSON.stringify(config.lavalink)))`],
    {
      encoding: "utf8",
      env: { ...baseEnv, ...overrides },
    },
  );
}

test("loads valid Lavalink configuration", () => {
  const result = loadConfig();
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout.trim());
  assert.equal(config.password, baseEnv.LAVALINK_PASSWORD);
  assert.equal(config.port, 2333);
  assert.equal(config.searchPlatform, "scsearch");
});

test("rejects the known example password", () => {
  const result = loadConfig({ LAVALINK_PASSWORD: "youshallnotpass" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /insecure example value/i);
});

test("rejects an invalid port", () => {
  const result = loadConfig({ LAVALINK_PORT: "70000" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /valid TCP port/i);
});

test("rejects missing Discord credentials", () => {
  const result = loadConfig({ DISCORD_TOKEN: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DISCORD_TOKEN/);
});
