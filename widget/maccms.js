/* ============================================================================
 * 苹果CMS（maccms）通用组件 · CapyPlayer
 * ----------------------------------------------------------------------------
 * 苹果CMS 是国内最主流的开源影视建站程序，全网有上万个站点。它们的**数据模型
 * 与播放变量高度统一**，但**路由可被站长自定义**（实测：五五短剧走
 * /index.php/vod/... 标准式；花生短剧走 /zywview/、/zywplay/ 自定义伪静态；
 * 168 影院走 /xzyxvd/ 且播放链接由 JS 生成；网果走 /show/duanju-----------.html）。
 *
 * 因此本组件的核心不是「写死一套路由」，而是：
 *   ① 站点配置表（内置已实测站点，一键可用）
 *   ② 路由自动探测（对任意苹果CMS 站，抓首页 → 嗅探链接形态 → 实测验证 → 缓存）
 *   ③ 播放地址三级回退（player_aaaa → 内联 JS/iframe → 全页扫描 m3u8/mp4）
 *
 * 已实测通过的站点：
 *   · 五五短剧 duanju55.com —— 整剧打包成单个 m3u8，PLAYLIST-TYPE:VOD，无 #EXT-X-KEY，
 *     明文 TS 分片。无试看限制（encrypt=0 / trysee=0）
 *   · 花生短剧 zywest263.com —— 真·多集（每集一个 /zywplay/{id}-{sid}-{nid}.html），
 *     播放地址明文写在页面内联 JS 里（无 player_aaaa）
 *
 * 契约遵循：capyplayer.feifeiduck.com/zh/dev/widget/widgetdev
 * ========================================================================== */

/* ------------------------------ 可调配置 ---------------------------------- */

var MC_CONFIG = {
  // 默认站点（对应 MC_SITES 里的 key）
  defaultSite: "duanju55",

  // 「自定义站点」的 key。globalParams.site 选它时读 siteBase
  customSiteKey: "custom",

  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9"
  },

  // 详情页并发解析播放地址的并发数（每集一次请求，别开太大）
  fetchConcurrency: 3,

  // 详情页最多解析多少集。苹果CMS 多集站动辄上百集，全量解析会拖死客户端。
  // 设 null = 不限（谨慎）
  maxEpisodes: 60,

  // 列表页请求超时（秒）
  listTimeoutSeconds: 25,

  // 路由探测结果缓存时长（秒）
  detectCacheSeconds: 86400,

  // 是否允许把探测结果写入 Widget.storage（关掉则每次冷探测，慢）
  cacheDetectedRoutes: true
};

/* ----------------------------------------------------------------------------
 * 内置站点表
 * ----------------------------------------------------------------------------
 * routes 里的占位符：
 *   {base}  站点根地址          {catId} 分类 ID / slug
 *   {page}  页码                {id}    剧集 ID
 *   {sid}   播放线路号          {nid}   集号
 *   {kw}    已 URL 编码的关键词
 *
 * routes 留空 = 完全依赖自动探测（推荐给没实测过的站）。
 * -------------------------------------------------------------------------- */
var MC_SITES = [
  {
    key: "duanju55",
    label: "五五短剧",
    base: "https://www.duanju55.com",
    note: "实测可用 · 整剧打包单个 m3u8 · 无试看限制",
    verified: true,
    routes: {
      category: "{base}/index.php/vod/type/id/{catId}.html",
      categoryPage: "{base}/index.php/vod/type/id/{catId}/page/{page}.html",
      detail: "{base}/index.php/vod/detail/id/{id}.html",
      play: "{base}/index.php/vod/play/id/{id}/sid/{sid}/nid/{nid}.html",
      search: "{base}/index.php/vod/search.html?wd={kw}",
      searchPage: "{base}/index.php/vod/search/page/{page}/wd/{kw}.html"
    },
    categories: [{ id: "1", name: "短剧" }]
  },
  {
    key: "huasheng",
    label: "花生短剧",
    base: "https://www.zywest263.com",
    note: "实测可用 · 真·多集 · 播放地址明文内联",
    verified: true,
    routes: {
      category: "{base}/zywtype/{catId}.html",
      detail: "{base}/zywview/{id}.html",
      play: "{base}/zywplay/{id}-{sid}-{nid}.html",
      search: "{base}/search.html?searchword={kw}"
    },
    categories: [{ id: "27", name: "短剧" }]
  },
  {
    key: "duanju2",
    label: "短剧网站",
    base: "https://www.duanju2.com",
    note: "网果 · 路由未逐条实测，走自动探测",
    verified: false,
    routes: {
      category: "{base}/show/duanju-----------.html",
      detail: "{base}/vod/{id}.html",
      play: "{base}/vodplay/{id}-{sid}-{nid}.html",
      search: "{base}/search/{kw}----------1---.html"
    },
    categories: []
  },
  {
    key: "custom",
    label: "自定义站点（填「站点地址」）",
    base: "",
    note: "任意苹果CMS 站，路由自动探测",
    verified: false,
    routes: null,
    categories: []
  }
];

/* ----------------------------------------------------------------------------
 * 路由形态表（自动探测用）
 * 每条：正则 → 模板。$1..$n 为捕获组。
 * -------------------------------------------------------------------------- */

// 详情页 URL 形态
var MC_DETAIL_SHAPES = [
  // 标准 index.php：/index.php/vod/detail/id/123.html
  { re: /^(.*\/vod\/detail\/id\/)(\d+)(?:\.html)?$/i, tpl: "$1{id}.html" },
  // 去 index.php：/vod/detail/id/123.html
  { re: /^(.*\/voddetail\/)(\d+)(?:\.html)?$/i, tpl: "$1{id}.html" },
  // 自定义前缀：/zywview/123.html、/xzyxvd/123.html、/vod/123.html、/detail/123.html
  { re: /^(.*\/(?:[\w-]*(?:view|detail|movie|vod|show))\/)(\d+)(?:\.html)?$/i, tpl: "$1{id}.html" },
  // 兜底：任意 /xxx/123.html
  { re: /^(.*\/)(\d+)(?:\.html)?$/i, tpl: "$1{id}.html" }
];

// 播放页 URL 形态
var MC_PLAY_SHAPES = [
  // 标准：/index.php/vod/play/id/123/sid/1/nid/1.html
  { re: /^(.*\/vod\/play\/id\/)(\d+)(\/sid\/)(\d+)(\/nid\/)(\d+)(?:\.html)?$/i,
    tpl: "$1{id}$3{sid}$5{nid}.html" },
  // 去 index.php：/vodplay/123-1-1.html
  { re: /^(.*\/vodplay\/)(\d+)-(\d+)-(\d+)(?:\.html)?$/i, tpl: "$1{id}-{sid}-{nid}.html" },
  // 自定义：/zywplay/123-0-0.html
  { re: /^(.*\/(?:[\w-]*play)\/)(\d+)-(\d+)-(\d+)(?:\.html)?$/i, tpl: "$1{id}-{sid}-{nid}.html" },
  // 兜底：/xxx/123-1-1.html
  { re: /^(.*\/)(\d+)-(\d+)-(\d+)(?:\.html)?$/i, tpl: "$1{id}-{sid}-{nid}.html" }
];

/* ------------------------------ 元数据 ------------------------------------ */

