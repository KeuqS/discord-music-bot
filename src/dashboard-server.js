import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "web");
const sessions = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("İstek gövdesi çok büyük."));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Geçersiz JSON."));
      }
    });
    request.on("error", reject);
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function authSession(request) {
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return sessions.get(header.slice(7)) ?? null;
}

function stateForPlayer(player) {
  if (!player) return { connected: false, playing: false, paused: false, queue: [] };
  const current = player.queue?.current;
  const tracks = player.queue?.tracks ?? [];
  return {
    connected: Boolean(player.connected),
    playing: Boolean(player.playing),
    paused: Boolean(player.paused),
    volume: player.volume ?? 80,
    voiceChannelId: player.voiceChannelId ?? null,
    textChannelId: player.textChannelId ?? null,
    current: current
      ? {
          title: current.info?.title ?? "Bilinmeyen parça",
          author: current.info?.author ?? "",
          uri: current.info?.uri ?? "",
          length: current.info?.length ?? 0,
        }
      : null,
    queue: tracks.slice(0, 25).map((track) => ({
      title: track.info?.title ?? "Bilinmeyen parça",
      author: track.info?.author ?? "",
      length: track.info?.length ?? 0,
    })),
  };
}

async function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const relative = requested.replace(/^\//, "");
  if (relative.includes("..")) return sendJson(response, 400, { error: "Geçersiz yol." });
  try {
    const data = await readFile(join(webRoot, relative));
    response.writeHead(200, {
      "content-type": types[extname(relative)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(data);
  } catch {
    sendJson(response, 404, { error: "Sayfa bulunamadı." });
  }
}

export function startDashboard({ client, config, getPlayer, play, action }) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (!path.startsWith("/api/")) return serveStatic(request, response, path);

    if (request.method === "POST" && path === "/api/login") {
      try {
        const body = await readBody(request);
        if (!safeEqual(body.username, config.dashboard.user) || !safeEqual(body.password, config.dashboard.password)) {
          return sendJson(response, 401, { error: "Kullanıcı adı veya parola hatalı." });
        }
        const token = randomBytes(32).toString("hex");
        sessions.set(token, { createdAt: Date.now() });
        return sendJson(response, 200, { token });
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    if (!authSession(request)) return sendJson(response, 401, { error: "Oturum gerekli." });

    if (request.method === "GET" && path === "/api/guilds") {
      return sendJson(response, 200, {
        guilds: [...client.guilds.cache.values()].map((guild) => ({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 64 }) })),
      });
    }

    const guildMatch = path.match(/^\/api\/guilds\/([^/]+)(?:\/(channels|state|action|play))?$/);
    if (!guildMatch) return sendJson(response, 404, { error: "API yolu bulunamadı." });

    const guild = client.guilds.cache.get(guildMatch[1]);
    if (!guild) return sendJson(response, 404, { error: "Bot bu sunucuda bulunamadı." });
    const resource = guildMatch[2];

    if (request.method === "GET" && resource === "channels") {
      const channels = await guild.channels.fetch();
      return sendJson(response, 200, {
        voice: [...channels.values()]
          .filter((channel) => channel?.isVoiceBased?.())
          .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type })),
        text: [...channels.values()]
          .filter((channel) => channel?.isTextBased?.() && !channel?.isThread?.())
          .map((channel) => ({ id: channel.id, name: channel.name })),
      });
    }

    if (request.method === "GET" && resource === "state") {
      return sendJson(response, 200, stateForPlayer(getPlayer(guild.id)));
    }

    if (request.method === "POST" && resource === "play") {
      try {
        const body = await readBody(request);
        return sendJson(response, 200, await play(guild, body));
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    if (request.method === "POST" && resource === "action") {
      try {
        const body = await readBody(request);
        return sendJson(response, 200, await action(guild, body));
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    return sendJson(response, 404, { error: "API yolu bulunamadı." });
  });

  server.listen(config.dashboard.port, config.dashboard.host, () => {
    console.log(`Dashboard listening on http://${config.dashboard.host}:${config.dashboard.port}`);
  });
  return server;
}
