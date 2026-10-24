import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

function error(message, status = 400) {
  const result = new Error(message);
  result.status = status;
  return result;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt ?? user.createdAt,
  };
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(String(password), salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [, salt, expectedHex] = String(encoded ?? "").split("$");
  if (!salt || !expectedHex) return false;
  const actual = Buffer.from(await scryptAsync(String(password), salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requireRole(user, roles) {
  if (!user || !roles.includes(user.role)) throw error("Bu işlem için yetkin yok.", 403);
}

export async function createUserManager(config) {
  const file = config.dashboard.usersFile;
  await mkdir(dirname(file), { recursive: true });
  let store;
  try {
    store = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(store.users)) throw new Error("Dashboard kullanıcı verisi bozuk.");
  } catch (reason) {
    if (reason.code !== "ENOENT") throw reason;
    if (!config.dashboard.password) throw new Error("Dashboard için DASHBOARD_PASSWORD ayarlanmalı.");
    store = { users: [{
      id: randomBytes(12).toString("hex"),
      username: config.dashboard.user,
      passwordHash: await hashPassword(config.dashboard.password),
      role: "admin",
      createdAt: new Date().toISOString(),
    }] };
    await writeFile(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
  if (!store.users.length) throw new Error("En az bir dashboard yöneticisi olmalı.");

  const save = async () => {
    await writeFile(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  };
  const find = (username) => store.users.find((user) => user.username.toLowerCase() === String(username ?? "").trim().toLowerCase());
  const findById = (id) => store.users.find((user) => user.id === id);

  return {
    users: () => store.users,
    public: publicUser,
    find,
    findById,
    verifyPassword,
    async create(body) {
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "");
      const role = String(body.role ?? "operator");
      if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw error("Kullanıcı adı 3-32 karakter olmalı.");
      if (password.length < 10) throw error("Parola en az 10 karakter olmalı.");
      if (!["admin", "operator", "viewer"].includes(role)) throw error("Geçersiz rol.");
      if (find(username)) throw error("Bu kullanıcı adı zaten kullanılıyor.");
      const user = { id: randomBytes(12).toString("hex"), username, passwordHash: await hashPassword(password), role, createdAt: new Date().toISOString() };
      store.users.push(user);
      await save();
      return user;
    },
    async update(target, body) {
      if (body.username !== undefined) {
        const username = String(body.username).trim();
        if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw error("Kullanıcı adı 3-32 karakter olmalı.");
        if (find(username)?.id !== target.id && find(username)) throw error("Bu kullanıcı adı zaten kullanılıyor.");
        target.username = username;
      }
      if (body.role !== undefined) {
        if (!["admin", "operator", "viewer"].includes(body.role)) throw error("Geçersiz rol.");
        if (target.role === "admin" && body.role !== "admin" && store.users.filter((user) => user.role === "admin").length < 2) throw error("Sistemde en az bir admin kalmalı.");
        target.role = body.role;
      }
      if (body.password !== undefined) {
        if (String(body.password).length < 10) throw error("Parola en az 10 karakter olmalı.");
        target.passwordHash = await hashPassword(body.password);
      }
      target.updatedAt = new Date().toISOString();
      await save();
      return target;
    },
    async remove(target, actor) {
      if (target.id === actor.id) throw error("Kendi hesabını silemezsin.");
      if (target.role === "admin" && store.users.filter((user) => user.role === "admin").length < 2) throw error("Son admin hesabı silinemez.");
      store.users = store.users.filter((user) => user.id !== target.id);
      await save();
    },
    async changePassword(user, currentPassword, newPassword) {
      if (String(newPassword ?? "").length < 10) throw error("Yeni parola en az 10 karakter olmalı.");
      if (!await verifyPassword(currentPassword, user.passwordHash)) throw error("Mevcut parola hatalı.", 401);
      user.passwordHash = await hashPassword(newPassword);
      user.updatedAt = new Date().toISOString();
      await save();
    },
    requireRole,
  };
}

export function userApi(manager, request, response, path, user) {
  if (request.method === "GET" && path === "/api/me") {
    return { handled: true, result: { user: manager.public(user) } };
  }
  if (path === "/api/users" || path.startsWith("/api/users/")) {
    manager.requireRole(user, ["admin"]);
    return { handled: true, kind: "admin-users" };
  }
  if (request.method === "POST" && path === "/api/password") return { handled: true, kind: "password" };
  return { handled: false };
}