var WidgetMetadata = {
  id: "maccms_generic",
  title: "苹果CMS 影视",
  description:
    "苹果CMS（maccms）站群通用适配器：内置五五短剧 / 花生短剧，也可填任意苹果CMS 站地址，" +
    "路由自动探测。支持分类浏览、关键词搜索、多线路多集播放。",
  version: "1.0.0",
  author: "CapyPlayer Widget",
  site: "https://www.duanju55.com",
  globalParams: [
    {
      name: "site",
      label: "站点",
      type: "enum",
      defaultValue: "duanju55",
      enumOptions: (function () {
        var out = [];
        for (var i = 0; i < MC_SITES.length; i++) {
          out.push({ title: MC_SITES[i].label, value: MC_SITES[i].key });
        }
        return out;
      })()
    },
    {
      name: "siteBase",
      label: "站点地址",
      type: "string",
      defaultValue: "",
      description: "仅当「站点」选「自定义站点」时生效。例：https://www.example.com"
    },
    {
      name: "catId",
      label: "分类 ID",
      type: "string",
      defaultValue: "",
      description: "留空则用站点默认分类；分类页会自带该参数"
    }
  ],
  modules: [
    {
      id: "categories",
      title: "分类",
      type: "category",
      functionName: "getCategories",
      description: "自动嗅探站点分类入口",
      cacheDuration: 86400,
      timeoutSeconds: 25,
      params: []
    },
    {
      id: "browse",
      title: "影视库",
      type: "media_list",
      functionName: "getVideoList",
      description: "按分类分页浏览",
      cacheDuration: 600,
      timeoutSeconds: 30,
      params: [{ name: "page", label: "页码", type: "page" }]
    },
    {
      id: "search",
      title: "搜索",
      type: "media_list",
      functionName: "searchVideos",
      description: "按片名关键词搜索",
      cacheDuration: 300,
      timeoutSeconds: 30,
      params: [
        { name: "keyword", label: "关键词", type: "string", required: true },
        { name: "page", label: "页码", type: "page" }
      ]
    }
  ]
};

/* ============================================================================
 * 一、基础工具
 * ========================================================================== */

function mcFirst() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v === null || v === undefined) continue;
    var s = String(v).trim();
    if (s !== "" && s !== "null" && s !== "undefined" && s !== "<nil>") return s;
  }
  return "";
}

function mcEnsureArray(v) {
  return Array.isArray(v) ? v : [];
}

function mcIsNum(v) {
  var s = mcFirst(v);
  return /^[0-9]{1,20}$/.test(s) ? s : "";
}

/* 去 HTML 标签 + 常见实体，压平空白 */
function mcPlain(raw) {
  var s = mcFirst(raw);
  if (!s) return "";
  if (s.indexOf("<") >= 0) {
    s = s.replace(/<[^>]{0,600}>/g, " ");
  }
  s = s.replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d{1,6});/g, function (m, d) {
      var n = parseInt(d, 10);
      return isFinite(n) && n > 0 && n < 1114112 ? String.fromCharCode(n) : m;
    });
  return s.replace(/\s+/g, " ").trim();
}

/* 绝对化 URL；非 http(s) 返回空 */
function mcAbs(href, base) {
  var s = mcFirst(href);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf("//") === 0) return "https:" + s;
  if (s.charAt(0) === "/") {
    var origin = mcOrigin(base);
    return origin ? origin + s : "";
  }
  if (/^(#|javascript:|mailto:|tel:)/i.test(s)) return "";
  // 相对路径
  var b = mcFirst(base);
  if (!b) return "";
  var cut = b.indexOf("?");
  if (cut >= 0) b = b.slice(0, cut);
  cut = b.indexOf("#");
  if (cut >= 0) b = b.slice(0, cut);
  if (b.charAt(b.length - 1) !== "/") {
    var slash = b.lastIndexOf("/");
    // 末段含点视为文件名，截断它
    var tail = b.slice(slash + 1);
    b = tail.indexOf(".") >= 0 ? b.slice(0, slash + 1) : b + "/";
  }
  return b + s;
}

function mcOrigin(url) {
  var m = String(url || "").match(/^(https?:\/\/[^/]+)/i);
  return m ? m[1] : "";
}

function mcHost(url) {
  var m = String(url || "").match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/* 只取路径（去 host / query / fragment） */
function mcPath(url) {
  var s = mcFirst(url);
  if (!s) return "";
  var m = s.match(/^https?:\/\/[^/]*(\/[^?#]*)?/i);
  var p = (m ? m[1] : s.split("?")[0].split("#")[0]) || "/";
  return p;
}

function mcNormBase(raw) {
  var s = mcFirst(raw);
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s.replace(/\/+$/, "");
}

/* 模板填充 */
function mcFill(tpl, vars) {
  var out = String(tpl || "");
  for (var k in vars) {
    if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
    var val = vars[k] === null || vars[k] === undefined ? "" : String(vars[k]);
    out = out.split("{" + k + "}").join(val);
  }
  return out;
}

function mcEncode(v) {
  return encodeURIComponent(mcFirst(v));
}

/* 形态表/泛化出来的模板都是「纯路径」，必须补上 {base} 才是可请求的绝对地址 */
function mcAbsTpl(tpl) {
  var t = mcFirst(tpl);
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.charAt(0) !== "/") t = "/" + t;
  return "{base}" + t;
}

/* ============================================================================
 * 二、HTTP
 * ========================================================================== */

/* 把任意响应体统一成文本 */
function mcBodyText(resp) {
  if (!resp) return "";
  var d = resp.data;
  if (typeof d === "string") return d;
  if (d === null || d === undefined) return "";
  if (typeof d === "object") {
    try {
      return JSON.stringify(d);
    } catch (e) {
      return "";
    }
  }
  return String(d);
}

async function mcGet(url, referer) {
  var headers = {};
  var src = MC_CONFIG.headers;
  for (var k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) headers[k] = src[k];
  }
  headers.Referer = mcFirst(referer) || mcOrigin(url) + "/";

  var resp = await Widget.http.get(url, { headers: headers });
  if (!resp || !resp.ok) {
    throw new Error("HTTP " + (resp ? resp.status : "?") + " " + mcShort(url));
  }
  return mcBodyText(resp);
}

function mcShort(url) {
  var s = String(url || "");
  var q = s.indexOf("?");
  return q >= 0 ? s.slice(0, q) : s;
}

/* 探测用：失败不抛，返回 "" */
async function mcTryGet(url, referer) {
  try {
    return await mcGet(url, referer);
  } catch (e) {
    console.log("苹果CMS: 请求失败 " + mcShort(url) + " - " + (e && e.message));
    return "";
  }
}

/* ============================================================================
 * 三、缓存（Widget.storage）
 * ========================================================================== */

function mcCacheKey(base) {
  return "maccms_routes_" + mcHost(base);
}

function mcCacheGet(base) {
  if (!MC_CONFIG.cacheDetectedRoutes) return null;
  try {
    var raw = Widget.storage.get(mcCacheKey(base), null);
    if (typeof raw === "string" && raw) raw = JSON.parse(raw);
    if (!raw || typeof raw !== "object") return null;
    var age = Math.floor(Date.now() / 1000) - (raw.at || 0);
    if (age < 0 || age > MC_CONFIG.detectCacheSeconds) return null;
    return raw.routes || null;
  } catch (e) {
    return null;
  }
}

function mcCacheSet(base, routes) {
  if (!MC_CONFIG.cacheDetectedRoutes) return;
  try {
    Widget.storage.set(
      mcCacheKey(base),
      JSON.stringify({ at: Math.floor(Date.now() / 1000), routes: routes })
    );
  } catch (e) {
    // 忽略：缓存失败不影响功能
  }
}

/* ============================================================================
 * 四、站点解析
 * ========================================================================== */

function mcSiteByKey(key) {
  var k = mcFirst(key);
  for (var i = 0; i < MC_SITES.length; i++) {
    if (MC_SITES[i].key === k) return MC_SITES[i];
  }
  return null;
}

/* 从 params 里解析出 { base, siteKey, site } */
function mcResolveSite(params) {
  var p = params || {};
  var key = mcFirst(p.site) || MC_CONFIG.defaultSite;
  var site = mcSiteByKey(key);

  // 选了「自定义站点」或填了 siteBase（且与内置站 base 不同）时，以 siteBase 为准
  var custom = mcNormBase(p.siteBase);
  if (custom && (key === MC_CONFIG.customSiteKey || !site)) {
    return { base: custom, siteKey: MC_CONFIG.customSiteKey, site: null, custom: true };
  }
  if (!site) site = mcSiteByKey(MC_CONFIG.defaultSite);
  return { base: custom && !site.base ? custom : site.base, siteKey: site.key, site: site, custom: false };
}

/* ============================================================================
 * 五、HTML 锚点分组（自动探测的核心）
 * ----------------------------------------------------------------------------
 * 思路：把页面里所有 <a href> 按「路径形态」分组（数字段归一成 #），
 * 成员数最多、且数字段确实在变化的组，就是「详情链接组」。
 * 这样无需预先知道站长用什么前缀。
 * ========================================================================== */

var MC_ANCHOR_RE = /<a\b([^>]*)>([\s\S]{0,900}?)<\/a>/gi;

function mcSignature(path) {
  return String(path || "").replace(/[0-9]+/g, "#");
}

/* 抽取页面里所有锚点，返回 [{ href, path, text, hasImg, kind }] */
function mcCollectAnchors(html, base) {
  var out = [];
  if (typeof html !== "string" || !html) return out;
  if (/<a\b/i.test(html) === false) return out;

  var origin = mcOrigin(base);
  var re = new RegExp(MC_ANCHOR_RE.source, "gi");
  var m;
  var guard = 0;
  while ((m = re.exec(html)) !== null) {
    if (++guard > 4000) break; // 防病态页面卡死
    var attrs = m[1] || "";
    var inner = m[2] || "";
    var hm = attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || attrs.match(/\bhref\s*=\s*'([^']*)'/i);
    if (!hm) continue;
    var href = mcFirst(hm[1]);
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    var abs = mcAbs(href, base);
    if (!abs) continue;
    // 只保留同源链接，避免把广告/友链当数据
    if (origin && mcOrigin(abs) !== origin) continue;

    var tm = attrs.match(/\btitle\s*=\s*"([^"]*)"/i);
    var am = inner.match(/\balt\s*=\s*"([^"]*)"/i);
    var text = mcPlain(tm ? tm[1] : "");
    if (!text) text = mcPlain(am ? am[1] : "");
    if (!text) text = mcPlain(inner);

    out.push({
      href: abs,
      path: mcPath(abs),
      text: text,
      hasImg: /<img\b/i.test(inner),
      start: typeof m.index === "number" ? m.index : 0
    });
  }
  return out;
}

