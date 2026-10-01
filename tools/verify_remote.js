#!/usr/bin/env node
/* ============================================================================
 * 线上产物验证（CDN → 组件 → 真实数据）
 * ----------------------------------------------------------------------------
 * App 的加载路径是「从公网 URL 拉 JS → 沙箱执行」。本脚本把这条路径完整走一遍：
 *
 *   1. 从 jsDelivr / raw.githubusercontent 拉取**已发布**的组件 JS
 *   2. 校验与本地文件字节一致（防推送漏文件、防 CDN 缓存错版本）
 *   3. 在沙箱里加载**远端那份**代码，跑契约预检
 *   4. 真打一次线上数据（分类 / 列表 / 详情取流），确认真能用
 *   5. 打印安装深链
 *
 * 用法：
 *   node tools/verify_remote.js                 # 全量（两个组件）
 *   node tools/verify_remote.js maccms          # 只验苹果CMS
 *   node tools/verify_remote.js hongguo --hash  # 额外打印 commit SHA 锁定形式的地址
 * ========================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = "Tonyhilo/capyplayer-widgets";
const REF = "main";
const SCHEME = "com.feifeiduck.capyplayer://add-widget";

const COMPONENTS = [
  {
    key: "maccms",
    label: "苹果CMS 影视",
    local: "widget/maccms.js",
    id: "maccms_generic",
    probe: async (ctx) => {
      const cats = await ctx.getCategories({ site: "duanju55" });
      const list = await ctx.getVideoList({ site: "duanju55", catId: "1", page: 1 });
      const detail = list.length ? await ctx.loadDetail(list[0].link) : null;
      const eps = detail && detail.seasons && detail.seasons[0] ? detail.seasons[0].episodes : [];
      return {
        lines: [
          `分类 ${cats.length} 个：${cats.map((c) => c.name).join(" / ")}`,
          `列表第1页 ${list.length} 条，样例《${list[0] ? list[0].title : "—"}》`,
          `详情《${detail ? detail.title : "—"}》${eps.length} 集`,
          `首集直链 ${eps[0] ? eps[0].videoUrl.slice(0, 78) + "…" : "—"}`
        ],
        ok: cats.length > 0 && list.length > 0 && eps.length > 0
      };
    }
  },
  {
    key: "hongguo",
    label: "红果短剧",
    local: "widget/hongguo.js",
    id: "hongguo_duanju",
    probe: async (ctx) => {
      const cats = await ctx.getCategories({});
      const list = await ctx.getDramaList({ route: "real-drama", page: 1 });
      const detail = list.length ? await ctx.loadDetail(list[0].id) : null;
      const eps = detail && detail.seasons && detail.seasons[0] ? detail.seasons[0].episodes : [];
      return {
        lines: [
          `分类 ${cats.length} 个：${cats.map((c) => c.name).join(" / ")}`,
          `列表第1页 ${list.length} 条，样例《${list[0] ? list[0].title : "—"}》`,
          `详情《${detail ? detail.title : "—"}》可播 ${eps.length} 集（网页版限制）`,
          `首集直链 ${eps[0] ? eps[0].videoUrl.slice(0, 78) + "…" : "—"}`
        ],
        ok: cats.length > 0 && list.length > 0 && eps.length > 0
      };
    }
  }
];

/* ------------------------------ 工具 -------------------------------------- */

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

