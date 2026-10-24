import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createUserManager, userApi } from "./dashboard-users.js";

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

function authSession(request, config, manager) {
  const header = request.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const session = sessions.get(token);
  if (!session || Date.now() - session.createdAt > config.dashboard.sessionTtlMs) {
    sessions.delete(token);
    return null;
  }
  return manager.findById(session.userId) ?? null;
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
    queue: tracks.slice(0, 100).map((track, index) => ({
      index,
      title: track.info?.title ?? "Bilinmeyen parça",
      author: track.info?.author ?? "",
      length: track.info?.length ?? 0,
      uri: track.info?.uri ?? "",
      source: track.info?.sourceName ?? "",
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

export async function startDashboard({ client, config, getPlayer, play, action }) {
  const manager = await createUserManager(config);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (!path.startsWith("/api/")) return serveStatic(request, response, path);

    if (request.method === "POST" && path === "/api/login") {
      try {
        const body = await readBody(request);
        const found = manager.find(body.username);
        if (!found || !await manager.verifyPassword(body.password, found.passwordHash)) {
          return sendJson(response, 401, { error: "Kullanıcı adı veya parola hatalı." });
        }
        const token = randomBytes(32).toString("hex");
        sessions.set(token, { userId: found.id, createdAt: Date.now() });
        return sendJson(response, 200, { token, user: manager.public(found) });
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    const user = authSession(request, config, manager);
    if (!user) return sendJson(response, 401, { error: "Oturum gerekli." });

    if (request.method === "POST" && path === "/api/logout") {
      sessions.delete(String(request.headers.authorization ?? "").slice(7));
      return sendJson(response, 200, { message: "Çıkış yapıldı." });
    }

    try {
      const userRoute = userApi(manager, request, response, path, user);
      if (userRoute.handled) {
        if (userRoute.result) return sendJson(response, 200, userRoute.result);
        if (userRoute.kind === "password") {
          const body = await readBody(request);
          await manager.changePassword(user, body.currentPassword, body.newPassword);
          return sendJson(response, 200, { message: "Parolan değiştirildi." });
        }
        if (userRoute.kind === "admin-users") {
          if (request.method === "GET" && path === "/api/users") {
            return sendJson(response, 200, { users: manager.users().map(manager.public) });
          }
          if (request.method === "POST" && path === "/api/users") {
            return sendJson(response, 201, { user: manager.public(await manager.create(await readBody(request))) });
          }
          const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
          const target = userMatch ? manager.findById(userMatch[1]) : null;
          if (!target) return sendJson(response, 404, { error: "Kullanıcı bulunamadı." });
          if (request.method === "PATCH") {
            return sendJson(response, 200, { user: manager.public(await manager.update(target, await readBody(request))) });
          }
          if (request.method === "DELETE") {
            await manager.remove(target, user);
            return sendJson(response, 200, { message: "Kullanıcı silindi." });
          }
        }
        return sendJson(response, 404, { error: "API yolu bulunamadı." });
      }
    } catch (error) {
      return sendJson(response, Number(error.status) || 400, { error: error.message });
    }

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
        if (!["admin", "operator"].includes(user.role)) return sendJson(response, 403, { error: "Bu işlem için yetkin yok." });
        const body = await readBody(request);
        return sendJson(response, 200, await play(guild, body));
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    if (request.method === "POST" && resource === "action") {
      try {
        if (!["admin", "operator"].includes(user.role)) return sendJson(response, 403, { error: "Bu işlem için yetkin yok." });
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