/* 把一组同形态锚点泛化成模板：变化的数字段 → 占位符 */
function mcGeneralize(group, names) {
  var samples = [];
  for (var i = 0; i < group.length; i++) {
    // 用 path 数字段做拆分（保留 .html 之类后缀）
    var parts = group[i].path.split(/([0-9]+)/);
    samples.push(parts);
  }
  var len = samples[0].length;
  for (var s = 1; s < samples.length; s++) {
    if (samples[s].length !== len) return null; // 形态不一致
  }

  // 找出每个偶数位（数字段）是否变化
  var varying = [];
  for (var pos = 1; pos < len; pos += 2) {
    var first = samples[0][pos];
    var differs = false;
    for (var s2 = 0; s2 < samples.length; s2++) {
      if (samples[s2][pos] !== first) { differs = true; break; }
    }
    varying.push({ pos: pos, differs: differs });
  }
  if (!varying.length) return null;

  // 只有「恰好一个变化段」时才安全泛化，多变化段交给形态表处理
  var varied = varying.filter(function (v) { return v.differs; });
  if (varied.length !== 1) return null;

  var target = varied[0].pos;
  var name = names && names.length ? names[0] : "id";
  var out = [];
  for (var j = 0; j < len; j++) {
    if (j === target) out.push("{" + name + "}");
    else out.push(samples[0][j]);
  }
  return { tpl: out.join(""), sample: samples[0][target] };
}

/* 找「详情链接组」 */
function mcDetectDetailGroup(html, base) {
  var anchors = mcCollectAnchors(html, base);
  if (!anchors.length) return null;

  var groups = {};
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    var sig = mcSignature(a.path);
    if (!/#/.test(sig)) continue;           // 不含数字的路径不是详情页
    if (/\/page\//.test(a.path)) continue;  // 分页
    if (!groups[sig]) groups[sig] = [];
    groups[sig].push(a);
  }

  // 先按形态表精确匹配
  var shapes = MC_DETAIL_SHAPES;
  var best = null;
  for (var sig2 in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, sig2)) continue;
    var list = groups[sig2];
    if (list.length < 2) continue;
    if (!mcGroupDigitsVary(list)) continue;

    for (var s = 0; s < shapes.length; s++) {
      var mm = list[0].path.match(shapes[s].re);
      if (!mm) continue;
      var tpl = shapes[s].tpl.replace(/\$(\d)/g, function (_, d) {
        return mm[parseInt(d, 10)] || "";
      });
      if (tpl.indexOf("{id}") < 0) continue;
      var cand = { tpl: mcAbsTpl(tpl), sample: mm[mm.length - 1], count: list.length, shape: s };
      if (!best || cand.count > best.count || cand.shape < best.shape) best = cand;
      break;
    }
  }
  if (best) return best;

  // 形态表没命中 → 用「成员数最多的可变数组」泛化
  var groups2 = [];
  for (var sig3 in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, sig3)) continue;
    var l2 = groups[sig3];
    if (l2.length < 1) continue;
    if (l2.length > 1 && !mcGroupDigitsVary(l2)) continue;
    groups2.push(l2);
  }
  groups2.sort(function (a, b) { return b.length - a.length; });
  for (var g = 0; g < groups2.length; g++) {
    var gen = mcGeneralize(groups2[g], ["id"]);
    if (gen) return { tpl: mcAbsTpl(gen.tpl), sample: gen.sample, count: groups2[g].length, shape: 99 };
  }
  return null;
}

function mcGroupDigitsVary(list) {
  if (list.length < 2) return true;
  var first = list[0].path;
  for (var i = 1; i < list.length; i++) {
    if (list[i].path !== first) return true;
  }
  return false;
}

/* 找「分类链接组」（在首页上跑） */
/* 只过滤「确定不是分类」的导航词。电影/电视剧/动漫/综艺这类是正经分类，别误杀 */
var MC_NAV_BLACKLIST = /^(首页|主页|全部|更多|更多»|上一页|下一页|末页|尾页|搜索|登录|注册|APP|客户端|下载|留言|关于|反馈|返回|筛选|手机版|电脑版|网站地图|友情链接|版权声明)$/;

function mcDetectCategoryGroups(html, base, homeUrl) {
  var anchors = mcCollectAnchors(html, base);
  var groups = {};
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    if (a.hasImg) continue;                       // 分类入口一般不带图
    if (a.text.length === 0 || a.text.length > 12) continue;
    if (MC_NAV_BLACKLIST.test(a.text)) continue;
    if (a.href === homeUrl) continue;
    if (/\/vod\/play\/|\/vodplay\/|play\//i.test(a.path)) continue;
    var sig = mcSignature(a.path);
    if (!groups[sig]) groups[sig] = [];
    groups[sig].push(a);
  }

  var listed = [];
  for (var sig2 in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, sig2)) continue;
    var list = groups[sig2];
    // 分类形态提示：目录段含 type/show/list/class/vod，或以 t 结尾（xzyxvt / zywtype 这类）
    var seg0 = list[0].path.replace(/^\//, "").split("/")[0] || "";
    var hint = /(?:type|show|list|class|vod)/i.test(seg0) ||
      /t$/.test(seg0) ||
      /(?:vod\/type|vod\/show|vodshow|vodtype|type\/id)/i.test(list[0].path);
    listed.push({ sig: sig2, list: list, hint: !!hint });
  }
  // 形态提示优先，其次成员数
  listed.sort(function (a, b) {
    if (a.hint !== b.hint) return a.hint ? -1 : 1;
    return b.list.length - a.list.length;
  });
  return listed;
}

