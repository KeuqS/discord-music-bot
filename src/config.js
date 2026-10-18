import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  guildId: process.env.GUILD_ID,
  lavalink: {
    host: process.env.LAVALINK_HOST ?? "localhost",
    port: Number(process.env.LAVALINK_PORT ?? 2333),
    password: process.env.LAVALINK_PASSWORD ?? "youshallnotpass",
    secure: process.env.LAVALINK_SECURE === "true",
    searchPlatform: process.env.LAVALINK_SEARCH_PLATFORM ?? "scsearch",
  },
};
