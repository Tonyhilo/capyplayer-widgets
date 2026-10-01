#!/usr/bin/env node
/* ============================================================================
 * 苹果CMS 通用组件自测（Node 沙箱）
 * ----------------------------------------------------------------------------
 * 两条轨道：
 *   A. 离线夹具（确定性）—— 把「花生短剧的播放页形态」「五五短剧的列表形态」等
 *      做成合成 HTML，逐条验证解析器。不受站点存活影响。
 *   B. 真实站点（端到端）—— 真拉五五短剧 / 花生短剧，验证列表→详情→取流→直链可播。
 *   C. 自动探测 —— 用「自定义站点」强制走探测路径，看它能否自己重新发现路由。
 *
 * 用法：node tools/selftest_maccms.js
 * ========================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WIDGET_PATH = path.resolve(__dirname, "../widget/maccms.js");

/* ---------------------------- 沙箱：Widget API ---------------------------- */
const fetchLog = [];

const Widget = {
  http: {
    async get(url, opts) {
      opts = opts || {};
      const headers = Object.assign({}, opts.headers || {});
      let full = url;
      if (opts.params) {
        const qs = Object.keys(opts.params)
          .map((k) => k + "=" + encodeURIComponent(opts.params[k]))
          .join("&");
        full += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
      }
      const t0 = Date.now();
      let res;
      try {
        res = await fetch(full, { headers, redirect: "follow" });
      } catch (e) {
        fetchLog.push({ url: full.split("?")[0], status: 0, bytes: 0, ms: Date.now() - t0 });
        throw e;
      }
      const text = await res.text();
      fetchLog.push({
        url: full.split("?")[0].slice(0, 96),
        status: res.status,
        bytes: text.length,
        ms: Date.now() - t0
      });
      const ct = res.headers.get("content-type") || "";
      let data = text;
      if (/application\/json/i.test(ct)) {
        try {
          data = JSON.parse(text);
        } catch (_) {}
      }
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
  RegExp,
  parseInt,
  parseFloat,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  String,
  Number,
  Object,
  Array,
  Error,
  TypeError,
  setTimeout,
  globalThis: null
});
context.globalThis = context;
vm.runInContext(code, context, { filename: "maccms.js" });

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

function info(t) {
  console.log("    \x1b[90m" + t + "\x1b[0m");
}

/* ============================================================================
 * 离线夹具
 * ========================================================================== */

const FIX = {};

/* ① 五五短剧风格列表页（图片链接 + 更新全集 + bookName） */
FIX.LIST_DUANJU55 = `<html><body>
<div class="pcBrowse_browseContent"><div class="BrowseList_listBox">
  <div class="BrowseList_itemBox">
    <a class="image_imageScaleBox BrowseList_imageBox" href="/index.php/vod/detail/id/53848.html">
      <img alt="旧约碎，新缘起" loading="lazy" width="184" height="264" class="image_imageItem"
           src="https://tyyswimg2.com/upload/vod/20260930-1/9faeaabd40aa6f18b13a76ea0c632883.jpg">
    </a>
    <a class="BrowseList_totalChapterNum" href="/index.php/vod/detail/id/53848.html">更新全集</a>
    <div class="BrowseList_itemRight">
      <a class="BrowseList_bookName" href="/index.php/vod/detail/id/53848.html"><span>旧约碎，新缘起</span></a>
    </div>
  </div>
  <div class="BrowseList_itemBox">
    <a class="image_imageScaleBox BrowseList_imageBox" href="/index.php/vod/detail/id/54003.html">
      <img alt="纸片少女修仙记第一季" loading="lazy" class="image_imageItem"
           src="https://tyyswimg2.com/upload/vod/20260930-1/aaaa.jpg">
    </a>
    <a class="BrowseList_totalChapterNum" href="/index.php/vod/detail/id/54003.html">更新至12集</a>
  </div>
  <div class="BrowseList_itemBox">
    <a class="image_imageScaleBox BrowseList_imageBox" href="/index.php/vod/detail/id/54004.html">
      <img alt="这位修士我们人妖殊途啊" loading="lazy" class="image_imageItem"
           src="https://tyyswimg2.com/upload/vod/20260930-1/bbbb.jpg">
    </a>
    <a class="BrowseList_totalChapterNum" href="/index.php/vod/detail/id/54004.html">更新全集</a>
  </div>
</div>
<div class="paginationCom_pageContent">
  <div class="paginationCom_activePage">1</div>
  <a class="paginationCom_normalLi" href="/index.php/vod/type/id/1/page/2.html" title="第2页">2</a>
  <a class="paginationCom_nextBtn" href="/index.php/vod/type/id/1/page/2.html">next</a>
</div>
</div></body></html>`;

/* ② 花生短剧风格列表页（标准 stui 模板 + 随机化 class 前缀） */
FIX.LIST_HUASHENG = `<html><body>
<ul class="_9dbe81752a1dbf17-vodlist clearfix">
  <li class="_9dbe81752a1dbf17-vodlist__item">
    <a class="_9dbe81752a1dbf17-vodlist__thumb lazyload" href="/zywview/84794.html"
       title="第二季笙笙来了将军府宠翻天-动漫合集"
       data-original="https://yqk.j3kjn242sq.com/image/cover/2026/09/30/a33a2ea8.jpg">
      <span class="play hidden-xs"></span><span class="pic-text text-right">已完结</span>
    </a>
    <h4 class="_9dbe81752a1dbf17-vodlist__title">
      <a href="/zywview/84794.html" title="第二季笙笙来了将军府宠翻天-动漫合集">第二季笙笙来了将军府宠翻天-动漫合集</a>
    </h4>
  </li>
  <li class="_9dbe81752a1dbf17-vodlist__item">
    <a class="_9dbe81752a1dbf17-vodlist__thumb lazyload" href="/zywview/12345.html"
       title="另一种人生" data-original="https://yqk.j3kjn242sq.com/image/cover/x.jpg">
      <span class="pic-text text-right">更新至08集</span>
    </a>
  </li>
  <li class="_9dbe81752a1dbf17-vodlist__item">
    <a class="_9dbe81752a1dbf17-vodlist__thumb lazyload" href="/zywview/99999.html"
       title="春日迟迟" data-original="https://yqk.j3kjn242sq.com/image/cover/y.jpg">
      <span class="pic-text text-right">HD</span>
    </a>
  </li>
</ul></body></html>`;

/* ③ 标准苹果CMS 播放页：player_aaaa 里有嵌套 vod_data（正则会被截断，必须括号配对） */
FIX.PLAY_STD = `<html><body><div id="play"></div>
<script type="text/javascript">
var player_aaaa={"flag":"play","encrypt":0,"trysee":0,"points":0,
"link":"/index.php/vod/play/id/53848/sid/1/nid/1.html","link_next":"","link_pre":"",
"vod_data":{"vod_name":"旧约碎，新缘起","vod_actor":"王佩瑶&高新雨","vod_director":"","vod_class":"现代都市"},
"url":"https:\\/\\/tyyszywvod2.com\\/videos\\/202609\\/30\\/76f346\\/index.m3u8",
"url_next":"","from":"tym3u8","server":"no","note":"","id":"53848","sid":1,"nid":1}
</script></body></html>`;

/* ④ 花生短剧风格播放页：无 player_aaaa，m3u8 明文拼在 iframe 里 */
FIX.PLAY_INLINE = `<html><body>
<script>
var playn='第二季笙笙来了将军府宠翻天-动漫合集', playp='第01集'
var vod_name='第二季笙笙来了将军府宠翻天-动漫合集',vod_part='第01集'
var vid="84794";var vfrom="0";var vpart="0";
var now=(!![]+[][(![]+[])[+[]]+([![]]+[][[]])[+!+[]+[+[]]]]);
var prePage="/zywplay/84794-0-0.html";var nextPage="/zywplay/84794-0-1.html";
</script>
<div id="players"></div>
<script>
document.getElementById('players').innerHTML = '<iframe width="100%" height="100%" src="/player/mui-player.php?'+ '第二季笙笙来了将军府宠翻天-动漫合集 第01集' +',https://cdn.yddsha2.com/m3u87/share/10043519/10235155/20260930/125034/1080/master.m3u8,'+ nextPage + '" frameborder="0"></iframe>';
</script></body></html>`;

/* ⑤ 只有裸直链的播放页（三级回退的最后一级） */
FIX.PLAY_SCAN = `<html><body>
<div class="wrap"><p>正在加载播放器…</p></div>
<script>window.__DATA__ = {"sources":[{"file":"https://v11.example-cdn.com/hls/998877/index.m3u8","label":"1080p"}]};</script>
</body></html>`;

/* ⑥ 首页分类导航 */
FIX.HOME = `<html><body><nav>
  <a href="/">首页</a>
  <a href="/index.php/vod/type/id/1.html">短剧</a>
  <a href="/index.php/vod/type/id/2.html">电影</a>
  <a href="/index.php/vod/type/id/3.html">电视剧</a>
  <a href="/index.php/vod/type/id/4.html">动漫</a>
  <a href="/index.php/vod/type/id/5.html">综艺</a>
  <a href="/index.php/vod/type/id/2.html">电影</a>
  <a href="/search.html">搜索</a>
  <a href="/index.php/vod/detail/id/53848.html" title="旧约碎，新缘起"><img src="a.jpg" alt="旧约碎，新缘起"></a>
</nav></body></html>`;

/* ⑦ 详情页（多集，两条线路） */
FIX.DETAIL_MULTI = `<html><head>
<meta name="description" content="热播短剧旧约碎，新缘起讲述了:">
</head><body>
<h1 class="DramaDetail_bookName">旧约碎，新缘起</h1>
<div class="stui-content__playlist clearfix">
  <a href="/index.php/vod/type/id/1.html">现代都市</a>
  <a href="/index.php/vod/play/id/53848/sid/1/nid/1.html">第01集</a>
  <a href="/index.php/vod/play/id/53848/sid/1/nid/2.html">第02集</a>
  <a href="/index.php/vod/play/id/53848/sid/1/nid/3.html">第03集</a>
  <a href="/index.php/vod/play/id/53848/sid/2/nid/1.html">第01集</a>
  <a href="/index.php/vod/play/id/53848/sid/2/nid/2.html">第02集</a>
</div>
<div class="stui-vodlist__detail">
  <a href="/vodsearch/abc.html" title="王佩瑶">王佩瑶</a>
  <a href="/vodsearch/def.html" title="高新雨">高新雨</a>
</div>
</body></html>`;

/* ⑧ 自定义伪静态路由的首页（/xzyxvt/ slug 型分类） */
FIX.HOME_CUSTOM = `<html><body><nav>
  <a href="/">首页</a>
  <a href="/xzyxvt/dianyingn.html">电影</a>
  <a href="/xzyxvt/dianshijun.html">电视剧</a>
  <a href="/xzyxvt/duanjun.html">短剧</a>
</nav></body></html>`;

const B = "https://www.duanju55.com";
const BH = "https://www.zywest263.com";

/* ============================================================================
 * 主流程
 * ========================================================================== */
(async function main() {
  /* --------------------------------------------------------------------- */
  section("阶段 1 · 契约预检");

  const md = context.WidgetMetadata;
  check("顶层是 var WidgetMetadata", !!md && typeof md === "object");
  check("title 非空", !!(md && md.title));
  check("id 合法", !!(md && md.id && /^[a-zA-Z0-9._-]+$/.test(md.id)), md && md.id);
  check("modules 非空", Array.isArray(md && md.modules) && md.modules.length > 0);

  const safePath = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
  (md && md.modules ? md.modules : []).forEach((m, i) => {
    const fn = m && m.functionName ? String(m.functionName) : "";
    check(`modules[${i}].functionName 合法 (${fn})`, !!fn && safePath.test(fn));
    let cur = context;
    fn.split(".").forEach((k) => { cur = cur && cur[k]; });
    check(`modules[${i}] 可调用 (${fn})`, typeof cur === "function");
    check(`modules[${i}].title 非空`, !!(m && (m.title || m.name)));
  });
  check("loadDetail 已定义", typeof context.loadDetail === "function");

  /* --------------------------------------------------------------------- */
  section("阶段 2 · 离线夹具：播放页解析");

  let p = context.mcParsePlayer(FIX.PLAY_STD);
  check("标准 player_aaaa 命中", p.mode === "player_aaaa", p.mode);
  check("encrypt=0 已识别", p.encrypt === 0, "encrypt=" + p.encrypt);
  check("trysee=0 已识别", p.trysee === 0, "trysee=" + p.trysee);
  check(
    "嵌套 vod_data 未截断 url",
    p.videoUrl === "https://tyyszywvod2.com/videos/202609/30/76f346/index.m3u8",
    p.videoUrl
  );
  check("线路名 from 已识别", p.from === "tym3u8", p.from);

  p = context.mcParsePlayer(FIX.PLAY_INLINE);
  check("内联 iframe 提取成功", p.mode === "iframe", p.mode);
  check(
    "内联 m3u8 正确（未带尾部逗号）",
    p.videoUrl === "https://cdn.yddsha2.com/m3u87/share/10043519/10235155/20260930/125034/1080/master.m3u8",
    p.videoUrl
  );

  p = context.mcParsePlayer(FIX.PLAY_SCAN);
  check("全页扫描兜底成功", p.mode === "scan" && /index\.m3u8$/.test(p.videoUrl), p.videoUrl);

  p = context.mcParsePlayer("<html><body>nothing here</body></html>");
  check("无播放地址时返回空", p.videoUrl === "" && !p.mode, JSON.stringify(p.mode));

  /* --------------------------------------------------------------------- */
  section("阶段 3 · 离线夹具：列表页解析");

  let items = context.mcParseList(
    FIX.LIST_DUANJU55, B, "{base}/index.php/vod/detail/id/{id}.html", "duanju55"
  );
  check("五五短剧列表：3 条", items.length === 3, items.length + " 条");
  check("条目 id 已带站点前缀且唯一", new Set(items.map((x) => x.id)).size === items.length);
  check("link 是绝对地址", items.every((x) => /^https:\/\//.test(x.link)), items[0] && items[0].link);
  check("标题取自 img alt", items[0] && items[0].title === "旧约碎，新缘起", items[0] && items[0].title);
  check("封面已提取", !!(items[0] && /^https:\/\/.*\.jpg$/.test(items[0].posterUrl)), items[0] && items[0].posterUrl);
  check("备注「更新全集」已提取", items[0] && items[0].remarks === "更新全集", items[0] && items[0].remarks);
  check(
    "备注「更新至12集」解析出集数",
    items[1] && items[1].remarks === "更新至12集" && items[1].episodeCount === 12,
    items[1] && items[1].remarks + " / " + items[1].episodeCount
  );

  items = context.mcParseList(FIX.LIST_HUASHENG, BH, "{base}/zywview/{id}.html", "huasheng");
  check("花生短剧列表：3 条", items.length === 3, items.length + " 条");
  check("标题取自 a[title]", items[0] && items[0].title.indexOf("笙笙来了") >= 0, items[0] && items[0].title);
  check("封面取自 data-original", !!(items[0] && /j3kjn242sq/.test(items[0].posterUrl)), items[0] && items[0].posterUrl);
  check("备注「已完结」已提取", items[0] && items[0].remarks === "已完结", items[0] && items[0].remarks);
  check("备注「更新至08集」解析出集数", items[1] && items[1].episodeCount === 8, items[1] && items[1].episodeCount);

  /* --------------------------------------------------------------------- */
  section("阶段 4 · 离线夹具：路由形态识别");

  const dg = context.mcDetectDetailGroup(FIX.LIST_DUANJU55, B);
  check("详情链接组已识别", !!dg && dg.count >= 3, dg ? dg.tpl + " ×" + dg.count : "null");
  check(
    "详情模板正确",
    dg && dg.tpl === "{base}/index.php/vod/detail/id/{id}.html",
    dg && dg.tpl
  );

  const dg2 = context.mcDetectDetailGroup(FIX.LIST_HUASHENG, BH);
  check("花生短剧详情模板正确", !!dg2 && dg2.tpl === "{base}/zywview/{id}.html", dg2 && dg2.tpl);

  const cg = context.mcDetectCategoryGroups(FIX.HOME, B, B + "/");
  const cgen = cg.length ? context.mcCategoryTplFromAnchors(cg[0].list) : null;
  check("首页分类组已识别", !!cgen, cgen && cgen.tpl);
  check(
    "分类模板正确",
    cgen && cgen.tpl === "{base}/index.php/vod/type/id/{catId}.html",
    cgen && cgen.tpl
  );
  check("「电影」未被黑名单误杀", cg.length > 0 && cg[0].list.some((a) => a.text === "电影"),
    cg.length ? cg[0].list.map((a) => a.text).join("/") : "");

  const cg2 = context.mcDetectCategoryGroups(FIX.HOME_CUSTOM, "https://www.xzyx168.com", "https://www.xzyx168.com/");
  const cgen2 = cg2.length ? context.mcCategoryTplFromAnchors(cg2[0].list) : null;
  check("自定义伪静态分类可识别", !!cgen2, cgen2 && cgen2.tpl);
  check(
    "自定义分类模板正确",
    cgen2 && cgen2.tpl === "{base}/xzyxvt/{catId}.html",
    cgen2 && cgen2.tpl
  );

  const pt = context.mcDetectPageTpl(FIX.LIST_DUANJU55, B, "/index.php/vod/type/id/1.html");
  check("分页模板已嗅探", !!pt && pt.tpl.indexOf("/page/{page}.html") > 0, pt && pt.tpl);

  check(
    "分页推导（无嗅探时）",
    context.mcDerivePageUrl(B + "/index.php/vod/type/id/1.html", 3) ===
      B + "/index.php/vod/type/id/1/page/3.html",
    context.mcDerivePageUrl(B + "/index.php/vod/type/id/1.html", 3)
  );

  const pp1 = context.mcParsePlayPath("/index.php/vod/play/id/53848/sid/1/nid/7.html");
  check("标准播放路径解析", pp1 && pp1.id === "53848" && pp1.sid === "1" && pp1.nid === "7",
    JSON.stringify(pp1));
  const pp2 = context.mcParsePlayPath("/zywplay/84794-0-12.html");
  check("自定义播放路径解析", pp2 && pp2.id === "84794" && pp2.sid === "0" && pp2.nid === "12",
    JSON.stringify(pp2));

  /* --------------------------------------------------------------------- */
  section("阶段 5 · 离线夹具：详情页分集提取");
  const det = context.mcParseDetailFields(FIX.DETAIL_MULTI, B);
  check("标题取自 h1", det.title === "旧约碎，新缘起", det.title);
  const plays = context.mcParsePlayLinks(FIX.DETAIL_MULTI, B);
  check("分集链接 5 个（去重后）", plays.length === 5, plays.length + " 个");
  check("标签已提取", det.tags.indexOf("现代都市") >= 0, det.tags.join("/"));
  const bySid = {};
  plays.forEach((x) => { bySid[x.sid] = (bySid[x.sid] || 0) + 1; });
  check("线路分组正确 (sid1=3, sid2=2)", bySid["1"] === 3 && bySid["2"] === 2, JSON.stringify(bySid));

  const tplFromPlays = context.mcPlayTplFromList(plays);
  check(
    "播放模板泛化正确",
    tplFromPlays === "{base}/index.php/vod/play/id/{id}/sid/{sid}/nid/{nid}.html",
    tplFromPlays
  );
  const tplHs = context.mcPlayTplFromList([
    { path: "/zywplay/84794-0-0.html", href: "", id: "84794", sid: "0", nid: "0" }
  ]);
  check("花生短剧播放模板泛化正确", tplHs === "{base}/zywplay/{id}-{sid}-{nid}.html", tplHs);

  /* --------------------------------------------------------------------- */
  section("阶段 6 · 真实站点：五五短剧（内置路由）");

  let cats = [];
  try {
    cats = await context.getCategories({ site: "duanju55" });
    check("分类返回数组", Array.isArray(cats));
    check("至少 1 个分类", cats.length > 0, cats.length + " 个");
    check("分类含 id/name/params", cats.every((c) => c && c.id && c.name && c.params));
    info("分类: " + cats.map((c) => `${c.name}(${c.params.catId})`).join("  "));
  } catch (e) {
    check("getCategories 执行", false, e.message);
  }

  let list1 = [];
  try {
    list1 = await context.getVideoList({ site: "duanju55", catId: "1", page: 1 });
    check("列表第1页有数据", list1.length > 0, list1.length + " 条");
    check("条目字段合规", list1.every((x) => x.id && x.title && x.link));
    info("样例: " + JSON.stringify({
      id: list1[0].id, title: list1[0].title,
      link: list1[0].link, remarks: list1[0].remarks,
      poster: (list1[0].posterUrl || "").slice(0, 56) + "…"
    }));
  } catch (e) {
    check("getVideoList 执行", false, e.message);
  }

  try {
    const list2 = await context.getVideoList({ site: "duanju55", catId: "1", page: 2 });
    check("列表第2页可拉取", list2.length > 0, list2.length + " 条");
    const ids1 = new Set(list1.map((x) => x.id));
    const overlap = list2.filter((x) => ids1.has(x.id)).length;
    check("分页不重复", overlap === 0, "重复 " + overlap + " 条");
  } catch (e) {
    check("分页拉取", false, e.message);
  }

  try {
    const s = await context.searchVideos({ site: "duanju55", keyword: "天医" });
    check("搜索有结果", s.length > 0, s.length + " 条");
    info("命中: " + s.slice(0, 5).map((x) => x.title).join(" | "));
  } catch (e) {
    check("searchVideos 执行", false, e.message);
  }

  /* --------------------------------------------------------------------- */
  section("阶段 7 · 真实站点：详情 + 取流 + 直链可播");

  let detail = null;
  if (list1.length) {
    try {
      detail = await context.loadDetail(list1[0].link);
      check("loadDetail 返回对象", !!detail && typeof detail === "object");
      check("title 非空", !!detail.title, detail.title);
      check("mediaType = tv", detail.mediaType === "tv");
      const eps = detail.seasons && detail.seasons[0] ? detail.seasons[0].episodes : [];
      check("有剧集", Array.isArray(eps) && eps.length > 0, eps.length + " 集");
      check(
        "每集都有 videoUrl",
        eps.every((e) => e.videoUrl && /^https?:\/\//.test(e.videoUrl))
      );
      info("首集地址: " + (eps[0] ? eps[0].videoUrl : "—"));
      info("描述: " + String(detail.description || "").slice(0, 90).replace(/\n/g, " / "));

      // 直链真实性：抓 m3u8 头，看是否加密、分片是否可下
      if (eps.length) {
        const url = eps[0].videoUrl;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const txt = await res.text();
        check("m3u8 HTTP 200", res.ok, "HTTP " + res.status + " " + (res.headers.get("content-type") || ""));
        check("是有效 HLS 清单", txt.indexOf("#EXTM3U") === 0, txt.slice(0, 24));
        check("无 #EXT-X-KEY（未加密）", txt.indexOf("#EXT-X-KEY") < 0);
        check("点播清单 PLAYLIST-TYPE:VOD", /#EXT-X-PLAYLIST-TYPE:\s*VOD/i.test(txt));
        const segs = (txt.match(/^[^#\n].*$/gm) || []).filter((l) => /\.[a-z0-9]+$/i.test(l.trim()));
        check("含分片", segs.length > 0, segs.length + " 个分片");
        if (segs.length) {
          const segUrl = new URL(segs[0].trim(), url).toString();
          const sres = await fetch(segUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          const buf = Buffer.from(await sres.arrayBuffer());
          const isTs = buf.length > 0 && buf[0] === 0x47;
          const isMp4 = buf.length > 8 && buf.slice(4, 8).toString("ascii") === "ftyp";
          check(
            "首个分片可下且为明文媒体",
            sres.ok && (isTs || isMp4),
            `HTTP ${sres.status} ${buf.length}B ${isTs ? "MPEG-TS(0x47)" : isMp4 ? "MP4(ftyp)" : "未知头 " + buf.slice(0, 4).toString("hex")}`
          );
        }
      }
    } catch (e) {
      check("loadDetail 执行", false, e.message);
    }
  } else {
    check("loadDetail 前置：需要列表数据", false);
  }

  /* --------------------------------------------------------------------- */
  section("阶段 8 · 真实站点：花生短剧（真·多集 + 内联播放地址）");

  try {
    const hsList = await context.getVideoList({ site: "huasheng" });
    check("花生短剧列表有数据", hsList.length > 0, hsList.length + " 条");
    info("样例: " + hsList.slice(0, 3).map((x) => x.title).join(" | "));

    if (hsList.length) {
      const keep = context.MC_CONFIG.maxEpisodes;
      context.MC_CONFIG.maxEpisodes = 3; // 只解析 3 集，控制请求量
      const hsDetail = await context.loadDetail(hsList[0].link);
      context.MC_CONFIG.maxEpisodes = keep;

      const eps = hsDetail.seasons && hsDetail.seasons[0] ? hsDetail.seasons[0].episodes : [];
      check("花生短剧解析出剧集", eps.length > 0, eps.length + " 集（限 3）");
      check("每集都有 videoUrl", eps.length > 0 && eps.every((e) => /^https?:\/\//.test(e.videoUrl || "")));
      info("首集地址: " + (eps[0] ? eps[0].videoUrl : "—"));
      if (eps.length) {
        const r = await fetch(eps[0].videoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const t = await r.text();
        check("花生短剧 m3u8 可访问", r.ok && t.indexOf("#EXTM3U") === 0, "HTTP " + r.status);
        check("花生短剧 m3u8 未加密", t.indexOf("#EXT-X-KEY") < 0);
      }
    }
  } catch (e) {
    check("花生短剧端到端", false, e.message);
  }

  /* --------------------------------------------------------------------- */
  section("阶段 9 · 自动探测：用「自定义站点」强制走探测路径");

  try {
    // 清掉可能存在的探测缓存，强制冷探测
    Widget.storage.remove("maccms_routes_" + new URL(B).host);
    const t0 = Date.now();
    const detectedList = await context.getVideoList({
      site: "custom",
      siteBase: B,
      page: 1
    });
    const ms = Date.now() - t0;
    check("探测后能拉到列表", detectedList.length > 0, detectedList.length + " 条 / " + ms + "ms");

    const routes = context.mcCacheGet(B);
    check("探测结果已写入缓存", !!routes, routes ? JSON.stringify(routes).slice(0, 120) + "…" : "");
    if (routes) {
      check(
        "自探测出详情路由",
        /vod\/detail\/id\/\{id\}/.test(routes.detail || ""),
        routes.detail
      );
      check(
        "自探测出播放路由",
        /vod\/play\/id\/\{id\}\/sid\/\{sid\}\/nid\/\{nid\}/.test(routes.play || ""),
        routes.play
      );
      check("自探测出搜索路由", !!(routes.search || "").indexOf("search") > 0, routes.search);
    }

    // 二次调用应命中缓存（明显更快）
    const t1 = Date.now();
    await context.getVideoList({ site: "custom", siteBase: B, page: 1 });
    check("二次调用命中缓存", Date.now() - t1 < ms, (Date.now() - t1) + "ms < " + ms + "ms");
  } catch (e) {
    check("自动探测端到端", false, e.message);
  }

  /* --------------------------------------------------------------------- */
  section("阶段 10 · 自动探测：花生短剧（自定义伪静态前缀）");

  try {
    const hsBase = "https://www.zywest263.com";
    Widget.storage.remove("maccms_routes_" + new URL(hsBase).host);
    const l = await context.getVideoList({ site: "custom", siteBase: hsBase });
    check("冷探测拉到花生短剧列表", l.length > 0, l.length + " 条");
    const r = context.mcCacheGet(hsBase);
    if (r) {
      check("自探测出 /zywview/ 详情路由", /zywview\/\{id\}/.test(r.detail || ""), r.detail);
      check(
        "搜索路由未被「重写回首页」的假路径骗到",
        /\/search\.html\?searchword=/.test(r.search || ""),
        r.search + "（期望 /search.html?searchword=）"
      );
      info("探测结果: " + JSON.stringify(r));
    }
    // 用探测出来的路由真的搜一次
    const hsSearch = await context.searchVideos({ site: "custom", siteBase: hsBase, keyword: "天医" });
    check("按探测路由搜索有结果", hsSearch.length > 0, hsSearch.length + " 条");
    info("命中: " + hsSearch.slice(0, 4).map((x) => x.title).join(" | "));
  } catch (e) {
    check("花生短剧自动探测", false, e.message);
  }

  /* --------------------------------------------------------------------- */
  section("请求统计（共 " + fetchLog.length + " 次）");
  fetchLog.slice(-28).forEach((f) => {
    console.log(
      `  ${String(f.status).padEnd(4)} ${String(f.bytes).padStart(8)}B ${String(f.ms).padStart(6)}ms  ${f.url}`
    );
  });

  if (widgetLogs.warn.length || widgetLogs.error.length) {
    section("组件内部告警");
    widgetLogs.warn.slice(0, 25).forEach((l) => console.log("  WARN  " + l));
    widgetLogs.error.slice(0, 15).forEach((l) => console.log("  ERROR " + l));
  }

  console.log(
    `\n\x1b[1m结果: ${pass} 通过 / ${fail} 失败\x1b[0m` +
    (fail ? "\n失败项:\n" + problems.map((x) => "  - " + x).join("\n") : "")
  );
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\n自测脚本异常:", e);
  process.exit(1);
});