/* 由分类链接泛化出分类模板 */
function mcCategoryTplFromAnchors(list) {
  // 先用形态表（分类的形态比详情复杂，单独处理）
  var shapes = [
    { re: /^(.*\/vod\/type\/id\/)(\d+)(?:\/page\/\d+)?(?:\.html)?$/i, tpl: "$1{catId}.html" },
    { re: /^(.*\/vod\/show\/id\/)(\d+)(?:\/page\/\d+)?(?:\.html)?$/i, tpl: "$1{catId}.html" },
    { re: /^(.*\/vodtype\/)(\d+)(?:\.html)?$/i, tpl: "$1{catId}.html" },
    { re: /^(.*\/vodshow\/)(\d+)(?:-+)(\d+)?(?:-+)?(?:\.html)?$/i, tpl: "$1{catId}--------1---.html" },
    // 自定义前缀：/zywtype/27.html、/xzyxvt/duanjun.html、/type/duanju.html
    { re: /^(.*\/(?:[\w-]*(?:type|t|list|class))\/)([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})(?:\.html)?$/i,
      tpl: "$1{catId}.html" },
    { re: /^(.*\/)([A-Za-z0-9_\u4e00-\u9fa5-]{1,24})(?:\.html)?$/, tpl: "$1{catId}.html" }
  ];
  for (var s = 0; s < shapes.length; s++) {
    var mm = list[0].path.match(shapes[s].re);
    if (!mm) continue;
    var tpl = shapes[s].tpl.replace(/\$(\d)/g, function (_, d) {
      return mm[parseInt(d, 10)] || "";
    });
    if (tpl.indexOf("{catId}") < 0) continue;
    return { tpl: mcAbsTpl(tpl), sample: mm[2] };
  }
  // 泛化兜底
  var gen = mcGeneralize(list, ["catId"]);
  if (!gen) return null;
  return { tpl: mcAbsTpl(gen.tpl), sample: gen.sample };
}

/* 找分页模板 */
function mcDetectPageTpl(html, base, catPath) {
  var anchors = mcCollectAnchors(html, base);
  var baseSig = mcSignature(catPath);
  // 优先：同一分类下多出 /page/N 的链接
  for (var i = 0; i < anchors.length; i++) {
    var p = anchors[i].path;
    if (!/\/page\/\d+/i.test(p)) continue;
    var m = p.match(/^(.*?)\/page\/(\d+)(?:\.html)?$/i);
    if (m) {
      return { tpl: m[1] + "/page/{page}.html", mode: "path" };
    }
  }
  return null;
}

/* ============================================================================
 * 六、列表页解析
 * ========================================================================== */

var MC_REMARK_CLASS = /class\s*=\s*"[^"]*(?:pic-text|module-item-note|imagelabel|meta-post-type|totalChapterNum|bookType|remarks|note|text-right|update)[^"]*"[^>]*>([^<]{1,24})</i;

/* 从列表页 HTML 抽条目。routes.detail.tpl 用于识别与构造 link */
function mcParseList(html, base, detailTpl, siteKey) {
  var anchors = mcCollectAnchors(html, base);
  var origin = mcOrigin(base);
  var out = [];
  var seen = {};

  // 先从 detailTpl 反推一个判定正则
  var judge = mcTemplateToRegex(detailTpl);

  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    if (mcOrigin(a.href) !== origin) continue;
    if (judge && !judge.test(a.path)) continue;
    if (!judge && !/#/.test(a.path)) continue;

    var id = mcIdFromPath(a.path);
    if (!id || seen[id]) continue;

    // 标题：锚点自身 title/alt/文本 → 向后窗口里的 h4/标题链接
    var title = mcFirst(a.text);
    var poster = "";
    var remark = "";

    // 抓锚点附近的原始 HTML 窗口（往后 1100 字），补封面与备注
    var from = a.start;
    var win = html.slice(from, from + 1100);

    var pm = win.match(/\b(?:data-original|data-src|data-echo|data-lazy)\s*=\s*"([^"]+)"/i) ||
             win.match(/\bsrc\s*=\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
    if (pm) poster = mcAbs(pm[1], base);

    var rm = win.match(MC_REMARK_CLASS);
    if (rm) remark = mcPlain(rm[1]);

    if (!title) {
      var hm = win.match(/<h4[^>]*>[\s\S]{0,200}?title\s*=\s*"([^"]{1,120})"/i) ||
               win.match(/<h4[^>]*>[\s\S]{0,200}?<a[^>]*>([\s\S]{0,80}?)<\/a>/i);
      if (hm) title = mcPlain(hm[1]);
    }
    if (!title) {
      var am = win.match(/\balt\s*=\s*"([^"]{1,120})"/i);
      if (am) title = mcPlain(am[1]);
    }
    if (!title) title = "影视 " + id;

    // 清理常见 SEO 尾巴
    title = title.replace(/\s*[-_|]\s*(免费|在线观看|高清|全集|完整版).*$/g, "").trim();
    if (!title) title = "影视 " + id;

    // 备注里抠集数
    var epCount = mcEpisodeNum(remark);

    seen[id] = true;
    var item = {
      id: siteKey + "_" + id,
      type: "link",
      link: mcFill(detailTpl, { base: base, id: id }),
      title: title,
      mediaType: "tv"
    };
    if (poster) item.posterUrl = poster;
    if (remark) item.remarks = remark;
    if (epCount) item.episodeCount = epCount;
    out.push(item);
  }
  return out;
}

/* 由模板生成「路径判定正则」（把 {xxx} 换成数字/短串） */
function mcTemplateToRegex(tpl) {
  var t = mcFirst(tpl);
  if (!t) return null;
  // 关键：{base} 是站点前缀，不能当占位符转成 \d+，必须先剥掉
  t = t.replace(/^\{base\}/i, "").replace(/^https?:\/\/[^/]+/i, "");
  var p = mcPath(t);
  if (!p) return null;
  // 归一：占位符 → 数字段；数字段 → 数字段
  var escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  escaped = escaped.replace(/\\\{[a-zA-Z]+\\\}/g, "\\d+");
  escaped = escaped.replace(/[0-9]+/g, "\\d+");
  try {
    return new RegExp("^" + escaped + "$");
  } catch (e) {
    return null;
  }
}

/* 从路径里取剧集 ID：最后一个数字段，或最后一个数字 */
function mcIdFromPath(path) {
  var p = mcFirst(path);
  if (!p) return "";
  var noExt = p.replace(/\.html?$/i, "");
  var segs = noExt.split("/").filter(function (s) { return s !== ""; });
  for (var i = segs.length - 1; i >= 0; i--) {
    if (/^[0-9]{1,20}$/.test(segs[i])) return segs[i];
    var m = segs[i].match(/([0-9]{1,20})$/);
    if (m) return m[1];
  }
  return "";
}

