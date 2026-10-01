#!/usr/bin/env node
/* ============================================================================
 * 红果组件自测（Node 沙箱）
 * ----------------------------------------------------------------------------
 * 用一个最小的 Widget 沙箱模拟 CapyPlayer 运行时，把 widget/hongguo.js
 * 真跑一遍真实红果站点，验证：
 *   1. 契约合规（WidgetMetadata / functionName / 返回值类型）
 *   2. 列表、搜索、详情三个模块能否拿到数据
 *   3. 详情能否解析出「明文可播直链」，并对直链发 Range 请求验证可播
 *
 * 用法：node tools/selftest.js
 * ========================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WIDGET_PATH = path.resolve(__dirname, "../widget/hongguo.js");

/* ---------------------------- 沙箱：Widget API ---------------------------- */
const fetchLog = [];

const Widget = {
  http: {
    async get(url, opts) {
      opts = opts || {};
      const headers = Object.assign(
        { "User-Agent": "HongguoWidgetSelftest/1.0" },
        opts.headers || {}
      );
      let full = url;
      if (opts.params) {
        const qs = Object.keys(opts.params)
          .map((k) => k + "=" + encodeURIComponent(opts.params[k]))
          .join("&");
        full += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
      }
      const t0 = Date.now();
      const res = await fetch(full, { headers, redirect: "follow" });
      const text = await res.text();
      fetchLog.push({
        url: full.split("?")[0],
        status: res.status,
        bytes: text.length,
        ms: Date.now() - t0
      });
      // 对齐真实沙箱：HTML 走文本，JSON 走对象
      const ct = res.headers.get("content-type") || "";
      let data = text;
      if (/application\/json/i.test(ct)) {
        try {
          data = JSON.parse(text);
        } catch (_) {}
      }
      return { ok: res.ok, status: res.status, data, headers: {} };
    },
    async post(url, body, opts) {
      const res = await fetch(url, {
        method: "POST",
        headers: Object.assign(
          { "Content-Type": "application/json" },
          (opts && opts.headers) || {}
        ),
        body: typeof body === "string" ? body : JSON.stringify(body || {}),
        redirect: "follow"
      });
      const text = await res.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch (_) {}
      return { ok: res.ok, status: res.status, data, headers: {} };
    }
  },
  storage: {
    _m: {},
    set(k, v) {
      this._m[k] = v;
    },
    get(k, d) {
      return k in this._m ? this._m[k] : d;
    },
    async getAsync(k, d) {
      return this.get(k, d);
    },
    remove(k) {
      delete this._m[k];
    }
  },
  dom: {
    parse: () => "doc",
    select: () => [],
    text: () => "",
    attr: () => "",
    remove: () => {}
  },
  tmdb: { get: async () => ({}) }
};

/* 独立捕获组件内部的 console，便于归类输出 */
const widgetLogs = { log: [], warn: [], error: [] };
const sandboxConsole = {
  log: (...a) => widgetLogs.log.push(a.join(" ")),
  warn: (...a) => widgetLogs.warn.push(a.join(" ")),
  error: (...a) => widgetLogs.error.push(a.join(" "))
};

/* ------------------------------ 加载组件 ---------------------------------- */
const code = fs.readFileSync(WIDGET_PATH, "utf8");
const context = vm.createContext({
  Widget,
  console: sandboxConsole,
  fetch,
  Promise,
  JSON,
  Math,
  Date,
  parseInt,
  parseFloat,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  String,
  Number,
  Object,
  Array,
  RegExp,
  Error,
  setTimeout,
  globalThis: null
});
context.globalThis = context;
vm.runInContext(code, context, { filename: "hongguo.js" });