function toBase64Url(str) {
  return Buffer.from(str, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cdnUrls(rel) {
  return {
    primary: `https://cdn.jsdelivr.net/gh/${REPO}@${REF}/${rel}`,
    fastly: `https://fastly.jsdelivr.net/gh/${REPO}@${REF}/${rel}`,
    raw: `https://raw.githubusercontent.com/${REPO}/${REF}/${rel}`
  };
}

/* 造一个和真实沙箱等价的 Widget */
const fetchLog = [];
function makeWidget() {
  const logs = { log: [], warn: [], error: [] };
  const Widget = {
    http: {
      async get(url, opts) {
        opts = opts || {};
        const t0 = Date.now();
        const res = await fetch(url, { headers: opts.headers || {}, redirect: "follow" });
        const text = await res.text();
        fetchLog.push({ url: String(url).split("?")[0], status: res.status, bytes: text.length, ms: Date.now() - t0 });
        const ct = res.headers.get("content-type") || "";
        let data = text;
        if (/application\/json/i.test(ct)) { try { data = JSON.parse(text); } catch (_) {} }
        return { ok: res.ok, status: res.status, data, headers: {} };
      }
    },
    storage: {
      _m: {},
      set(k, v) { this._m[k] = v; },
      get(k, d) { return k in this._m ? this._m[k] : d; },
      async getAsync(k, d) { return this.get(k, d); },
      remove(k) { delete this._m[k]; }
    },
    dom: { parse: () => "doc", select: () => [], text: () => "", attr: () => "", remove: () => {} },
    tmdb: { get: async () => ({}) }
  };
  const sandboxConsole = {
    log: (...a) => logs.log.push(a.join(" ")),
    warn: (...a) => logs.warn.push(a.join(" ")),
    error: (...a) => logs.error.push(a.join(" "))
  };
  return { Widget, logs, sandboxConsole };
}

/* 读本地 HEAD 的 SHA —— 直接读文件，不 spawn 子进程（沙箱里 execSync 会 EBUSY） */
function readHeadSha() {
  const gitDir = path.resolve(__dirname, "..", ".git");
  try {
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const ref = head.replace(/^ref:\s*/, "").trim();
    return fs.readFileSync(path.join(gitDir, ref), "utf8").trim();
  } catch (e) {
    try {
      const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
      const m = packed.match(/^([0-9a-f]{40})\s+refs\/heads\/main$/m);
      return m ? m[1] : "";
    } catch (e2) {
      return "";
    }
  }
}

function loadIntoVm(code, Widget, sandboxConsole, filename) {
  const ctx = vm.createContext({
    Widget, console: sandboxConsole, fetch, Promise, JSON, Math, Date, RegExp,
    parseInt, parseFloat, isFinite, encodeURIComponent, decodeURIComponent,
    String, Number, Object, Array, Error, TypeError, setTimeout, globalThis: null
  });
  ctx.globalThis = ctx;
  vm.runInContext(code, ctx, { filename });
  return ctx;
}

/* ========================================================================== */
(async function main() {
  const args = process.argv.slice(2);
  const wantHash = args.includes("--hash");
  const only = args.find((a) => !a.startsWith("--"));
  const targets = only ? COMPONENTS.filter((c) => c.key === only) : COMPONENTS;

  console.log("\x1b[1m线上产物验证\x1b[0m  " + new Date().toISOString().slice(0, 19).replace("T", " "));
  console.log(`仓库 ${REPO}@${REF}`);

  for (const comp of targets) {
    section(`【${comp.label}】${comp.local}`);

    const localPath = path.resolve(__dirname, "..", comp.local);
    const localCode = fs.readFileSync(localPath, "utf8");
    const urls = cdnUrls(comp.local);

    /* ---- 1. 拉取远端 ---- */
    let remote = null;
    let usedUrl = "";
    for (const [name, u] of Object.entries(urls)) {
      try {
        const res = await fetch(u, { redirect: "follow" });
        if (!res.ok) { console.log(`    \x1b[90m${name}: HTTP ${res.status}\x1b[0m`); continue; }
        const txt = await res.text();
        if (!txt || txt.length < 500) { console.log(`    \x1b[90m${name}: 内容过短\x1b[0m`); continue; }
        remote = txt;
        usedUrl = u;
        console.log(`    \x1b[90m远端命中端点: ${name}\x1b[0m`);
        break;
      } catch (e) {
        console.log(`    \x1b[90m${name}: ${e.message}\x1b[0m`);
      }
    }

    check("能从公网拉取组件 JS", !!remote,
      remote ? Buffer.byteLength(remote, "utf8") + " bytes" : "全部端点失败");
    if (!remote) continue;

    /* ---- 2. 与本地一致性 ---- */
    const norm = (s) => s.replace(/\r\n/g, "\n");
    const same = norm(remote) === norm(localCode);
    check(
      "远端内容与本地一致（防漏推 / 防缓存错版本）",
      same,
      same ? "" : `远端 ${Buffer.byteLength(remote, "utf8")} B vs 本地 ${Buffer.byteLength(localCode, "utf8")} B`
    );

    /* ---- 3. 沙箱加载远端代码 ---- */
    const env = makeWidget();
    let ctx = null;
    try {
      ctx = loadIntoVm(remote, env.Widget, env.sandboxConsole, comp.local);
    } catch (e) {
      check("远端代码可在沙箱加载", false, e.message);
      continue;
    }
    check("远端代码可在沙箱加载", true);

    const md = ctx.WidgetMetadata;
    check("WidgetMetadata 存在且是 var 顶层", !!md && typeof md === "object", md && md.id);
    check("id 与本地一致", !!md && md.id === comp.id, md && md.id);
    check("modules 非空", Array.isArray(md && md.modules) && md.modules.length > 0,
      md && md.modules ? md.modules.length + " 个模块" : "");
    const safePath = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
    let fnsOk = true;
    (md && md.modules ? md.modules : []).forEach((m) => {
      const fn = String(m.functionName || "");
      let cur = ctx;
      fn.split(".").forEach((k) => { cur = cur && cur[k]; });
      if (!safePath.test(fn) || typeof cur !== "function") fnsOk = false;
    });
    check("所有 functionName 合法且可调用", fnsOk);
    check("loadDetail 已定义", typeof ctx.loadDetail === "function");

    /* ---- 4. 打一次真实数据 ---- */
    try {
      const r = await comp.probe(ctx);
      r.lines.forEach((l) => console.log("    \x1b[90m" + l + "\x1b[0m"));
      check("线上数据链路可用（分类→列表→详情→直链）", r.ok);
    } catch (e) {
      check("线上数据链路可用", false, e.message);
    }

    /* ---- 5. 安装深链 ---- */
    const dl = SCHEME + "?data=" + toBase64Url(usedUrl);
    const back = Buffer.from(dl.split("data=")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    console.log("\n    组件地址: " + usedUrl);
    console.log("    安装深链: " + dl);
    check("深链可正确回解", back === usedUrl, back);

    if (wantHash) {
      const sha = readHeadSha();
      if (sha) {
        console.log("\n    版本锁定地址（推荐长期使用，防 main 漂移）：");
        console.log("    https://cdn.jsdelivr.net/gh/" + REPO + "@" + sha + "/" + comp.local);
      }
    }
  }

  /* ---- 汇总 ---- */
  section(`请求统计（共 ${fetchLog.length} 次）`);
  fetchLog.slice(0, 6).forEach((f) => {
    console.log(`  ${String(f.status).padEnd(4)} ${String(f.bytes).padStart(8)}B ${String(f.ms).padStart(6)}ms  ${f.url.slice(0, 88)}`);
  });
  if (fetchLog.length > 6) console.log(`  … 其余 ${fetchLog.length - 6} 次省略`);

  console.log(
    `\n\x1b[1m结果: ${pass} 通过 / ${fail} 失败\x1b[0m` +
    (fail ? "\n失败项:\n" + problems.map((p) => "  - " + p).join("\n") : "")
  );
  console.log("\n提示：打开 web/index.html 可看到二维码，手机直接扫码安装。");
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\n验证脚本异常:", e);
  process.exit(1);
});