function mcEpisodeNum(text) {
  var s = mcFirst(text);
  if (!s) return 0;
  var m = s.match(/(\d{1,5})\s*(?:集|話|话)/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/更新至\s*(\d{1,5})/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

/* ============================================================================
 * 七、详情页解析
 * ========================================================================== */

var MC_TITLE_SUFFIX = /[\s\-_|·—]*\s*(?:免费在线观看|在线观看|免费观看|高清完整版|完整版|全集|在线播放|高清|免费|全集免费).*$/;

function mcParseDetailFields(html, base) {
  var out = { title: "", poster: "", description: "", tags: [], year: null, credits: [] };

  // 标题：h1 > og:title > <title> 裁剪
  var h1 = html.match(/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/i);
  if (h1) out.title = mcPlain(h1[1]);
  if (!out.title) {
    var og = html.match(/<meta[^>]*(?:property|name)\s*=\s*["']og:title["'][^>]*content\s*=\s*"([^"]*)"/i) ||
             html.match(/<meta[^>]*content\s*=\s*"([^"]*)"[^>]*(?:property|name)\s*=\s*["']og:title["']/i);
    if (og) out.title = mcPlain(og[1]);
  }
  if (!out.title) {
    var t = html.match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i);
    if (t) {
      var raw = mcPlain(t[1]);
      var cut = raw.split(/\s*[-_|]\s*/)[0];
      out.title = mcFirst(cut, raw);
    }
  }
  out.title = out.title.replace(MC_TITLE_SUFFIX, "").replace(/^《|》$/g, "").trim();

  // 封面
  var pic = html.match(/<meta[^>]*(?:property|name)\s*=\s*["']og:image["'][^>]*content\s*=\s*"([^"]*)"/i) ||
            html.match(/\b(?:data-original|data-src)\s*=\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) ||
            html.match(/\bsrc\s*=\s*"(https?:\/\/[^"]+\/upload\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  if (pic) out.poster = mcAbs(pic[1], base);

  // 简介
  var dm = html.match(/<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*"([^"]*)"/i);
  if (dm) out.description = mcPlain(dm[1]);
  if (!out.description) {
    var dc = html.match(/<div[^>]*class\s*=\s*"[^"]*(?:introduction|detail-content|video-info-content|module-info-introduction)[^"]*"[^>]*>([\s\S]{0,2000}?)<\/div>/i);
    if (dc) out.description = mcPlain(dc[1]);
  }
  out.description = mcFirst(out.description).slice(0, 800);

  // 标签：分类链接文本
  var tagRe = /<a\b[^>]*href\s*=\s*"[^"]*(?:vod\/type| vodtype|\/vodshow\/|type\/id|\/zywtype\/|\/xzyxvt\/)[^"]*"[^>]*>([^<]{1,16})<\/a>/gi;
  var tm;
  var guard = 0;
  while ((tm = tagRe.exec(html)) !== null && guard++ < 60) {
    var txt = mcPlain(tm[1]);
    if (!txt || MC_NAV_BLACKLIST.test(txt)) continue;
    if (out.tags.indexOf(txt) < 0) out.tags.push(txt);
  }

  // 演员
  var castRe = /<a\b[^>]*href\s*=\s*"[^"]*(?:actor|star|celebrity|\/search)[^"]*"[^>]*>([^<]{1,20})<\/a>/gi;
  var cm;
  var g2 = 0;
  while ((cm = castRe.exec(html)) !== null && g2++ < 30) {
    var nm = mcPlain(cm[1]);
    if (!nm || nm.length > 12) continue;
    var dup = false;
    for (var i = 0; i < out.credits.length; i++) if (out.credits[i].name === nm) dup = true;
    if (!dup) out.credits.push(nm);
  }

  // 年份
  var ym = html.match(/(?:vod_year|年份)[^0-9]{0,20}((?:19|20)\d{2})/) ||
           html.match(/((?:19|20)\d{2})\s*年/);
  if (ym) out.year = ym[1];

  return out;
}

/* 抽详情页里的所有播放链接，按线路分组 */
function mcParsePlayLinks(html, base) {
  var anchors = mcCollectAnchors(html, base);
  var origin = mcOrigin(base);
  var list = [];
  var seen = {};

  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i];
    if (mcOrigin(a.href) !== origin) continue;
    var parsed = mcParsePlayPath(a.path);
    if (!parsed) continue;
    var key = parsed.id + "/" + parsed.sid + "/" + parsed.nid;
    if (seen[key]) continue;
    seen[key] = true;
    list.push({
      href: a.href,
      path: a.path,
      id: parsed.id,
      sid: parsed.sid,
      nid: parsed.nid,
      title: a.text,
      shape: parsed.shape
    });
  }
  return list;
}

/* 解析播放路径 → {id, sid, nid, shape} */
function mcParsePlayPath(path) {
  var p = mcFirst(path);
  if (!p) return null;
  var shapes = MC_PLAY_SHAPES;
  for (var s = 0; s < shapes.length; s++) {
    var m = p.match(shapes[s].re);
    if (m) {
      if (s === 0) return { id: m[2], sid: m[4], nid: m[6], shape: s };
      return { id: m[2], sid: m[3], nid: m[4], shape: s };
    }
  }
  return null;
}

/* ============================================================================
 * 八、播放页解析（三级回退）
 * ========================================================================== */