/* ------------------------------ 断言工具 ---------------------------------- */
let pass = 0;
let fail = 0;
const problems = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    problems.push(name + (detail ? " — " + detail : ""));
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? "  " + detail : ""}`);
  }
}

function section(t) {
  console.log("\n\x1b[36m" + t + "\x1b[0m");
}

/* ----------------------------------------------------------------------------
 * 阶段 1：契约预检（照搬官方第 11 章 validateCurrentWidget）
 * -------------------------------------------------------------------------- */
(async function main() {
section("阶段 1 · 契约预检");

const md = context.WidgetMetadata;
check("顶层是 var WidgetMetadata", !!md && typeof md === "object");
check("title 非空", !!(md && md.title));
check("id 合法", !!(md && md.id && /^[a-zA-Z0-9._-]+$/.test(md.id)), md && md.id);
check("modules 非空", Array.isArray(md && md.modules) && md.modules.length > 0,
  md && md.modules ? md.modules.length + " 个模块" : "");

const safePath = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
(md && md.modules ? md.modules : []).forEach((m, i) => {
  const fn = m && m.functionName ? String(m.functionName) : "";
  check(`modules[${i}].functionName 合法 (${fn})`, !!fn && safePath.test(fn));
  let cur = context;
  fn.split(".").forEach((k) => {
    cur = cur && cur[k];
  });
  check(`modules[${i}] 可调用 (${fn})`, typeof cur === "function");
  check(`modules[${i}].title 非空`, !!(m && (m.title || m.name)));
});

check("loadDetail 已定义", typeof context.loadDetail === "function");

/* ----------------------------------------------------------------------------
 * 阶段 2：分类
 * -------------------------------------------------------------------------- */
section("阶段 2 · 分类模块");
let cats = [];
try {
  cats = await context.getCategories({});
  check("返回数组", Array.isArray(cats));
  check("至少 1 个分类", cats.length > 0, cats.length + " 个");
  check(
    "分类条目含 id/name/params",
    cats.every((c) => c && c.id && c.name && c.params && typeof c.params === "object")
  );
  console.log("     " + cats.map((c) => `${c.name}(${c.params.route})`).join("  "));
} catch (e) {
  check("getCategories 执行", false, e.message);
}

/* ----------------------------------------------------------------------------
 * 阶段 3：列表
 * -------------------------------------------------------------------------- */
section("阶段 3 · 列表模块");
let list = [];
let firstId = "";
try {
  list = await context.getDramaList({ route: "real-drama", page: 1 });
  check("返回数组", Array.isArray(list));
  check("条目数 > 0", list.length > 0, list.length + " 条");
  const bad = list.filter((x) => !x || typeof x.id !== "string" || !x.title);
  check("每条都有字符串 id 与 title", bad.length === 0, bad.length ? bad.length + " 条不合格" : "");
  firstId = list[0] && list[0].id;
  console.log("     样例: " + JSON.stringify({
    id: list[0].id,
    title: list[0].title,
    mediaType: list[0].mediaType,
    type: list[0].type,
    year: list[0].year,
    tags: (list[0].tags || []).slice(0, 3),
    poster: (list[0].posterUrl || "").slice(0, 48) + "…"
  }, null, 0));
} catch (e) {
  check("getDramaList 执行", false, e.message);
}

// 换频道 + 翻页
try {
  const p2 = await context.getDramaList({ route: "comic-drama", page: 2 });
  check("漫剧第2页可拉取", Array.isArray(p2) && p2.length > 0, p2.length + " 条");
  const overlap = p2.filter((x) => x.id === firstId).length;
  check("分页不重复第1页内容", overlap === 0);
} catch (e) {
  check("分页拉取", false, e.message);
}

/* ----------------------------------------------------------------------------
 * 阶段 4：搜索
 * -------------------------------------------------------------------------- */
section("阶段 4 · 搜索模块");
try {
  const s = await context.searchDramas({ keyword: "总裁" });
  check("返回数组", Array.isArray(s));
  check("有搜索结果", s.length > 0, s.length + " 条");
  check("结果含 id/title", s.every((x) => x.id && x.title));
  console.log("     命中: " + s.slice(0, 5).map((x) => x.title).join(" | "));
} catch (e) {
  check("searchDramas 执行", false, e.message);
}

/* ----------------------------------------------------------------------------
 * 阶段 5：详情 + 取流 + 直链可播性
 * -------------------------------------------------------------------------- */
section("阶段 5 · 详情与播放");
let detail = null;
try {
  detail = await context.loadDetail(firstId);
  check("返回对象", !!detail && typeof detail === "object");
  check("title 非空", !!detail.title, detail.title);
  check("mediaType = tv", detail.mediaType === "tv");
  check("有 seasons", Array.isArray(detail.seasons) && detail.seasons.length > 0);
  const eps = detail.seasons && detail.seasons[0] ? detail.seasons[0].episodes : [];
  check("有剧集", Array.isArray(eps) && eps.length > 0, eps.length + " 集");
  check(
    "每集都有 videoUrl 或 playSources",
    eps.every((e) => (e.videoUrl && e.videoUrl.length > 0) || (e.playSources && e.playSources.length))
  );
  check("季号/集号连续", eps.every((e, i) => e.seasonNumber === 1 && e.episodeNumber === i + 1));
  check("剧集 id 唯一", new Set(eps.map((e) => e.id)).size === eps.length);
  console.log("     " + eps.map((e) => e.title).join(" / "));
  const st = detail.credits && detail.credits.cast ? detail.credits.cast : [];
  console.log("     演员: " + (st.length ? st.map((c) => c.name + (c.character || "")).join("、") : "（无）"));
  console.log("     标签: " + (detail.tags || []).join("、"));
} catch (e) {
  check("loadDetail 执行", false, e.message);
}

// 直链真播验证：Range 请求 + 校验 ftyp 头
if (detail && detail.seasons && detail.seasons[0]) {
  const eps = detail.seasons[0].episodes;
  section("阶段 6 · 直链真实性验证");
  for (const ep of eps) {
    try {
      const res = await fetch(ep.videoUrl, {
        headers: { Range: "bytes=0-31" }
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const ftyp = buf.slice(4, 8).toString("ascii");
      const isMp4 = ftyp === "ftyp";
      check(
        `${ep.title} 直链可播`,
        (res.status === 206 || res.status === 200) && isMp4,
        `HTTP ${res.status} ${res.headers.get("content-type")} ftyp=${ftyp}`
      );
    } catch (e) {
      check(`${ep.title} 直链可播`, false, e.message);
    }
  }
}

/* ------------------------------ 汇总 -------------------------------------- */
section("请求统计");
fetchLog.forEach((f) => {
  console.log(
    `  ${String(f.status).padEnd(4)} ${String(f.bytes).padStart(8)}B ${String(f.ms).padStart(5)}ms  ${f.url}`
  );
});

if (widgetLogs.warn.length || widgetLogs.error.length) {
  section("组件内部告警");
  widgetLogs.warn.forEach((l) => console.log("  WARN  " + l));
  widgetLogs.error.forEach((l) => console.log("  ERROR " + l));
}

console.log(
  `\n\x1b[1m结果: ${pass} 通过 / ${fail} 失败\x1b[0m` +
  (fail ? "\n失败项:\n" + problems.map((p) => "  - " + p).join("\n") : "")
);
process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\n自测脚本异常:", e);
  process.exit(1);
});
