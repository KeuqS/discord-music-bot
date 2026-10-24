let sessionToken = "";
let currentGuild = "";
let currentState = null;
let currentUser = null;
let draggedIndex = null;

const $ = (id) => document.getElementById(id);
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}`, ...(options.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "İstek başarısız.");
  return data;
};
const fmt = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const showMessage = (text, success = false) => { $("actionMessage").textContent = text; $("actionMessage").className = `message${success ? " success" : ""}`; };
const showSettingsMessage = (id, text, success = false) => { $(id).textContent = text; $(id).className = `message${success ? " success" : ""}`; };

function renderQueue(queue) {
  if (!queue.length) { $("queueList").innerHTML = `<p class="empty">Kuyruk şu anda boş.</p>`; return; }
  $("queueList").innerHTML = queue.map((track) => `<div class="queue-item" draggable="true" data-index="${track.index}"><span class="drag-handle">⠿</span><span class="queue-number">${String(track.index + 1).padStart(2, "0")}</span><div class="queue-track"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.author)} · ${fmt(track.length)}</small></div><button class="remove-track" data-remove-index="${track.index}" title="Kuyruktan kaldır">×</button></div>`).join("");
  document.querySelectorAll(".queue-item").forEach((item) => {
    item.addEventListener("dragstart", () => { draggedIndex = Number(item.dataset.index); item.classList.add("dragging"); });
    item.addEventListener("dragend", () => { draggedIndex = null; item.classList.remove("dragging"); });
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", async (event) => { event.preventDefault(); const to = Number(item.dataset.index); if (draggedIndex !== null && draggedIndex !== to) await action("move", { from: draggedIndex, to }); });
  });
  document.querySelectorAll("[data-remove-index]").forEach((button) => button.addEventListener("click", () => action("remove", { index: Number(button.dataset.removeIndex) })));
}

async function loadMe() {
  const data = await api("/api/me");
  currentUser = data.user;
  $("currentUserBadge").textContent = `${currentUser.username} · ${currentUser.role}`;
  $("settingsCard").classList.remove("hidden");
  if (currentUser.role === "admin") { $("userAdminPanel").classList.remove("hidden"); await loadUsers(); }
}

async function loadUsers() {
  const { users } = await api("/api/users");
  $("userList").innerHTML = users.map((user) => `<div class="user-row"><div><strong>${escapeHtml(user.username)}</strong><small>${user.role}</small></div><div class="user-actions"><select class="user-role" data-role-id="${user.id}"><option value="operator" ${user.role === "operator" ? "selected" : ""}>Operator</option><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Izleyici</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option></select><button class="user-action" data-reset-user="${user.id}">Şifre</button><button class="remove-track" data-user-id="${user.id}" ${user.id === currentUser.id ? "disabled" : ""}>×</button></div></div>`).join("");
  document.querySelectorAll("[data-user-id]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("Bu kullanıcı silinsin mi?")) return; try { await api(`/api/users/${button.dataset.userId}`, { method: "DELETE" }); await loadUsers(); showSettingsMessage("userMessage", "Kullanıcı silindi.", true); } catch (error) { showSettingsMessage("userMessage", error.message); } }));
  document.querySelectorAll("[data-role-id]").forEach((select) => select.addEventListener("change", async () => { try { await api(`/api/users/${select.dataset.roleId}`, { method: "PATCH", body: JSON.stringify({ role: select.value }) }); showSettingsMessage("userMessage", "Rol güncellendi.", true); } catch (error) { showSettingsMessage("userMessage", error.message); await loadUsers(); } }));
  document.querySelectorAll("[data-reset-user]").forEach((button) => button.addEventListener("click", async () => { const password = prompt("Yeni parola (en az 10 karakter):"); if (!password) return; try { await api(`/api/users/${button.dataset.resetUser}`, { method: "PATCH", body: JSON.stringify({ password }) }); showSettingsMessage("userMessage", "Kullanıcı parolası güncellendi.", true); } catch (error) { showSettingsMessage("userMessage", error.message); } }));
}

async function loadGuilds() {
  const { guilds } = await api("/api/guilds");
  $("guildSelect").innerHTML = guilds.map((guild) => `<option value="${guild.id}">${escapeHtml(guild.name)}</option>`).join("");
  if (!guilds.length) throw new Error("Botun bulunduğu bir sunucu bulunamadı.");
  currentGuild = guilds[0].id;
  await loadChannels();
  await refreshState();
}
async function loadChannels() {
  const channels = await api(`/api/guilds/${currentGuild}/channels`);
  $("voiceSelect").innerHTML = channels.voice.map((channel) => `<option value="${channel.id}">${escapeHtml(channel.name)}</option>`).join("");
  $("textSelect").innerHTML = channels.text.map((channel) => `<option value="${channel.id}">${escapeHtml(channel.name)}</option>`).join("");
}
async function refreshState() {
  if (!currentGuild) return;
  currentState = await api(`/api/guilds/${currentGuild}/state`);
  const state = currentState;
  $("connectionPill").textContent = state.connected ? "● Bağlı" : "● Hazır";
  $("connectionPill").style.color = state.connected ? "#76e5bb" : "#aaa1b9";
  $("botStatus").textContent = state.paused ? "Duraklatıldı" : state.playing ? "Oynatılıyor" : "Hazır";
  $("voiceStatus").textContent = state.voiceChannelId ? "Bağlı" : "Bağlı değil";
  $("queueCount").textContent = `${state.queue.length} parça`;
  $("queueBadge").textContent = state.queue.length;
  if (state.current) { $("nowTitle").textContent = state.current.title; $("nowAuthor").textContent = state.current.author; $("nowDuration").textContent = fmt(state.current.length); } else { $("nowTitle").textContent = "Henüz parça yok"; $("nowAuthor").textContent = "Bir şarkı seçerek başlayalım."; $("nowDuration").textContent = "0:00"; }
  $("volume").value = state.volume ?? 80; $("volumeValue").textContent = `${state.volume ?? 80}%`;
  renderQueue(state.queue);
}
async function action(name, extra = {}) { try { await api(`/api/guilds/${currentGuild}/action`, { method: "POST", body: JSON.stringify({ action: name, ...extra }) }); showMessage("İşlem uygulandı.", true); await refreshState(); } catch (error) { showMessage(error.message); } }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

$("loginForm").addEventListener("submit", async (event) => { event.preventDefault(); $("loginError").textContent = ""; try { const data = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: $("username").value, password: $("password").value }) }).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }); sessionToken = data.token; $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden"); await loadMe(); await loadGuilds(); } catch (error) { $("loginError").textContent = error.message; } });
$("guildSelect").addEventListener("change", async (event) => { currentGuild = event.target.value; await loadChannels(); await refreshState(); });
$("playForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api(`/api/guilds/${currentGuild}/play`, { method: "POST", body: JSON.stringify({ query: $("query").value, voiceChannelId: $("voiceSelect").value, textChannelId: $("textSelect").value }) }); $("query").value = ""; showMessage("Parça kuyruğa eklendi.", true); await refreshState(); } catch (error) { showMessage(error.message); } });
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.action)));
$("volume").addEventListener("change", () => action("volume", { percent: Number($("volume").value) }));
$("volume").addEventListener("input", () => { $("volumeValue").textContent = `${$("volume").value}%`; });
$("logoutButton").addEventListener("click", () => { sessionToken = ""; $("appView").classList.add("hidden"); $("loginView").classList.remove("hidden"); $("password").value = ""; });
$("passwordForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("/api/password", { method: "POST", body: JSON.stringify({ currentPassword: $("currentPassword").value, newPassword: $("newPassword").value }) }); $("currentPassword").value = ""; $("newPassword").value = ""; showSettingsMessage("passwordMessage", "Parolan değiştirildi.", true); } catch (error) { showSettingsMessage("passwordMessage", error.message); } });
$("userForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("/api/users", { method: "POST", body: JSON.stringify({ username: $("newUsername").value, password: $("newUserPassword").value, role: $("newUserRole").value }) }); $("newUsername").value = ""; $("newUserPassword").value = ""; await loadUsers(); showSettingsMessage("userMessage", "Kullanıcı eklendi.", true); } catch (error) { showSettingsMessage("userMessage", error.message); } });
setInterval(() => { if (sessionToken) refreshState().catch(() => {}); }, 5000);
