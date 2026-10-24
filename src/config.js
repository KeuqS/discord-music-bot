import "dotenv/config";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const lavalinkPassword = required("LAVALINK_PASSWORD");
if (lavalinkPassword === "youshallnotpass") {
  throw new Error("LAVALINK_PASSWORD is the insecure example value. Set a unique secret in .env.");
}

const lavalinkPort = Number(process.env.LAVALINK_PORT ?? 2333);
if (!Number.isInteger(lavalinkPort) || lavalinkPort < 1 || lavalinkPort > 65535) {
  throw new Error("LAVALINK_PORT must be a valid TCP port (1-65535).");
}

const dashboardPort = Number(process.env.DASHBOARD_PORT ?? 3000);
if (!Number.isInteger(dashboardPort) || dashboardPort < 1 || dashboardPort > 65535) {
  throw new Error("DASHBOARD_PORT must be a valid TCP port (1-65535).");
}

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: process.env.GUILD_ID,
  lavalink: {
    host: process.env.LAVALINK_HOST ?? "localhost",
    port: lavalinkPort,
    password: lavalinkPassword,
    secure: process.env.LAVALINK_SECURE === "true",
    searchPlatform: process.env.LAVALINK_SEARCH_PLATFORM ?? "scsearch",
  },
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== "false",
    host: process.env.DASHBOARD_HOST ?? "0.0.0.0",
    port: dashboardPort,
    user: process.env.DASHBOARD_USER ?? "admin",
    password: process.env.DASHBOARD_PASSWORD?.trim() ?? "",
  },
};
