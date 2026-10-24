let sessionToken = "";
let currentGuild = "";
let currentState = null;

const $ = (id) => document.getElementById(id);
const api = async (path, options = {}) => {
  const response = await fetch(path, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}`, ...(options.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "İstek başarısız.");
  return data;
};
const fmt = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const showMessage = (text, success = false) => { $("actionMessage").textContent = text; $("actionMessage").className = `message${success ? " success" : ""}`; };

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
  $("queueList").innerHTML = state.queue.length ? state.queue.map((track, index) => `<div class="queue-item"><span class="queue-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.author)} · ${fmt(track.length)}</small></div></div>`).join("") : `<p class="empty">Kuyruk şu anda boş.</p>`;
}
async function action(name, extra = {}) { try { await api(`/api/guilds/${currentGuild}/action`, { method: "POST", body: JSON.stringify({ action: name, ...extra }) }); showMessage("İşlem uygulandı.", true); await refreshState(); } catch (error) { showMessage(error.message); } }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

$("loginForm").addEventListener("submit", async (event) => { event.preventDefault(); $("loginError").textContent = ""; try { const data = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: $("username").value, password: $("password").value }) }).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }); sessionToken = data.token; $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden"); await loadGuilds(); } catch (error) { $("loginError").textContent = error.message; } });
$("guildSelect").addEventListener("change", async (event) => { currentGuild = event.target.value; await loadChannels(); await refreshState(); });
$("playForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api(`/api/guilds/${currentGuild}/play`, { method: "POST", body: JSON.stringify({ query: $("query").value, voiceChannelId: $("voiceSelect").value, textChannelId: $("textSelect").value }) }); $("query").value = ""; showMessage("Parça kuyruğa eklendi.", true); await refreshState(); } catch (error) { showMessage(error.message); } });
document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.action)));
$("volume").addEventListener("change", () => action("volume", { percent: Number($("volume").value) }));
$("volume").addEventListener("input", () => { $("volumeValue").textContent = `${$("volume").value}%`; });
$("logoutButton").addEventListener("click", () => { sessionToken = ""; $("appView").classList.add("hidden"); $("loginView").classList.remove("hidden"); $("password").value = ""; });
setInterval(() => { if (sessionToken) refreshState().catch(() => {}); }, 5000);