var MC_MEDIA_URL_RE = /https?:\/\/[^\s"'<>,、；;）)】\]]{6,600}?\.(?:m3u8|mp4|flv)(?:\?[^\s"'<>,、；;）)】\]]{0,300})?/gi;

function mcParsePlayer(html) {
  var out = { videoUrl: "", encrypt: 0, trysee: 0, from: "", raw: "", mode: "" };
  if (typeof html !== "string" || !html) return out;

  // ---- 一级：标准 player_aaaa ----
  var json = mcExtractBraceObject(html, "player_aaaa");
  if (json) {
    var info = null;
    try { info = JSON.parse(json); } catch (e) { info = null; }
    if (info && typeof info === "object") {
      out.raw = json;
      out.encrypt = parseInt(mcFirst(info.encrypt, 0), 10) || 0;
      out.trysee = parseInt(mcFirst(info.trysee, 0), 10) || 0;
      out.from = mcFirst(info.from, info.server);
      var u = mcFirst(info.url);
      if (u) {
        out.videoUrl = u.replace(/\\\//g, "/");
        out.mode = "player_aaaa";
        return out;
      }
      out.mode = "player_aaaa(no-url)";
    }
  }

  // ---- 二级：内联 iframe / player.php?xxx,<url>,yyy ----
  var ifr = html.match(/<iframe\b[^>]*\bsrc\s*=\s*"([^"]{10,2000})"/i);
  if (ifr) {
    var src = ifr[1].replace(/\\\//g, "/");
    var inner = mcFirstMediaUrl(src);
    if (inner) {
      out.videoUrl = inner;
      out.mode = "iframe";
      return out;
    }
  }
  // player/xxx.php?<title>,<m3u8>,<next> 这种拼接式
  var php = html.match(/player\/[\w.-]*\.php\?[^"']{0,400}?,(https?:\/\/[^,"']{6,400}\.(?:m3u8|mp4)[^,"']*)/i);
  if (php) {
    out.videoUrl = php[1].replace(/\\\//g, "/");
    out.mode = "player-php";
    return out;
  }

  // ---- 三级：全页扫描 ----
  var scanned = mcScanMediaUrls(html);
  if (scanned.length) {
    out.videoUrl = scanned[0];
    out.mode = "scan";
    return out;
  }

  return out;
}

/* 括号配对抠出 VAR = {...}，避免正则被嵌套对象截断 */
function mcExtractBraceObject(html, varName) {
  var keyIdx = html.indexOf(varName);
  while (keyIdx >= 0) {
    var eq = html.indexOf("=", keyIdx + varName.length);
    if (eq < 0) return "";
    // "=" 与 "{" 之间必须是空白，排除 == / => 之类
    var between = html.slice(keyIdx + varName.length, eq);
    if (!/^\s*$/.test(between)) {
      keyIdx = html.indexOf(varName, keyIdx + varName.length);
      continue;
    }
    var start = html.indexOf("{", eq);
    if (start < 0) return "";
    if (start - eq > 8) {
      keyIdx = html.indexOf(varName, keyIdx + varName.length);
      continue;
    }
    var depth = 0, inStr = false, escaped = false, end = -1;
    for (var i = start; i < html.length; i++) {
      var ch = html.charAt(i);
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end < 0) return "";
    return html.slice(start, end);
  }
  return "";
}

function mcFirstMediaUrl(text) {
  var list = mcScanMediaUrls(text || "");
  return list.length ? list[0] : "";
}

/* 扫描页面里所有媒体直链，打分排序（优 m3u8、优 index/master 命名） */
function mcScanMediaUrls(html) {
  if (typeof html !== "string" || !html) return [];
  var re = new RegExp(MC_MEDIA_URL_RE.source, "gi");
  var found = {};
  var m;
  var guard = 0;
  while ((m = re.exec(html)) !== null && guard++ < 400) {
    var u = m[0].replace(/\\\//g, "/").replace(/[,\s]+$/, "");
    if (!/^https?:\/\//i.test(u)) continue;
    // 排除明显的静态资源/广告
    if (/\.(?:js|css|jpg|jpeg|png|gif|webp|woff2?)($|\?)/i.test(u)) continue;
    if (!found[u]) found[u] = 0;
    found[u] += 1;
  }
  var list = [];
  for (var u2 in found) {
    if (!Object.prototype.hasOwnProperty.call(found, u2)) continue;
    var score = 0;
    if (/\.m3u8($|\?)/i.test(u2)) score += 100;
    if (/\/(?:index|master|playlist)\.m3u8/i.test(u2)) score += 40;
    if (/\/(?:hls|vod|share|video)s?\//i.test(u2)) score += 15;
    if (/\.mp4($|\?)/i.test(u2)) score += 20;
    // 越长路径通常越具体
    score += Math.min(20, u2.length / 30);
    list.push({ url: u2, score: score });
  }
  list.sort(function (a, b) { return b.score - a.score; });
  return list.map(function (x) { return x.url; });
}

/* ============================================================================
 * 九、路由装配与自动探测
 * ========================================================================== */

/* 由分类 URL 推导分页 URL */
function mcDerivePageUrl(catUrl, page) {
  var n = parseInt(page, 10);
  if (!isFinite(n) || n < 2) return catUrl;
  var m = String(catUrl).match(/^(.*?)(\.html?)$/i);
  if (m) return m[1] + "/page/" + n + ".html";
  if (/\/page\/\d+/i.test(catUrl)) {
    return catUrl.replace(/\/page\/\d+/i, "/page/" + n);
  }
  return catUrl + (catUrl.indexOf("?") >= 0 ? "&" : "?") + "page=" + n;
}

/* 取站点路由：内置 → 缓存 → 探测 */
async function mcRoutesFor(base, site) {
  var b = mcNormBase(base);
  if (!b) throw new Error("站点地址为空");

  // 内置且声明了完整路由：先用内置，但仍允许被探测结果覆盖（内置未实测时）
  var preset = site && site.routes ? mcCloneRoutes(site.routes) : null;
  if (preset && site.verified) return preset;

  var cached = mcCacheGet(b);
  if (cached) return cached;

  console.log("苹果CMS: 开始探测路由 " + mcHost(b));
  var detected = await mcDetectRoutes(b, preset);
  if (detected) {
    mcCacheSet(b, detected);
    return detected;
  }
  if (preset) {
    console.log("苹果CMS: 探测失败，回退内置路由");
    return preset;
  }
  throw new Error("无法识别该站点的苹果CMS 路由，请确认地址是否正确");
}

function mcCloneRoutes(r) {
  var out = {};
  for (var k in r) {
    if (Object.prototype.hasOwnProperty.call(r, k)) out[k] = r[k];
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * 探测流程：
 *   ① 抓首页 → 嗅探分类候选
 *   ② 逐个实测分类页，直到能解析出 ≥3 条详情条目
 *   ③ 用详情页链接泛化出详情模板；嗅探分页
 *   ④ 抓一部剧的详情页 → 泛化播放模板
 *   ⑤ 抓该播放页 → 确认取流方式（player_aaaa / 内联 / 扫描）
 *   ⑥ 探测搜索路由
 * -------------------------------------------------------------------------- */
async function mcDetectRoutes(base, preset) {
  var homeUrl = base + "/";
  var home = await mcTryGet(homeUrl, homeUrl);
  if (!home) return null;

  var routes = preset ? mcCloneRoutes(preset) : {};
  var catHtml = "";
  var catPath = "";
  var catId = "";

  // ---------- ① 分类候选 ----------
  var candidates = [];

  // 内置分类链接
  var groups = mcDetectCategoryGroups(home, base, homeUrl);
  for (var g = 0; g < groups.length && candidates.length < 6; g++) {
    var gen = mcCategoryTplFromAnchors(groups[g].list);
    if (!gen || !gen.tpl || gen.tpl.indexOf("{catId}") < 0) continue;
    var url = mcFill(gen.tpl, { base: base, catId: gen.sample });
    var dup = false;
    for (var c = 0; c < candidates.length; c++) if (candidates[c].url === url) dup = true;
    if (dup) continue;
    candidates.push({ tpl: gen.tpl, sample: gen.sample, url: url, name: groups[g].list[0].text });
  }

  // 标准路由兜底候选
  var stdCats = [
    "/index.php/vod/type/id/{catId}.html",
    "/index.php/vod/show/id/{catId}.html",
    "/vodtype/{catId}.html",
    "/vodshow/{catId}--------1---.html",
    "/vod/type/id/{catId}.html"
  ];
  var sniffedId = candidates.length ? candidates[0].sample : "";
  for (var s = 0; s < stdCats.length; s++) {
    var id2 = mcIsNum(sniffedId) ? sniffedId : "1";
    var u2 = mcFill("{base}" + stdCats[s], { base: base, catId: id2 });
    var dup2 = false;
    for (var c2 = 0; c2 < candidates.length; c2++) if (candidates[c2].url === u2) dup2 = true;
    if (!dup2) candidates.push({ tpl: "{base}" + stdCats[s], sample: id2, url: u2, name: "" });
  }

  // ---------- ② 实测分类页 ----------
  var detailTpl = routes.detail || "";
  for (var i = 0; i < candidates.length; i++) {
    var cand = candidates[i];
    var page = await mcTryGet(cand.url, homeUrl);
    if (!page || page.length < 600) continue;

    var dg = mcDetectDetailGroup(page, base);
    if (!dg || dg.count < 3) continue;

    // 校验：按该模板构造出的 URL 位数合理
    var probeUrl = mcFill(dg.tpl, { base: base, id: dg.sample });
    if (!/^https?:\/\//i.test(probeUrl)) continue;

    routes.category = cand.tpl;
    routes.detail = dg.tpl;
    routes.defaultCatId = cand.sample;   // 探测时验证过能出数据的分类 ID，供后续兜底
    catHtml = page;
    catPath = mcPath(cand.url);
    catId = cand.sample;

    var pg = mcDetectPageTpl(page, base, catPath);
    if (pg && pg.tpl) routes.categoryPage = pg.tpl;

    console.log(
      "苹果CMS: 路由命中 分类=" + cand.tpl + " 详情=" + dg.tpl +
      "（" + dg.count + " 条样本）"
    );
    break;
  }

  if (!routes.detail) {
    console.log("苹果CMS: 未能识别详情链接形态");
    return null;
  }

  // ---------- ④ 播放模板 ----------
  if (!routes.play) {
    // 从已抓到的分类页里取第一条详情链接，最靠谱
    var firstDetail = "";
    if (catHtml) {
      var anchors = mcCollectAnchors(catHtml, base);
      var judge = mcTemplateToRegex(routes.detail);
      for (var a2 = 0; a2 < anchors.length; a2++) {
        if (judge && judge.test(anchors[a2].path)) { firstDetail = anchors[a2].href; break; }
      }
    }
    if (firstDetail) {
      var detHtml = await mcTryGet(firstDetail, base + catPath);
      if (detHtml) {
        var plays = mcParsePlayLinks(detHtml, base);
        if (plays.length) {
          var gtpl = mcPlayTplFromList(plays);
          if (gtpl) {
            routes.play = gtpl;
            console.log("苹果CMS: 播放路由=" + gtpl + "（" + plays.length + " 个分集链接）");
          }
        } else {
          console.log("苹果CMS: 详情页未找到分集链接（可能是 JS 渲染的站）");
        }
      }
    }
  }

  // ---------- ⑥ 搜索 ----------
  if (!routes.search) {
    var kwEnc = mcEncode("天医");
    var homeHead = home.slice(0, 1500);   // 用于识别「伪静态把未知路径重写回首页」
    var searchCands = [
      "{base}/index.php/vod/search.html?wd={kw}",
      "{base}/index.php/vod/search/wd/{kw}.html",
      "{base}/search.html?searchword={kw}",
      "{base}/search.html?wd={kw}",
      "{base}/vodsearch/{kw}----------1---.html"
    ];
    var judge2 = mcTemplateToRegex(routes.detail);
    for (var sc = 0; sc < searchCands.length; sc++) {
      var surl = mcFill(searchCands[sc], { base: base, kw: kwEnc });
      var shtml = await mcTryGet(surl, homeUrl);
      if (!shtml) continue;

      // ① 必须不是首页的副本（站长的重写兜底会把 404 路径吐成首页）
      if (shtml.slice(0, 1500) === homeHead) {
        console.log("苹果CMS: 搜索候选被重写到首页，跳过 " + mcShort(surl));
        continue;
      }
      // ② 必须真的出现关键词（URL 编码与原文两种形态都认）
      var kwRaw = "天医";
      if (shtml.indexOf(kwRaw) < 0 && shtml.indexOf(kwEnc) < 0) continue;

      var hits = 0;
      var sa = mcCollectAnchors(shtml, base);
      for (var x = 0; x < sa.length; x++) {
        if (judge2 && judge2.test(sa[x].path)) hits++;
      }
      if (hits >= 2) {
        routes.search = searchCands[sc];
        console.log("苹果CMS: 搜索路由=" + searchCands[sc] + "（" + hits + " 条命中）");
        break;
      }
    }
  }

  // 搜索分页（苹果CMS 标准：page/1/wd/xx.html）
  if (routes.search && !routes.searchPage && /wd=\{kw\}/.test(routes.search)) {
    routes.searchPage = routes.search.replace("/search.html?wd={kw}",
      "/search/page/{page}/wd/{kw}.html");
    if (routes.searchPage === routes.search) routes.searchPage = "";
  }

  if (!routes.category) routes.category = "{base}/index.php/vod/type/id/{catId}.html";

  return routes;
}

/* 由分集链接列表泛化出播放模板 */
function mcPlayTplFromList(plays) {
  var shapes = MC_PLAY_SHAPES;
  for (var s = 0; s < shapes.length; s++) {
    var m = plays[0].path.match(shapes[s].re);
    if (!m) continue;
    var tpl = shapes[s].tpl.replace(/\$(\d)/g, function (_, d) {
      return m[parseInt(d, 10)] || "";
    });
    if (tpl.indexOf("{id}") >= 0 && tpl.indexOf("{sid}") >= 0 && tpl.indexOf("{nid}") >= 0) {
      return mcAbsTpl(tpl);
    }
  }
  return "";
}

/* ============================================================================
 * 十、模块实现
 * ========================================================================== */

/* 模块 1：分类 */
async function getCategories(params) {
  var p = params || {};
  var resolved = mcResolveSite(p);
  var base = resolved.base;
  if (!base) {
    console.warn("苹果CMS: 未指定站点地址");
    return [];
  }

  // 内置分类优先（快），否则嗅探首页
  var site = resolved.site;
  if (site && site.categories && site.categories.length) {
    return mcMapCategories(site.categories, resolved.siteKey, p);
  }

  var homeUrl = base + "/";
  var home = await mcTryGet(homeUrl, homeUrl);
  if (!home) return [];

  var groups = mcDetectCategoryGroups(home, base, homeUrl);
  var out = [];
  var seen = {};
  for (var g = 0; g < groups.length; g++) {
    var list = groups[g].list;
    var gen = mcCategoryTplFromAnchors(list);
    if (!gen || !gen.tpl || gen.tpl.indexOf("{catId}") < 0) continue;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a.text || seen[a.text]) continue;
      seen[a.text] = true;
      // 从该锚点自己的路径反推 catId
      var cid = mcCatIdFromPath(a.path, gen.tpl) || mcIdFromPath(a.path);
      if (!cid) continue;
      out.push({
        id: resolved.siteKey + "_cat_" + cid,
        name: a.text,
        params: { site: p.site || MC_CONFIG.defaultSite, siteBase: p.siteBase || "", catId: cid }
      });
      if (out.length >= 40) break;
    }
    if (out.length >= 40) break;
  }

  if (!out.length) {
    console.warn("苹果CMS: 未能嗅探到分类，返回默认分类");
    return [{ id: resolved.siteKey + "_cat_default", name: "全部", params: { site: p.site, siteBase: p.siteBase, catId: "" } }];
  }
  console.log("苹果CMS: 嗅探到 " + out.length + " 个分类");
  return out;
}

/* 内置分类：必须把 site / siteBase 一起透传，否则点分类后列表模块会走回默认站点 */
function mcMapCategories(list, siteKey, p) {
  var src = p || {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push({
      id: siteKey + "_cat_" + list[i].id,
      name: list[i].name,
      params: {
        site: mcFirst(src.site) || MC_CONFIG.defaultSite,
        siteBase: mcFirst(src.siteBase),
        catId: String(list[i].id)
      }
    });
  }
  return out;
}

/* 从路径 + 模板反推 catId */
function mcCatIdFromPath(path, tpl) {
  var p = mcFirst(path);
  var t = mcPath(mcFirst(tpl));
  if (!p || !t) return "";
  var tplParts = t.split(/\{[a-zA-Z]+\}/);
  // 模板首段 "……/" 之后到次段之前，就是 catId 所在
  if (tplParts.length < 2) return "";
  var head = tplParts[0];
  if (p.indexOf(head) !== 0) return "";
  var rest = p.slice(head.length);
  var m = rest.match(/^([A-Za-z0-9_\u4e00-\u9fa5-]{1,32})/);
  return m ? m[1] : "";
}

/* 模块 2：分类列表 */
async function getVideoList(params) {
  var p = params || {};
  var resolved = mcResolveSite(p);
  var base = resolved.base;
  if (!base) {
    console.warn("苹果CMS: 未指定站点地址");
    return [];
  }
  var routes = await mcRoutesFor(base, resolved.site);

  var page = parseInt(p.page, 10);
  if (!isFinite(page) || page < 1) page = 1;

  var catId = mcFirst(p.catId);
  if (!catId) {
    var site = resolved.site;
    if (site && site.categories && site.categories.length) catId = String(site.categories[0].id);
  }
  // 自定义站点：用探测阶段验证过能出数据的那个分类，避免瞎猜 "1" 撞上 404
  if (!catId) catId = mcFirst(routes.defaultCatId);
  if (!catId) catId = "1";

  var catUrl = mcFill(routes.category || "{base}/index.php/vod/type/id/{catId}.html", {
    base: base,
    catId: mcEncode(catId)
  });

  var url = catUrl;
  if (page >= 2) {
    if (routes.categoryPage) {
      url = mcFill(routes.categoryPage, { base: base, catId: mcEncode(catId), page: page });
    } else {
      url = mcDerivePageUrl(catUrl, page);
    }
  }

  console.log("苹果CMS: 列表 " + mcShort(url));
  var html = await mcGet(url, base + "/");
  var items = mcParseList(html, base, routes.detail, resolved.siteKey);

  if (!items.length && page >= 2 && !routes.categoryPage) {
    // 分页形态猜错：退回「不翻页」，避免整页空
    console.warn("苹果CMS: 第" + page + "页无结果，可能该站分页形态不同");
  }
  console.log("苹果CMS: 第" + page + "页 " + items.length + " 条");
  return items;
}

/* 模块 3：搜索 */
async function searchVideos(params) {
  var p = params || {};
  var keyword = mcFirst(p.keyword);
  if (!keyword) {
    console.warn("苹果CMS: 关键词为空");
    return [];
  }
  var resolved = mcResolveSite(p);
  var base = resolved.base;
  if (!base) return [];
  var routes = await mcRoutesFor(base, resolved.site);

  var page = parseInt(p.page, 10);
  if (!isFinite(page) || page < 1) page = 1;

  var kw = mcEncode(keyword);
  var url;
  if (page >= 2 && routes.searchPage) {
    url = mcFill(routes.searchPage, { base: base, kw: kw, page: page });
  } else if (routes.search) {
    url = mcFill(routes.search, { base: base, kw: kw });
    if (page >= 2) url = mcDeriveSearchPage(url, keyword, page);
  } else {
    url = base + "/index.php/vod/search.html?wd=" + kw;
  }

  console.log("苹果CMS: 搜索 " + keyword + " → " + mcShort(url));
  var html = await mcGet(url, base + "/");
  var items = mcParseList(html, base, routes.detail, resolved.siteKey);
  console.log("苹果CMS: 搜索命中 " + items.length + " 条");
  return items;
}

function mcDeriveSearchPage(url, keyword, page) {
  // /index.php/vod/search.html?wd=KW → /index.php/vod/search/page/N/wd/KW.html
  var m = String(url).match(/^(.*\/)search\.html\?(?:wd|searchword)=/i);
  if (m) return m[1] + "search/page/" + page + "/wd/" + mcEncode(keyword) + ".html";
  return url + (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
}

/* ============================================================================
 * 十一、loadDetail
 * ----------------------------------------------------------------------------
 * link 约定：绝对的详情页 URL（由列表页条目带出）。
 * ========================================================================== */
async function loadDetail(link) {
  var detailUrl = mcFirst(link);
  if (!/^https?:\/\//i.test(detailUrl)) {
    // 兼容只传 ID 的情况
    var id = mcIsNum(link) || mcIdFromPath(String(link || ""));
    if (!id) {
      console.error("苹果CMS: 详情参数无效", link);
      return { title: "", videoUrl: "" };
    }
    detailUrl = "";
  }

  var base = mcOrigin(detailUrl);
  if (!base) {
    console.error("苹果CMS: 无法从 link 解析站点", link);
    return { title: "", videoUrl: "" };
  }

  console.log("苹果CMS: 详情 " + mcShort(detailUrl));
  var html = await mcGet(detailUrl, base + "/");

  var fields = mcParseDetailFields(html, base);
  var plays = mcParsePlayLinks(html, base);

  if (!plays.length) {
    console.warn("苹果CMS: 详情页没有分集链接——该站可能由 JS 渲染，组件无法解析");
    return {
      id: mcIdFromPath(mcPath(detailUrl)),
      title: fields.title,
      mediaType: "tv",
      posterUrl: fields.poster,
      description: mcFirst(fields.description, "该站点的分集链接由 JavaScript 动态生成，当前组件无法解析。")
    };
  }

  // 按线路分组，选集数最多的线路
  var bestTpl = mcPlayTplFromList(plays);
  var sidGroups = {};
  for (var i = 0; i < plays.length; i++) {
    var pl = plays[i];
    if (!sidGroups[pl.sid]) sidGroups[pl.sid] = [];
    sidGroups[pl.sid].push(pl);
  }
  var sids = [];
  for (var k in sidGroups) {
    if (Object.prototype.hasOwnProperty.call(sidGroups, k)) sids.push(k);
  }
  sids.sort(function (a, b) { return sidGroups[b].length - sidGroups[a].length; });

  // 播放页 URL 优先用泛化模板，保证 sid/nid 编号正确
  var playTpl = bestTpl || "";

  var chosen = sidGroups[sids[0]] || [];
  chosen.sort(function (a, b) {
    return (parseInt(a.nid, 10) || 0) - (parseInt(b.nid, 10) || 0);
  });

  var totalFound = chosen.length;
  var limit = totalFound;
  if (MC_CONFIG.maxEpisodes && limit > MC_CONFIG.maxEpisodes) limit = MC_CONFIG.maxEpisodes;

  console.log(
    "苹果CMS: 《" + fields.title + "》线路数 " + sids.length +
    "，主线路 " + chosen.length + " 集，本次解析 " + limit + " 集"
  );

  var episodes = [];
  var resolvedList = await mcResolveEpisodes(chosen.slice(0, limit), playTpl, base, detailUrl);

  for (var e = 0; e < resolvedList.length; e++) {
    var r = resolvedList[e];
    if (!r.videoUrl) continue;
    episodes.push({
      id: r.id + "-s" + r.sid + "-e" + r.nid,
      seasonNumber: 1,
      episodeNumber: episodes.length + 1,
      title: mcFirst(r.title, "第" + (episodes.length + 1) + "集"),
      videoUrl: r.videoUrl
    });
  }

  if (!episodes.length) {
    console.error("苹果CMS: 未能解析出可播地址");
    return { id: mcIdFromPath(mcPath(detailUrl)), title: fields.title, videoUrl: "" };
  }

  var notice = "可播 " + episodes.length + " 集" +
    (totalFound > limit ? "（全 " + totalFound + " 集，已按上限截断）" : "") +
    (sids.length > 1 ? " · 共 " + sids.length + " 条线路，取线路 " + sids[0] : "");

  var result = {
    id: mcIdFromPath(mcPath(detailUrl)),
    title: fields.title,
    mediaType: "tv",
    posterUrl: fields.poster,
    tags: fields.tags,
    description: (fields.description ? fields.description + "\n" : "") + notice,
    seasonCount: 1,
    episodeCount: episodes.length,
    currentSeason: 1,
    currentEpisode: 1,
    seasons: [
      {
        id: "s1",
        seasonNumber: 1,
        title: fields.title,
        episodeCount: episodes.length,
        episodes: episodes
      }
    ]
  };
  if (fields.year) result.year = fields.year;
  if (fields.credits.length) {
    result.credits = {
      cast: fields.credits.slice(0, 20).map(function (n, idx) {
        return { id: "mc-cast-" + idx, name: n, order: idx };
      })
    };
  }
  return result;
}

/* 并发解析分集播放地址 */
async function mcResolveEpisodes(plays, playTpl, base, referer) {
  var results = [];
  var concurrency = Math.max(1, MC_CONFIG.fetchConcurrency | 0);
  var cursor = 0;

  async function worker() {
    while (cursor < plays.length) {
      var idx = cursor++;
      var pl = plays[idx];
      try {
        var pu = pl.href;
        if (playTpl) {
          var built = mcFill(playTpl, { base: base, id: pl.id, sid: pl.sid, nid: pl.nid });
          if (/^https?:\/\//i.test(built)) pu = built;
        }
        var html = await mcGet(pu, referer);
        var info = mcParsePlayer(html);
        if (info.encrypt !== 0 && info.encrypt !== undefined && !info.videoUrl) {
          console.warn("苹果CMS: 第" + pl.nid + "集疑似加密（encrypt=" + info.encrypt + "），跳过");
          continue;
        }
        if (!info.videoUrl) {
          console.warn("苹果CMS: 第" + pl.nid + "集未取到播放地址");
          continue;
        }
        results.push({
          id: pl.id,
          sid: pl.sid,
          nid: pl.nid,
          title: mcFirst(pl.title),
          videoUrl: info.videoUrl,
          mode: info.mode,
          from: info.from
        });
      } catch (e) {
        console.warn("苹果CMS: 第" + pl.nid + "集取流失败 - " + (e && e.message));
      }
    }
  }

  var workers = [];
  for (var i = 0; i < concurrency && i < plays.length; i++) workers.push(worker());
  await Promise.all(workers);

  results.sort(function (a, b) {
    return (parseInt(a.nid, 10) || 0) - (parseInt(b.nid, 10) || 0);
  });
  return results;
}

/* ------------------------------ 兜底 -------------------------------------- */
