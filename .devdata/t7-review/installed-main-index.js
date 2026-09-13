"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const crypto = require("crypto");
const fs = require("fs");
const musicMetadata = require("music-metadata");
const child_process = require("child_process");
const ffmpegStatic = require("ffmpeg-static");
const stream = require("stream");
const electronUpdater = require("electron-updater");
function resolveUserData() {
  if (utils.is.dev) {
    return path.join(process.cwd(), ".devdata", "user");
  }
  return electron.app.getPath("userData");
}
function paths() {
  const userData = resolveUserData();
  return {
    userData,
    covers: path.join(userData, "covers"),
    decodeCache: path.join(userData, "decode-cache"),
    logs: path.join(userData, "logs")
  };
}
class JsonStore {
  file;
  data;
  defaults;
  timer = null;
  writing = Promise.resolve();
  constructor(fileName2, defaults) {
    this.file = path.join(paths().userData, fileName2);
    this.defaults = JSON.parse(JSON.stringify(defaults));
    this.data = this.cloneDefaults();
  }
  cloneDefaults() {
    return JSON.parse(JSON.stringify(this.defaults));
  }
  async init() {
    try {
      const raw = await fs.promises.readFile(this.file, "utf-8");
      const parsed = JSON.parse(raw);
      this.data = { ...this.cloneDefaults(), ...parsed };
    } catch {
    }
  }
  get() {
    return this.data;
  }
  /** merge partial and persist (debounced 250ms) */
  set(partial) {
    this.data = { ...this.data, ...partial };
    this.persist();
    return this.data;
  }
  /** replace whole store */
  replace(next) {
    this.data = next;
    this.persist();
    return this.data;
  }
  persist() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, 250);
  }
  /** force write immediately */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      await fs.promises.writeFile(tmp, snapshot, "utf-8");
      await fs.promises.rename(tmp, this.file);
    });
    await this.writing;
  }
}
const SUPPORTED_EXTS = /* @__PURE__ */ new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ape",
  ".ogg",
  ".opus"
]);
const SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git"]);
async function collectAudioFiles(root, signal) {
  try {
    const st = await fs.promises.stat(root);
    if (st.isFile()) {
      const ext = path.extname(root).toLowerCase();
      if (SUPPORTED_EXTS.has(ext)) {
        return [{ path: root, size: st.size, mtime: Math.round(st.mtimeMs) }];
      }
      return [];
    }
  } catch {
    return [];
  }
  const out = [];
  const stack = [root];
  while (stack.length > 0 && !signal.cancelled) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (signal.cancelled) return out;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.has(ext)) {
          try {
            const stat = await fs.promises.stat(full);
            if (stat.isFile()) {
              out.push({ path: full, size: stat.size, mtime: Math.round(stat.mtimeMs) });
            }
          } catch {
          }
        }
      }
    }
  }
  return out;
}
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
function extOf$1(path$1) {
  return path.extname(path$1).toLowerCase().slice(1);
}
function displayFolderName(root) {
  return path.basename(root) || root;
}
const COVER_EXTS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};
function trackIdOf(path2) {
  return crypto.createHash("sha1").update(path2.toLowerCase()).digest("hex").slice(0, 20);
}
const UNKNOWN = "未知";
class LibraryService {
  tracks = /* @__PURE__ */ new Map();
  file = path.join(paths().userData, "library.json");
  saveTimer = null;
  async init() {
    try {
      const raw = await fs.promises.readFile(this.file, "utf-8");
      const arr = JSON.parse(raw);
      for (const t of arr) this.tracks.set(t.id, t);
    } catch {
    }
  }
  persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 400);
  }
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const arr = Array.from(this.tracks.values());
    await fs.promises.mkdir(paths().userData, { recursive: true });
    const tmp = this.file + ".tmp";
    await fs.promises.writeFile(tmp, JSON.stringify(arr), "utf-8");
    await fs.promises.rename(tmp, this.file);
  }
  all() {
    return Array.from(this.tracks.values());
  }
  get(id) {
    return this.tracks.get(id);
  }
  byPaths(pathsSet) {
    return this.all().filter((t) => pathsSet.has(t.path.toLowerCase()));
  }
  stats() {
    const tracks = this.all();
    return {
      total: tracks.length,
      artists: new Set(tracks.map((t) => t.artist.toLowerCase())).size,
      albums: new Set(tracks.map((t) => `${t.artist.toLowerCase()}\0${t.album.toLowerCase()}`)).size,
      folders: new Set(tracks.map((t) => t.folderId)).size,
      totalDuration: tracks.reduce((s, t) => s + (t.duration || 0), 0)
    };
  }
  remove(ids) {
    for (const id of ids) this.tracks.delete(id);
    this.persist();
  }
  /** remove tracks whose file no longer exists */
  async dropMissing() {
    const ids = [];
    for (const t of this.tracks.values()) {
      if (t.missing) ids.push(t.id);
    }
    this.remove(ids);
    return ids.length;
  }
  /**
   * Scan the given roots. Returns counts; emits progress through callback.
   */
  async scanRoots(roots, onProgress, cancelled) {
    const result = { added: 0, updated: 0, skipped: 0, missing: 0, cancelled: false };
    const existing = /* @__PURE__ */ new Map();
    for (const t of this.tracks.values()) existing.set(t.path.toLowerCase(), t);
    for (const root of roots) {
      if (cancelled.flag) {
        result.cancelled = true;
        return result;
      }
      let isFile = false;
      try {
        isFile = (await fs.promises.stat(root)).isFile();
      } catch {
        isFile = false;
      }
      const files = await collectAudioFiles(root, { get cancelled() {
        return cancelled.flag;
      } });
      if (cancelled.flag) {
        result.cancelled = true;
        return result;
      }
      const folderId = isFile ? path.dirname(root) : root;
      const folderName = displayFolderName(folderId);
      const found = /* @__PURE__ */ new Set();
      let i = 0;
      let lastEmit = 0;
      await mapLimit(files, 4, async (file) => {
        if (cancelled.flag) return;
        const key = file.path.toLowerCase();
        found.add(key);
        const prev = existing.get(key);
        if (prev && prev.size === file.size && prev.mtime === file.mtime && !prev.missing) {
          result.skipped++;
        } else {
          try {
            const track = await this.parseOne(file, folderId, folderName);
            if (track) {
              track.addedAt = prev?.addedAt ?? Date.now();
              const changed = prev ? JSON.stringify(this.publicOf(prev)) !== JSON.stringify(this.publicOf(track)) : true;
              this.tracks.set(track.id, track);
              existing.set(key, track);
              if (prev) result.updated += changed ? 1 : 0;
              else result.added++;
            }
          } catch {
            result.skipped++;
          }
        }
        i++;
        const now = Date.now();
        if (now - lastEmit > 120 || i === files.length) {
          lastEmit = now;
          onProgress({ current: i, total: files.length, file: file.path });
        }
      });
      if (!isFile) {
        let missingCount = 0;
        for (const t of this.tracks.values()) {
          if (t.folderId !== folderId) continue;
          if (found.has(t.path.toLowerCase())) {
            if (t.missing) {
              t.missing = false;
              missingCount--;
            }
          } else if (!t.missing) {
            t.missing = true;
            missingCount++;
          }
        }
        result.missing += Math.max(0, missingCount);
      }
    }
    this.persist();
    return result;
  }
  publicOf(t) {
    return { id: t.id, path: t.path, size: t.size, mtime: t.mtime };
  }
  async parseOne(file, folderId, folderName) {
    const meta = await musicMetadata.parseFile(file.path, { duration: true });
    const c = meta.common;
    const id = trackIdOf(file.path);
    let coverPath = null;
    const pic = c.picture && c.picture[0];
    if (pic && pic.data && pic.data.length > 0) {
      const ext = COVER_EXTS[String(pic.format).toLowerCase()] ?? "jpg";
      coverPath = path.join(paths().covers, `${id}.${ext}`);
      try {
        await fs.promises.mkdir(paths().covers, { recursive: true });
        await fs.promises.writeFile(coverPath, Buffer.from(pic.data));
      } catch {
        coverPath = null;
      }
    } else {
      const stale = path.join(paths().covers, `${id}.jpg`);
      await fs.promises.rm(stale, { force: true }).catch(() => {
      });
    }
    return {
      id,
      path: file.path,
      ext: extOf$1(file.path),
      title: (c.title ?? "").trim() || fallbackName(file.path),
      artist: (c.artist ?? c.albumartist ?? "").trim() || UNKNOWN,
      album: (c.album ?? "").trim() || UNKNOWN,
      duration: Number.isFinite(meta.format.duration) ? Math.round(meta.format.duration ?? 0) : 0,
      coverPath,
      genre: (c.genre ?? []).join(" / "),
      year: c.year ?? null,
      trackNo: c.track?.no ?? null,
      folderId,
      folderName,
      size: file.size,
      mtime: file.mtime
    };
  }
}
function fallbackName(path2) {
  const base = path2.split(/[\\/]/).pop() ?? path2;
  return base.replace(/\.[^.]+$/, "");
}
function normalizeBaseURL(raw) {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/chat")) return base + "/completions";
  return base + "/chat/completions";
}
async function chatComplete(config, messages, tools, emitChunk, abort) {
  const url = normalizeBaseURL(config.baseURL);
  const body = {
    model: config.model,
    messages,
    stream: true
  };
  if (tools.length > 0) body.tools = tools;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5 * 60 * 1e3);
  if (abort) {
    abort.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (abort?.aborted) throw new Error("已取消");
    const e = err;
    if (e.cause?.code === "ECONNREFUSED" || e.cause?.code === "ENOTFOUND" || e.cause?.code === "EAI_AGAIN") {
      throw new Error("网络连接失败，请检查网络或接口地址");
    }
    throw new Error("网络请求失败: " + (err instanceof Error ? err.message : String(err)));
  }
  if (!resp.ok) {
    clearTimeout(timer);
    let detail = `HTTP ${resp.status}`;
    try {
      const text2 = await resp.text();
      const json = JSON.parse(text2);
      const msg = typeof json.error === "string" ? json.error : json.error?.message ?? json.error?.message ?? "";
      if (msg) detail += ` — ${msg}`;
    } catch {
    }
    throw new Error("API 请求失败: " + detail);
  }
  const contentType = resp.headers.get("content-type") ?? "";
  const isStream = contentType.includes("text/event-stream");
  if (!isStream || !resp.body) {
    const json = await resp.json();
    clearTimeout(timer);
    const choice = json.choices?.[0];
    const text2 = choice?.message?.content ?? "";
    const toolCalls2 = mapToolCalls(choice?.message?.tool_calls);
    if (text2) emitChunk(text2);
    return { finishReason: choice?.finish_reason ?? null, toolCalls: toolCalls2, text: text2 };
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  const calls = [];
  let finishReason = null;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          if (payload === "[DONE]") finishReason = finishReason ?? "stop";
          continue;
        }
        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = evt.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          emitChunk(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            calls[i] = calls[i] ?? { id: "", name: "", args: "" };
            if (tc.id) calls[i].id += tc.id;
            if (tc.function?.name) calls[i].name += tc.function.name;
            if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          }
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }
  } catch (err) {
    clearTimeout(timer);
    if (abort?.aborted) throw new Error("已取消");
    throw new Error("流式读取中断: " + (err instanceof Error ? err.message : String(err)));
  }
  clearTimeout(timer);
  const toolCalls = calls.filter((c) => c.name).map((c) => ({
    id: c.id || `call_${c.name}`,
    type: "function",
    function: { name: c.name, arguments: c.args || "{}" }
  }));
  return { finishReason, toolCalls, text };
}
function mapToolCalls(tcs) {
  if (!tcs) return [];
  return tcs.map((tc, i) => ({
    id: tc.id ?? `call_${i}`,
    type: "function",
    function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" }
  }));
}
async function testApi(config) {
  const base = config.baseURL.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, message: "请填写接口地址" };
  if (!config.model.trim()) return { ok: false, message: "请填写模型名称" };
  if (!config.apiKey.trim()) return { ok: false, message: "请填写 API Key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 1e3);
  try {
    const url = base.endsWith("/models") ? base : base + "/models";
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: controller.signal
      });
      if (resp.ok) {
        const json = await resp.json();
        const models2 = (json.data ?? []).map((m) => m.id).filter((x) => Boolean(x));
        if (models2.length > 0) {
          return { ok: true, message: "连接成功，服务可用", models: models2 };
        }
        return { ok: true, message: "连接成功，服务可用" };
      }
    } catch {
    }
    const chatResp = await fetch(normalizeBaseURL(base), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
      signal: controller.signal
    });
    if (chatResp.ok) return { ok: true, message: "连接成功，服务可用" };
    let detail = `HTTP ${chatResp.status}`;
    let errorMsg = "";
    try {
      const json = await chatResp.json();
      const e = typeof json.error === "string" ? json.error : json.error?.message;
      if (e) {
        errorMsg = e;
        detail += ` — ${e}`;
      }
    } catch {
    }
    const models = extractSupportedModels(errorMsg);
    if (models.length > 0 && models.includes(config.model) === false) {
      detail = `模型名称无效，请选择：${models.join("、")}`;
    }
    return { ok: false, message: detail, models: models.length ? models : void 0 };
  } catch (err) {
    return { ok: false, message: "连接失败: " + (err instanceof Error ? err.message : String(err)) };
  } finally {
    clearTimeout(timer);
  }
}
function extractSupportedModels(msg) {
  const m = /supported\s+API\s+model\s+names?\s+are\s+(.+)/i.exec(msg) ?? /model names?\s+are\s+(.+)/i.exec(msg);
  if (!m) return [];
  const chunk = m[1].replace(/[.\s]+$/, "").split(/,|, and |\s+and\s+/).map((s) => s.trim()).filter((s) => /^[A-Za-z0-9._:/-]+$/.test(s));
  return chunk;
}
const DEFAULTS = {
  api: { baseURL: "", model: "", keyMode: "", hasKey: false, keyEnc: "" },
  general: {
    closeToTray: true,
    alwaysOnTop: false,
    resumeOnLaunch: true,
    mediaKeys: false,
    scanFolders: [],
    updateURL: ""
  }
};
class SettingsService {
  store;
  constructor() {
    this.store = new JsonStore("settings.json", DEFAULTS);
  }
  async init() {
    await this.store.init();
  }
  async flush() {
    await this.store.flush();
  }
  /** settings safe to hand to the renderer (never contains the key) */
  getPublic() {
    const s = this.store.get();
    return {
      api: { baseURL: s.api.baseURL, model: s.api.model, keyMode: s.api.keyMode, hasKey: s.api.hasKey },
      general: s.general
    };
  }
  /** update general settings only */
  update(partial) {
    const cur = this.store.get();
    this.store.set({ general: { ...cur.general, ...partial } });
    return this.getPublic();
  }
  hasFolders() {
    return this.store.get().general.scanFolders.length > 0;
  }
  /**
   * Configure the AI endpoint. An empty apiKey keeps the stored key;
   * pass a non-empty string to rotate. Keys are encrypted with
   * safeStorage (DPAPI/Keychain) at rest.
   */
  setApi(input) {
    const cur = this.store.get();
    const api = { ...cur.api };
    if (input.baseURL !== void 0) api.baseURL = input.baseURL;
    if (input.model !== void 0) api.model = input.model;
    if (input.apiKey !== void 0) {
      if (input.apiKey === "") {
        api.keyEnc = "";
        api.keyMode = "";
        api.hasKey = false;
      } else {
        if (electron.safeStorage.isEncryptionAvailable()) {
          api.keyEnc = electron.safeStorage.encryptString(input.apiKey).toString("base64");
          api.keyMode = "enc";
        } else {
          api.keyEnc = Buffer.from(input.apiKey, "utf-8").toString("base64");
          api.keyMode = "plain";
        }
        api.hasKey = true;
      }
    }
    this.store.set({ api });
    return this.getPublic();
  }
  /** decrypted API config for main-process calls only */
  getApiConfig() {
    const { api } = this.store.get();
    let key = "";
    if (api.hasKey && api.keyEnc) {
      try {
        key = api.keyMode === "enc" ? electron.safeStorage.decryptString(Buffer.from(api.keyEnc, "base64")) : Buffer.from(api.keyEnc, "base64").toString("utf-8");
      } catch {
        key = "";
      }
    }
    return { baseURL: api.baseURL, model: api.model, apiKey: key };
  }
  async test() {
    return testApi(this.getApiConfig());
  }
}
const MIME = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".ape": "audio/x-ape",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
function pathFromRequest(url) {
  const u = new URL(url);
  const b64 = u.pathname.replace(/^\//, "");
  return Buffer.from(b64, "base64url").toString("utf-8");
}
function mediaUrlFor(filePath) {
  const b64 = Buffer.from(filePath, "utf-8").toString("base64url");
  return "media://local/" + b64;
}
function registerMediaProtocol() {
  electron.protocol.handle("media", async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405 });
    }
    let filePath;
    try {
      filePath = pathFromRequest(request.url);
    } catch {
      return new Response(null, { status: 400 });
    }
    let size;
    let mtime;
    try {
      const st = await fs.promises.stat(filePath);
      size = st.size;
      mtime = st.mtimeMs;
    } catch {
      return new Response(null, { status: 404 });
    }
    const mime = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.get("range");
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (!m) return new Response(null, { status: 416 });
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end)) return new Response(null, { status: 416 });
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` }
        });
      }
      end = Math.min(end, size - 1);
      const body2 = stream.Readable.toWeb(fs.createReadStream(filePath, { start, end }));
      return new Response(body2, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache"
        }
      });
    }
    const body = stream.Readable.toWeb(fs.createReadStream(filePath));
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Last-Modified": new Date(mtime).toUTCString(),
        "Cache-Control": "no-cache"
      }
    });
  });
}
const DIRECT_EXTS = /* @__PURE__ */ new Set([".mp3", ".wav", ".flac", ".ogg", ".opus", ".m4a"]);
const CONVERT = {
  ".ape": "wav",
  ".aac": "m4a"
};
function ffmpegBin() {
  let bin = ffmpegStatic;
  if (!bin) throw new Error("ffmpeg-static resolved no binary path");
  if (bin.includes("app.asar")) {
    bin = bin.replace("app.asar", "app.asar.unpacked");
  }
  return bin;
}
function cacheFileFor(mediaPath, targetExt) {
  return path.join(paths().decodeCache, `${crypto.createHash("sha1").update(mediaPath.toLowerCase()).digest("hex")}.${targetExt}`);
}
function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });
    child.on("error", (err) => reject(new Error(`无法启动解码器: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`解码失败 (${code}): ${stderr.split("\n").filter(Boolean).pop() ?? "未知错误"}`));
    });
  });
}
async function ensurePlayable(mediaPath) {
  const ext = mediaPath.slice(mediaPath.lastIndexOf(".")).toLowerCase();
  if (DIRECT_EXTS.has(ext)) return mediaUrlFor(mediaPath);
  const targetExt = CONVERT[ext];
  if (!targetExt) throw new Error(`不支持的音频格式: ${ext}`);
  const out = cacheFileFor(mediaPath, targetExt);
  try {
    const st = await fs.promises.stat(out);
    if (st.size > 0) return mediaUrlFor(out);
  } catch {
  }
  await fs.promises.mkdir(paths().decodeCache, { recursive: true });
  const tmp = out + ".tmp";
  await fs.promises.rm(tmp, { force: true }).catch(() => {
  });
  const bin = ffmpegBin();
  const args = targetExt === "m4a" ? ["-y", "-i", mediaPath, "-c", "copy", "-movflags", "+faststart", tmp] : ["-y", "-i", mediaPath, "-vn", "-c:a", "pcm_s16le", tmp];
  try {
    await runFfmpeg(bin, args);
    await fs.promises.rename(tmp, out);
  } catch (err) {
    if (targetExt === "m4a") {
      const wavOut = cacheFileFor(mediaPath, "wav");
      await fs.promises.rm(tmp, { force: true }).catch(() => {
      });
      const wavTmp = wavOut + ".tmp";
      await runFfmpeg(bin, ["-y", "-i", mediaPath, "-vn", "-c:a", "pcm_s16le", wavTmp]);
      await fs.promises.rename(wavTmp, wavOut);
      return mediaUrlFor(wavOut);
    }
    throw err;
  }
  return mediaUrlFor(out);
}
async function cleanupCache() {
  try {
    const dir = paths().decodeCache;
    const entries = await fs.promises.readdir(dir);
    const cutoff = Date.now() - 7 * 24 * 3600 * 1e3;
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = await fs.promises.stat(full);
        if (st.mtimeMs < cutoff) await fs.promises.rm(full, { force: true });
      } catch {
      }
    }
  } catch {
  }
}
async function getWaveform(input) {
  const hash = crypto.createHash("sha1").update(`${input.path.toLowerCase()}|${input.mtime}|${input.size}`).digest("hex");
  const wfDir = path.join(paths().userData, "waveforms");
  const cacheFile = path.join(wfDir, `${hash}.json`);
  const rawFile = path.join(paths().decodeCache, `wf-${hash}.f32`);
  try {
    const cached = await fs.promises.readFile(cacheFile, "utf-8");
    return JSON.parse(cached);
  } catch {
  }
  const bin = ffmpegBin();
  await fs.promises.mkdir(wfDir, { recursive: true });
  await fs.promises.mkdir(paths().decodeCache, { recursive: true });
  await fs.promises.rm(rawFile, { force: true }).catch(() => {
  });
  await new Promise((resolve, reject) => {
    const child = child_process.spawn(bin, ["-y", "-i", input.path, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", rawFile], {
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8192) stderr = stderr.slice(-4096);
    });
    child.on("error", (err) => reject(new Error(`ffmpeg 启动失败: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`波形计算失败 (${code})`));
    });
  });
  const raw = await fs.promises.readFile(rawFile);
  await fs.promises.rm(rawFile, { force: true }).catch(() => {
  });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const duration = Math.max(1, input.duration);
  const buckets = Math.max(80, Math.min(1600, Math.round(duration * 20)));
  const per = Math.max(1, Math.floor(samples.length / buckets));
  const env = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * per;
    const end = Math.min(samples.length, start + per);
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    env[b] = Math.round(Math.min(1, peak * 1.6) * 255);
  }
  await fs.promises.writeFile(cacheFile, JSON.stringify(env), "utf-8");
  return env;
}
const cache = /* @__PURE__ */ new Map();
const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
function parseLrc(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const matches = [...raw.matchAll(LRC_TIME)];
    const content = raw.replace(LRC_TIME, "").trim();
    if (matches.length === 0) continue;
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] ?? "0";
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      out.push({ t: min * 60 + sec + frac, text: content });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
function extOf(path2) {
  const i = path2.lastIndexOf(".");
  return i >= 0 ? path2.slice(i).toLowerCase() : "";
}
async function getLyrics(input) {
  const key = `${input.path.toLowerCase()}|${input.mtime}|${input.size}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const lrcPath = path.join(path.dirname(input.path), path.basename(input.path, extOf(input.path)) + ".lrc");
    const text = await fs.promises.readFile(lrcPath, "utf-8");
    const lines = parseLrc(text);
    if (lines.length > 0) {
      const r2 = { lines, source: "lrc" };
      cache.set(key, r2);
      return r2;
    }
  } catch {
  }
  try {
    const meta = await musicMetadata.parseFile(input.path, { duration: false });
    const lyrics = meta.common.lyrics;
    if (Array.isArray(lyrics)) {
      for (const lyr of lyrics) {
        const st = lyr?.syncText;
        if (Array.isArray(st) && st.length > 0) {
          const lines = st.map((s) => ({ t: Number(s.timestamp ?? 0) / 1e3, text: String(s.text ?? "").trim() })).filter((x) => x.text).sort((a, b) => a.t - b.t);
          if (lines.length > 0) {
            const r2 = { lines, source: "embedded" };
            cache.set(key, r2);
            return r2;
          }
        }
      }
      const plain = lyrics.map((l) => l?.text).filter((x) => Boolean(x && x.trim())).join("\n");
      if (plain) {
        const lines = plain.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 80).map((t) => ({ t: -1, text: t }));
        const r2 = { lines, source: "embedded" };
        cache.set(key, r2);
        return r2;
      }
    }
  } catch {
  }
  const r = { lines: [], source: "none" };
  return r;
}
let current = { state: "idle" };
let emit = () => {
};
let wired = false;
function setState(s) {
  current = s;
  emit(s);
}
function ensureWired(previewOnly) {
  if (wired) return;
  wired = true;
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
  electronUpdater.autoUpdater.allowPrerelease = false;
  electronUpdater.autoUpdater.allowDowngrade = false;
  if (!electron.app.isPackaged) {
    electronUpdater.autoUpdater.forceDevUpdateConfig = true;
  }
  electronUpdater.autoUpdater.on("update-available", (info) => {
    setState({ state: "available", version: info.version });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    setState({ state: "none" });
  });
  electronUpdater.autoUpdater.on("download-progress", (p) => {
    setState({ state: "downloading", percent: Math.max(0, Math.min(100, Math.round(p.percent))) });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    setState({ state: "downloaded", version: info.version });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    setState({ state: "error", message: err?.message ?? String(err) });
  });
}
function feedFor(url) {
  return { provider: "generic", url: url.endsWith("/") ? url : url + "/" };
}
async function checkUpdate(feedURL) {
  setState({ state: "checking" });
  const url = feedURL?.trim();
  if (!url) {
    setState({ state: "not-configured" });
    return current;
  }
  ensureWired();
  try {
    if (!electron.app.isPackaged) {
      electronUpdater.autoUpdater.setFeedURL(feedFor(url));
    } else {
      try {
        electronUpdater.autoUpdater.setFeedURL(feedFor(url));
      } catch {
      }
    }
    await electronUpdater.autoUpdater.checkForUpdates();
  } catch (err) {
    if (current.state !== "available" && current.state !== "none") {
      setState({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }
  return current;
}
async function downloadUpdate() {
  ensureWired();
  try {
    await electronUpdater.autoUpdater.downloadUpdate();
  } catch (err) {
    setState({ state: "error", message: err instanceof Error ? err.message : String(err) });
  }
  return current;
}
function installUpdate() {
  ensureWired();
  electronUpdater.autoUpdater.quitAndInstall();
}
function registerUpdateEmitter(fn) {
  emit = fn;
  ensureWired();
  return current;
}
let currentFile = "";
function fileName() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return path.join(paths().logs, `nebula-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`);
}
function ensureFile() {
  if (currentFile) return currentFile;
  fs.mkdirSync(paths().logs, { recursive: true });
  currentFile = fileName();
  try {
    const st = fs.statSync(currentFile);
    if (st.size > 2 * 1024 * 1024) fs.renameSync(currentFile, currentFile + ".old");
  } catch {
  }
  return currentFile;
}
function log(level, msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level}] ${msg}
`;
  try {
    fs.appendFileSync(ensureFile(), line);
  } catch {
  }
  if (level === "error" || level === "warn") console.log(`[app:${level}] ${msg}`);
}
function logDir() {
  return paths().logs;
}
function initLogging() {
  process.on("uncaughtException", (err) => {
    log("error", "uncaughtException: " + (err && err.stack || String(err)));
  });
  process.on("unhandledRejection", (reason) => {
    log("error", "unhandledRejection: " + (reason instanceof Error ? reason.stack ?? reason.message : String(reason)));
  });
  log("info", `--- NEBULA Player boot v${electron.app.getVersion()} ${process.platform} ${process.arch} ---`);
}
let mini = null;
function ensureMiniWindow() {
  if (mini && !mini.isDestroyed()) return mini;
  mini = new electron.BrowserWindow({
    width: 430,
    height: 160,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#0a0e1c",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mini.setAlwaysOnTop(true, "screen-saver");
  mini.on("closed", () => {
    mini = null;
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void mini.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#mini");
  } else {
    void mini.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "mini" });
  }
  return mini;
}
function getMiniWindow() {
  return mini && !mini.isDestroyed() ? mini : null;
}
function toggleMiniWindow() {
  const existing = getMiniWindow();
  if (existing) {
    if (existing.isVisible()) {
      existing.hide();
    } else {
      existing.showInactive();
      existing.focus();
    }
  } else {
    const w = ensureMiniWindow();
    w.showInactive();
    w.focus();
  }
  return getMiniWindow()?.isVisible() ?? false;
}
function closeMiniWindow() {
  getMiniWindow()?.hide();
}
function forwardToMini(channel, payload) {
  getMiniWindow()?.webContents.send(channel, payload);
}
const iconPath = path.join(__dirname, "../../resources/icon.png");
let tray = null;
let title = "NEBULA Player";
function createTray(onCommand) {
  let image = electron.nativeImage.createFromPath(iconPath);
  if (process.platform === "win32") {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new electron.Tray(image);
  tray.setToolTip(title);
  const menu = electron.Menu.buildFromTemplate([
    { label: "显示主界面", click: () => showMainWindow() },
    { type: "separator" },
    { label: "播放 / 暂停", click: () => onCommand("toggle") },
    { label: "上一曲", click: () => onCommand("prev") },
    { label: "下一曲", click: () => onCommand("next") },
    { type: "separator" },
    { label: "退出", click: () => quitApp() }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => showMainWindow());
  return tray;
}
function updateTrayTitle(text) {
  title = text || "NEBULA Player";
  tray?.setToolTip(title);
}
function showMainWindow() {
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function quitApp() {
  electron.app.quit();
}
function destroyTray() {
  tray?.destroy();
  tray = null;
}
const aborters = /* @__PURE__ */ new Map();
let scanCancelled = { flag: false };
function registerIpc(svc) {
  const win = () => svc.win()?.win ?? null;
  electron.ipcMain.on("window:minimize", () => win()?.minimize());
  electron.ipcMain.handle("window:maximize-toggle", () => svc.win()?.toggleMaximize() ?? false);
  electron.ipcMain.handle("window:is-maximized", () => svc.win()?.isMaximized() ?? false);
  electron.ipcMain.on("window:close", () => svc.win()?.close());
  electron.ipcMain.handle("window:always-on-top", (_e, v) => {
    svc.win()?.setAlwaysOnTop(v);
    svc.settings.update({ alwaysOnTop: v });
    return v;
  });
  electron.ipcMain.handle("app:info", () => ({
    version: electron.app.getVersion(),
    platform: process.platform,
    userDataPath: electron.app.getPath("userData")
  }));
  electron.ipcMain.on("app:quit", () => {
    electron.app.quit();
  });
  electron.ipcMain.handle("dialog:select-folders", async () => {
    const w = win();
    const opts = {
      title: "选择音乐文件夹",
      properties: ["openDirectory", "multiSelections"]
    };
    const res = w ? await electron.dialog.showOpenDialog(w, opts) : await electron.dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths;
  });
  electron.ipcMain.handle("dialog:select-files", async () => {
    const w = win();
    const opts = {
      title: "选择音频文件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "音频文件", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ape", "ogg", "opus"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    };
    const res = w ? await electron.dialog.showOpenDialog(w, opts) : await electron.dialog.showOpenDialog(opts);
    return res.canceled ? [] : res.filePaths;
  });
  electron.ipcMain.handle("library:get", () => ({
    tracks: svc.library.all(),
    stats: svc.library.stats()
  }));
  electron.ipcMain.handle("library:scan", async (e, roots) => {
    scanCancelled = { flag: false };
    const sender = e.sender;
    return svc.library.scanRoots(roots, (p) => {
      if (!sender.isDestroyed()) sender.send("library:scan-progress", p);
    }, scanCancelled);
  });
  electron.ipcMain.on("library:scan-cancel", () => {
    scanCancelled.flag = true;
  });
  electron.ipcMain.handle("library:remove", (_e, ids) => {
    svc.library.remove(ids);
    return ids.length;
  });
  electron.ipcMain.handle("library:drop-missing", async () => svc.library.dropMissing());
  electron.ipcMain.handle("library:get-track", (_e, id) => svc.library.get(id));
  electron.ipcMain.handle("shell:show-item", (_e, path2) => {
    electron.shell.showItemInFolder(path2);
    return true;
  });
  electron.ipcMain.handle("decode:ensure", (_e, path2) => ensurePlayable(path2));
  electron.ipcMain.on("log:renderer", (_e, p) => {
    log(p?.level === "error" ? "error" : p?.level === "warn" ? "warn" : "info", "[renderer] " + (p?.msg ?? ""));
  });
  electron.ipcMain.handle("app:open-log-dir", () => electron.shell.openPath(logDir()));
  electron.ipcMain.handle(
    "waveform:get",
    (_e, input) => getWaveform(input)
  );
  electron.ipcMain.handle("settings:get", () => svc.settings.getPublic());
  electron.ipcMain.handle("settings:update-general", (_e, partial) => svc.settings.update(partial));
  electron.ipcMain.handle("settings:set-api", (_e, input) => svc.settings.setApi(input));
  electron.ipcMain.handle("settings:test-api", () => svc.settings.test());
  electron.ipcMain.handle("playlist:load", () => svc.playlists.get());
  electron.ipcMain.handle("playlist:save", async (_e, playlists2) => {
    svc.playlists.set({ playlists: playlists2 });
    await svc.playlists.flush();
    return true;
  });
  electron.ipcMain.handle("chat:load", () => svc.chat.get());
  electron.ipcMain.handle("chat:save", async (_e, messages) => {
    svc.chat.set({ messages });
    await svc.chat.flush();
    return true;
  });
  electron.ipcMain.handle("chat:complete", async (e, payload) => {
    const cfg = svc.settings.getApiConfig();
    if (!cfg.baseURL.trim()) throw new Error("尚未配置 AI 接口地址，请先在「设置 → AI 配置」中填写");
    if (!cfg.model.trim()) throw new Error("尚未配置模型名称，请先在「设置 → AI 配置」中填写");
    if (!cfg.apiKey) throw new Error("尚未配置 API Key，请先在「设置 → AI 配置」中填写");
    const abort = new AbortController();
    aborters.set(payload.id, abort);
    try {
      const completed = await chatComplete(cfg, payload.messages, payload.tools, (delta) => {
        if (!e.sender.isDestroyed()) e.sender.send("chat:chunk", { id: payload.id, delta });
      }, abort.signal);
      return { id: payload.id, finishReason: completed.finishReason, toolCalls: completed.toolCalls };
    } finally {
      aborters.delete(payload.id);
    }
  });
  electron.ipcMain.on("chat:abort", (_e, id) => {
    aborters.get(id)?.abort();
    aborters.delete(id);
  });
  electron.ipcMain.handle("lyrics:get", (_e, input) => getLyrics(input));
  electron.ipcMain.on("player:state", (_e, state) => {
    const label = state.isPlaying && state.title ? `正在播放: ${state.title} — ${state.artist}` : "NEBULA Player";
    updateTrayTitle(label);
    const w = svc.win()?.win;
    if (w) {
      try {
        if (state.duration > 0 && state.currentTime >= 0 && (state.isPlaying || state.currentTime > 0)) {
          const frac = Math.min(1, Math.max(0, state.currentTime / state.duration));
          w.setProgressBar(frac, { mode: state.isPlaying ? "normal" : "paused" });
        } else {
          w.setProgressBar(-1);
        }
      } catch {
      }
    }
    forwardToMini("mini:state", { state, track: svc.library.get(state.trackId ?? "") ?? null });
  });
  electron.ipcMain.handle("mini:toggle", () => toggleMiniWindow());
  electron.ipcMain.on("mini:close", () => closeMiniWindow());
  electron.ipcMain.on("mini:cmd", (_e, cmd) => svc.onPlayerCommand(cmd));
  electron.ipcMain.handle("settings:media-keys", (_e, enabled) => {
    registerMediaKeys(enabled, svc.onPlayerCommand);
    return enabled;
  });
  electron.ipcMain.handle("update:check", () => checkUpdate(svc.settings.getPublic().general.updateURL));
  electron.ipcMain.handle("update:download", () => downloadUpdate());
  electron.ipcMain.on("update:install", () => installUpdate());
}
function registerMediaKeys(enabled, onCommand) {
  electron.globalShortcut.unregisterAll();
  if (!enabled) return;
  electron.globalShortcut.register("MediaPlayPause", () => onCommand("toggle"));
  electron.globalShortcut.register("MediaNextTrack", () => onCommand("next"));
  electron.globalShortcut.register("MediaPreviousTrack", () => onCommand("prev"));
  electron.globalShortcut.register("MediaStop", () => onCommand("stop"));
}
let quitting = false;
function setQuitting() {
  quitting = true;
}
function isQuitting() {
  return quitting;
}
function createMainWindow(opts) {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: "#050508",
    alwaysOnTop: opts.alwaysOnTop,
    autoHideMenuBar: true,
    ...process.platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      // media/WebAudio never blocked by autoplay policy in this app
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler((details) => {
    void electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (!quitting && opts.closeToTray()) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("maximize", () => win.webContents.send("window:maximize-change", true));
  win.on("unmaximize", () => win.webContents.send("window:maximize-change", false));
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return {
    win,
    show: () => {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
    hide: () => win.hide(),
    toggleMaximize: () => {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return win.isMaximized();
    },
    isMaximized: () => win.isMaximized(),
    setAlwaysOnTop: (v) => win.setAlwaysOnTop(v, "screen-saver"),
    close: () => win.close(),
    send: (channel, ...args) => win.webContents.send(channel, ...args)
  };
}
if (utils.is.dev) {
  electron.app.setPath("userData", path.join(process.cwd(), ".devdata", "user"));
}
const gotLock = electron.app.requestSingleInstanceLock();
if (!gotLock) {
  electron.app.quit();
}
let winHandle = null;
const library = new LibraryService();
const settings = new SettingsService();
const playlists = new JsonStore("playlists.json", { playlists: [] });
const chat = new JsonStore("chat.json", { messages: [] });
if (utils.is.dev) {
  electron.app.commandLine.appendSwitch("remote-debugging-port", "9222");
}
electron.app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
function sendPlayerCommand(cmd) {
  winHandle?.send("player:command", cmd);
}
async function bootstrap() {
  utils.electronApp.setAppUserModelId("com.nebula.player");
  initLogging();
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  await Promise.all([settings.init(), library.init(), playlists.init(), chat.init(), cleanupCache()]);
  log("info", "services initialized; update feed=" + (settings.getPublic().general.updateURL || "(none)"));
  registerMediaProtocol();
  if (utils.is.dev) {
    console.log("[main] argv:", process.argv.filter((a) => a.startsWith("--")).join(" "));
    console.log("[main] mute-audio switch:", electron.app.commandLine.hasSwitch("mute-audio"));
    console.log("[main] disable-audio-output:", electron.app.commandLine.hasSwitch("disable-audio-output"));
  }
  winHandle = createMainWindow({
    alwaysOnTop: settings.getPublic().general.alwaysOnTop,
    closeToTray: () => settings.getPublic().general.closeToTray
  });
  registerIpc({
    library,
    settings,
    playlists,
    chat,
    win: () => winHandle,
    onPlayerCommand: (cmd) => sendPlayerCommand(cmd)
  });
  if (utils.is.dev) {
    winHandle.win.webContents.on("console-message", (event) => {
      const { level, message } = event;
      if (level >= 1) console.log(`[renderer:${level}] ${message}`);
    });
    winHandle.win.webContents.on("render-process-gone", (_e, details) => {
      console.log(`[main] renderer gone: ${details.reason}`);
    });
    winHandle.win.webContents.on("did-finish-load", () => {
      console.log("[main] window loaded");
      setTimeout(() => {
        void winHandle?.win.webContents.executeJavaScript(
          `JSON.stringify({
              root: document.getElementById('root')?.childElementCount ?? -1,
              hasApi: typeof window.api === 'object',
              hasApiMethods: typeof window.api?.libraryGet === 'function',
              text: document.body.innerText.slice(0, 120)
            })`
        ).then((r) => console.log("[main] probe:", r)).catch((e) => console.log("[main] probe failed:", String(e)));
      }, 2500);
    });
    electron.ipcMain.handle("dev:media-internals", async () => {
      const b = new electron.BrowserWindow({ show: false, width: 800, height: 600 });
      await b.loadURL("chrome://media-internals/");
      await new Promise((r) => setTimeout(r, 2500));
      const text = await b.webContents.executeJavaScript(
        `(async () => {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms))
          const rows = document.querySelectorAll('tr')
          for (const row of rows) {
            if ((row.innerText || '').includes('media://')) { row.click(); break }
          }
          await sleep(1500)
          return document.body.innerText.slice(0, 14000)
        })()`
      );
      b.destroy();
      return text;
    });
  }
  registerMediaKeys(settings.getPublic().general.mediaKeys, sendPlayerCommand);
  createTray(sendPlayerCommand);
  const feedSender = (s) => {
    winHandle?.send("update:status", s);
  };
  const updSvc = registerUpdateEmitter(feedSender);
  if (updSvc.state !== "idle") feedSender(updSvc);
  setTimeout(() => {
    if (settings.getPublic().general.updateURL.trim()) {
      void checkUpdate(settings.getPublic().general.updateURL);
    }
  }, 8e3);
  if (process.platform === "darwin") {
    electron.Menu.setApplicationMenu(
      electron.Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }])
    );
  } else {
    electron.Menu.setApplicationMenu(null);
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0 && winHandle) {
      winHandle.show();
    }
  });
}
electron.app.whenReady().then(() => {
  void bootstrap();
  electron.app.on("before-quit", () => {
    setQuitting();
  });
  electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !isQuitting() && !settings.getPublic().general.closeToTray) {
      electron.app.quit();
    }
  });
});
electron.app.on("second-instance", () => {
  winHandle?.show();
});
electron.app.on("will-quit", () => {
  destroyTray();
});
