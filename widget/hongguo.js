/* ============================================================================
 * 红果短剧 · CapyPlayer 组件
 * ----------------------------------------------------------------------------
 * 数据源：红果短剧网页版 https://hongguoduanju.com
 *   - 免签名、免 Cookie、免登录，直接读 SSR 页面里的 window._ROUTER_DATA
 *   - 取流返回的是**明文 MP4 直链**（实测 HTTP 206 + video/mp4 + ftyp/isom）
 *   - 直链不校验 Referer / UA，可直接交给播放器
 *
 * ⚠️ 重要限制（务必阅读）
 *   红果网页版每部剧只开放前 N 集试看（实测 18 部剧的 accessible_episode_cnt
 *   全部为 3），第 N+1 集起播放页返回 404。因此本组件默认只输出「可播集」。
 *   若要解锁全集，需自建解密代理（红果 App 接口的视频是 CENC AES-128-CTR
 *   加密的），见 CONFIG.proxyBase 说明。
 *
 * 契约遵循：capyplayer.feifeiduck.com/zh/dev/widget/widgetdev
 * ========================================================================== */

/* ------------------------------ 可调配置 ---------------------------------- */

var HG_CONFIG = {
  // 站点根地址。除非官方换域名，否则不要改。
  siteBase: "https://hongguoduanju.com",

  // 列表页/详情页请求头。实测不带也能通，带上更稳。
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://hongguoduanju.com/",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9"
  },

  // 详情页并发解析可播集直链时的并发上限（防止一次性打爆站点/触发限流）
  fetchConcurrency: 3,

  // 无论如何最多解析多少集。null = 跟随站点返回的 accessible_episode_cnt。
  maxEpisodes: null,

  // 选集上限，仅用于把「可播集数量」夹在合理区间
  episodeFloor: 1,
  episodeCeil: 20,

  // 【可选升级路径】自建解密代理的地址前缀（不带尾部斜杠）。
  // 置空 = 走纯网页版（只能看前 N 集试看）。
  // 若填了，例如 "https://nas.example.com/hg"，则每集播放地址会变成
  //   {proxyBase}/stream?series_id=<id>&ep=<N>
  // 由你自己的服务（红果 App 接口 + spade 解密）输出明文可播流，从而解锁全集。
  proxyBase: "",

  // 分类入口：站点 4 个内容频道
  routes: [
    { route: "real-drama", label: "真人剧" },
    { route: "comic-drama", label: "漫剧" },
    { route: "ai-drama", label: "AI剧" },
    { route: "comic", label: "动漫" }
  ]
};

/* ------------------------------ 元数据 ------------------------------------ */

var WidgetMetadata = {
  id: "hongguo_duanju",
  title: "红果短剧",
  description:
    "红果免费短剧（真人剧 / 漫剧 / AI剧 / 动漫）。分类浏览、关键词搜索、按剧集播放。",
  version: "1.0.0",
  author: "CapyPlayer Widget",
  site: "https://hongguoduanju.com",
  globalParams: [
    {
      name: "route",
      label: "内容频道",
      type: "enum",
      defaultValue: "real-drama",
      enumOptions: [
        { title: "真人剧", value: "real-drama" },
        { title: "漫剧", value: "comic-drama" },
        { title: "AI剧", value: "ai-drama" },
        { title: "动漫", value: "comic" }
      ]
    }
  ],
  modules: [
    {
      id: "categories",
      title: "分类",
      type: "category",
      functionName: "getCategories",
      description: "按内容频道进入红果短剧列表",
      cacheDuration: 86400,
      params: []
    },
    {
      id: "browse",
      title: "剧库",
      type: "media_list",
      functionName: "getDramaList",
      description: "按内容频道分页浏览红果短剧",
      cacheDuration: 600,
      timeoutSeconds: 25,
      params: [{ name: "page", label: "页码", type: "page" }]
    },
    {
      id: "search",
      title: "搜索",
      type: "media_list",
      functionName: "searchDramas",
      description: "按剧名关键词搜索红果短剧",
      cacheDuration: 300,
      timeoutSeconds: 25,
      params: [
        { name: "keyword", label: "关键词", type: "string", required: true },
        { name: "page", label: "页码", type: "page" }
      ]
    }
  ]
};

/* ------------------------------ 基础工具 ---------------------------------- */

function hgEnsureArray(v) {
  return Array.isArray(v) ? v : [];
}

function hgFirstText() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v === null || v === undefined) continue;
    var s = String(v).trim();
    if (s !== "" && s !== "<nil>" && s !== "null" && s !== "undefined") return s;
  }
  return "";
}

function hgNumeric(v) {
  var s = hgFirstText(v);
  return /^[0-9]{1,32}$/.test(s) ? s : "";
}

function hgNested(obj, keys) {
  var cur = obj;
  for (var i = 0; i < keys.length; i++) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[keys[i]];
  }
  return cur || null;
}

/* 把任意 HTTP 响应体统一成「文本」 */
function hgBodyText(resp) {
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

/* 带浏览器语义的 GET，返回 HTML 文本；失败抛错 */
async function hgGetHtml(url, referer) {
  var headers = {};
  var src = HG_CONFIG.headers;
  for (var k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) headers[k] = src[k];
  }
  if (referer) headers.Referer = referer;

  var resp = await Widget.http.get(url, { headers: headers });
  if (!resp || !resp.ok) {
    throw new Error(
      "HTTP " + (resp ? resp.status : "?") + " - " + hgRedact(url)
    );
  }
  return hgBodyText(resp);
}

function hgRedact(url) {
  var s = String(url);
  var q = s.indexOf("?");
  return q >= 0 ? s.slice(0, q) : s;
}

/* ----------------------------------------------------------------------------
 * 从 SSR 页面里抠出 window._ROUTER_DATA 的 JSON。
 * 不能用正则：JSON 是嵌套结构，必须做「跳过字符串字面量」的括号配对。
 * -------------------------------------------------------------------------- */
function hgExtractRouterData(html) {
  if (typeof html !== "string" || html.length === 0) return null;

  var keyIdx = html.indexOf("_ROUTER_DATA");
  if (keyIdx < 0) return null;

  var start = html.indexOf("{", keyIdx);
  if (start < 0) return null;

  var depth = 0;
  var inStr = false;
  var escaped = false;
  var end = -1;

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
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;

  try {
    return JSON.parse(html.slice(start, end));
  } catch (e) {
    console.error("红果: _ROUTER_DATA 解析失败", e && e.message);
    return null;
  }
}

/* 在 loaderData 里按「前缀规则」找目标层，例如 category_$ / search_(keyword)/page */
function hgLoaderLayer(routerData, exactNames, prefixes) {
  var loader = hgNested(routerData, ["loaderData"]);
  if (!loader || typeof loader !== "object") return null;

  var i, name;
  for (i = 0; i < exactNames.length; i++) {
    name = exactNames[i];
    var hit = loader[name];
    if (hit && typeof hit === "object") return hit;
  }
  if (prefixes && prefixes.length) {
    for (var key in loader) {
      if (!Object.prototype.hasOwnProperty.call(loader, key)) continue;
      for (i = 0; i < prefixes.length; i++) {
        if (key.indexOf(prefixes[i]) === 0) {
          var val = loader[key];
          if (val && typeof val === "object") return val;
        }
      }
    }
  }
  return null;
}

/* 取流页的层名带动态片段（player_(series_id)/(vid)/page），直接扫 video_player_info */
function hgPlayerLayer(routerData) {
  var loader = hgNested(routerData, ["loaderData"]);
  if (!loader || typeof loader !== "object") return null;
  for (var key in loader) {
    if (!Object.prototype.hasOwnProperty.call(loader, key)) continue;
    var v = loader[key];
    if (v && typeof v === "object" && v.video_player_info) return v;
  }
  return null;
}

/* ------------------------------ 字段映射 ---------------------------------- */

/* 列表条目 -> MediaItem */
function hgMapDrama(raw, channelLabel) {
  if (!raw || typeof raw !== "object") return null;

  // 列表页条目可能是 {video_data:{...}} 也可能是裸对象
  var vd = raw.video_data && typeof raw.video_data === "object"
    ? raw.video_data
    : raw;

  var seriesId = hgNumeric(hgFirstText(vd.series_id_str, vd.series_id,
    raw.series_id_str, raw.series_id, vd.keyword, raw.keyword));
  if (!seriesId) return null;

  var title = hgFirstText(vd.series_title, vd.series_name, raw.series_title,
    raw.series_name, raw.name, seriesId);

  var tags = [];
  hgEnsureArray(vd.tags).forEach(function (t) {
    var s = hgFirstText(t);
    if (s && tags.indexOf(s) < 0) tags.push(s);
  });
  hgEnsureArray(vd.category_list).forEach(function (c) {
    var s = hgFirstText(c && c.name);
    if (s && tags.indexOf(s) < 0) tags.push(s);
  });

  var total = hgFirstText(vd.episode_cnt, raw.episode_cnt);
  var remark = hgFirstText(vd.episode_right_text, raw.episode_right_text);
  if (!remark && total) remark = "共" + total + "集";

  var heat = hgFirstText(hgNested(vd, ["hot_score_data", "text"]),
    hgNested(raw, ["hot_score_data", "text"]));

  var desc = hgFirstText(vd.series_intro, raw.series_intro);
  var extras = [];
  if (hgFirstText(vd.series_status) === "1") extras.push("已完结");
  if (heat) extras.push(heat);
  if (hgFirstText(vd.favorite_text)) extras.push(hgFirstText(vd.favorite_text));
  if (hgFirstText(vd.like_text)) extras.push(hgFirstText(vd.like_text));
  if (extras.length) desc = (desc ? desc + "\n" : "") + extras.join(" · ");

  return {
    id: seriesId,
    type: "link",
    link: seriesId,
    title: title,
    mediaType: "tv",
    posterUrl: hgFirstText(vd.series_cover, raw.series_cover),
    description: desc,
    tags: tags,
    year: hgYearFrom(hgFirstText(vd.first_visible_time, vd.create_time)),
    remarks: hgFirstText(remark, channelLabel)
  };
}

function hgYearFrom(ts) {
  var n = parseInt(ts, 10);
  if (!n || n < 1000000000) return null;
  var d = new Date(n * 1000);
  var y = d.getFullYear();
  return isFinite(y) ? String(y) : null;
}

/* ------------------------------ 模块实现 ---------------------------------- */

/* 模块 1：分类入口（返回 WidgetSystemCategory[]）
 * 每个条目的 params 会透传给 getDramaList 作为默认参数 */
async function getCategories(params) {
  var out = [];
  HG_CONFIG.routes.forEach(function (r) {
    out.push({
      id: "channel_" + r.route,
      name: r.label,
      params: { route: r.route, page: 1 }
    });
  });
  return out;
}

/* 模块 2：按频道分页浏览 */
async function getDramaList(params) {
  var p = params || {};
  var route = hgFirstText(p.route) || "real-drama";
  var page = parseInt(p.page, 10);
  if (!isFinite(page) || page < 1) page = 1;

  var channel = hgChannelLabel(route);
  var url = HG_CONFIG.siteBase + "/category/" + encodeURIComponent(route);
  // page=1 会被站点 301 到无参规范地址，因此只在 page>=2 时带参
  if (page >= 2) url += "?page=" + page;

  console.log("红果: 拉取频道列表", route, "第" + page + "页");

  var html;
  try {
    html = await hgGetHtml(url);
  } catch (e) {
    console.error("红果: 列表请求失败", e && e.message);
    throw e;
  }

  var data = hgExtractRouterData(html);
  var layer = hgLoaderLayer(data, ["category_$"], ["category_$", "category_"]);
  if (!layer) {
    console.error("红果: 未找到分类数据层");
    return [];
  }
  if (layer.isSuccess === false) {
    console.warn("红果: 分类层 isSuccess=false");
    return [];
  }

  var rows = hgEnsureArray(layer.recommendList);
  var items = [];
  var seen = {};
  rows.forEach(function (row) {
    var it = hgMapDrama(row, channel);
    if (it && !seen[it.id]) {
      seen[it.id] = true;
      items.push(it);
    }
  });

  console.log("红果: 第" + page + "页拿到 " + items.length + " 条");
  return items;
}

/* 模块 3：关键词搜索 */
async function searchDramas(params) {
  var p = params || {};
  var keyword = hgFirstText(p.keyword);
  if (!keyword) {
    console.warn("红果: 搜索关键词为空");
    return [];
  }
  // 站点是路径式搜索：/search/<keyword>
  var url = HG_CONFIG.siteBase + "/search/" + encodeURIComponent(keyword);

  console.log("红果: 搜索", keyword);

  var html;
  try {
    html = await hgGetHtml(url);
  } catch (e) {
    console.error("红果: 搜索请求失败", e && e.message);
    throw e;
  }

  var data = hgExtractRouterData(html);
  var layer = hgLoaderLayer(data, [], ["search_("]);
  if (!layer) layer = hgLoaderLayer(data, [], ["search_"]);
  if (!layer) {
    console.error("红果: 未找到搜索数据层");
    return [];
  }

  var rows = hgEnsureArray(layer.searchList);
  var items = [];
  var seen = {};
  rows.forEach(function (row) {
    var it = hgMapDrama(row, "红果短剧");
    if (it && !seen[it.id]) {
      seen[it.id] = true;
      items.push(it);
    }
  });

  console.log("红果: 搜索命中 " + items.length + " 条（总计 " + hgFirstText(layer.totalCount) + "）");
  return items;
}

function hgChannelLabel(route) {
  for (var i = 0; i < HG_CONFIG.routes.length; i++) {
    if (HG_CONFIG.routes[i].route === route) return HG_CONFIG.routes[i].label;
  }
  return "红果短剧";
}

/* ----------------------------------------------------------------------------
 * loadDetail：剧集详情 + 播放地址
 * -------------------------------------------------------------------------- */
async function loadDetail(link) {
  var seriesId = hgNumeric(link);
  if (!seriesId) {
    // 兼容传入完整 URL 的情况
    var m = String(link == null ? "" : link).match(/([0-9]{10,32})/);
    seriesId = m ? m[1] : "";
  }
  if (!seriesId) {
    console.error("红果: 详情参数无效", link);
    return { title: "", videoUrl: "" };
  }

  var url = HG_CONFIG.siteBase + "/detail?series_id=" + encodeURIComponent(seriesId);
  console.log("红果: 拉取详情", seriesId);

  var html;
  try {
    html = await hgGetHtml(url);
  } catch (e) {
    console.error("红果: 详情请求失败", e && e.message);
    throw e;
  }

  var data = hgExtractRouterData(html);
  var layer = hgLoaderLayer(data, ["detail_page"], ["detail_page", "detail_"]);
  if (!layer) {
    console.error("红果: 未找到详情数据层");
    return { title: "", videoUrl: "" };
  }

  var detail = layer.seriesDetail;
  if (!detail || typeof detail !== "object") {
    console.error("红果: seriesDetail 缺失");
    return { title: "", videoUrl: "" };
  }

  var title = hgFirstText(detail.series_name, detail.series_title, seriesId);
  var vids = hgEnsureArray(detail.vid_list)
    .map(function (v) {
      return hgNumeric(v);
    })
    .filter(function (v) {
      return !!v;
    });

  var totalEpisodes = parseInt(hgFirstText(detail.episode_cnt), 10);
  if (!isFinite(totalEpisodes) || totalEpisodes <= 0) totalEpisodes = vids.length;

  // 可播集数：站点只开放前 N 集试看
  var accessible = parseInt(hgFirstText(detail.accessible_episode_cnt), 10);
  if (!isFinite(accessible) || accessible <= 0) accessible = Math.min(3, vids.length);
  if (accessible > vids.length) accessible = vids.length;

  var limit = accessible;
  if (HG_CONFIG.maxEpisodes) limit = Math.min(limit, HG_CONFIG.maxEpisodes);
  limit = Math.max(HG_CONFIG.episodeFloor, Math.min(limit, HG_CONFIG.episodeCeil, vids.length));

  console.log(
    "红果: 《" + title + "》共 " + totalEpisodes + " 集，站点开放 " + accessible +
    " 集，本次解析 " + limit + " 集"
  );

  // 并发解析每一集的直链
  var episodes = [];
  var playable = 0;

  if (HG_CONFIG.proxyBase) {
    // 代理模式：直接构造代理地址，条目全量输出
    for (var i = 0; i < totalEpisodes; i++) {
      episodes.push({
        id: seriesId + "-e" + (i + 1),
        seasonNumber: 1,
        episodeNumber: i + 1,
        title: "第" + (i + 1) + "集",
        videoUrl: hgProxyUrl(seriesId, i + 1)
      });
    }
    playable = episodes.length;
  } else {
    var resolved = await hgResolveEpisodes(seriesId, vids.slice(0, limit));
    resolved.forEach(function (r) {
      if (!r.videoUrl) return;
      playable++;
      episodes.push({
        id: seriesId + "-e" + r.episodeNumber,
        seasonNumber: 1,
        episodeNumber: r.episodeNumber,
        title: "第" + r.episodeNumber + "集",
        videoUrl: r.videoUrl
      });
    });
  }

  if (episodes.length === 0) {
    console.error("红果: 未能解析出任何可播剧集");
    return { title: title, videoUrl: "" };
  }

  var cast = hgMapCelebrities(detail.celebrities);
  var tags = hgEnsureArray(detail.tags).map(function (t) {
    return hgFirstText(t);
  }).filter(function (t) {
    return !!t;
  });

  var notice =
    "可播 " + playable + " 集 / 全 " + totalEpisodes + " 集（红果网页版仅开放前 " +
    accessible + " 集试看）";

  var result = {
    id: seriesId,
    title: title,
    mediaType: "tv",
    tags: tags,
    description: (hgFirstText(detail.series_intro) || "") +
      (hgFirstText(detail.series_intro) ? "\n" : "") + notice,
    posterUrl: hgFirstText(detail.series_cover),
    seasonCount: 1,
    episodeCount: episodes.length,
    currentSeason: 1,
    currentEpisode: episodes[0] ? episodes[0].episodeNumber : 1,
    seasons: [
      {
        id: seriesId + "-s1",
        seasonNumber: 1,
        title: title,
        episodeCount: episodes.length,
        episodes: episodes
      }
    ]
  };

  if (cast.length) result.credits = { cast: cast };

  return result;
}

function hgProxyUrl(seriesId, episodeNumber) {
  return (
    HG_CONFIG.proxyBase.replace(/\/+$/, "") +
    "/stream?series_id=" + encodeURIComponent(seriesId) +
    "&ep=" + episodeNumber
  );
}

/* 并发解析可播集的明文直链，返回 [{episodeNumber, videoUrl}] */
async function hgResolveEpisodes(seriesId, vids) {
  var results = [];
  var concurrency = Math.max(1, HG_CONFIG.fetchConcurrency | 0);
  var cursor = 0;

  async function worker() {
    while (cursor < vids.length) {
      var index = cursor++;
      var ep = index + 1;
      try {
        var u = await hgResolveOneEpisode(seriesId, vids[index]);
        if (u) results.push({ episodeNumber: ep, videoUrl: u });
      } catch (e) {
        console.warn("红果: 第" + ep + "集取流失败 -", e && e.message);
      }
    }
  }

  var workers = [];
  for (var i = 0; i < concurrency && i < vids.length; i++) workers.push(worker());
  await Promise.all(workers);

  results.sort(function (a, b) {
    return a.episodeNumber - b.episodeNumber;
  });
  return results;
}

async function hgResolveOneEpisode(seriesId, vid) {
  var url =
    HG_CONFIG.siteBase + "/player/" +
    encodeURIComponent(seriesId) + "/" + encodeURIComponent(vid);

  var html = await hgGetHtml(url);
  var data = hgExtractRouterData(html);
  var layer = hgPlayerLayer(data);
  if (!layer) return "";

  var info = layer.video_player_info;
  if (!info || typeof info !== "object") return "";

  // 校验服务端确实返回的是所请求的剧集，避免把试看集冒充成目标集
  if (hgFirstText(layer.vid) && hgFirstText(layer.vid) !== vid) {
    console.warn("红果: 播放页返回的 vid 与请求不一致");
    return "";
  }

  var mainUrl = hgFirstText(info.main_url);
  if (!/^https?:\/\//i.test(mainUrl)) return "";
  return mainUrl;
}

function hgMapCelebrities(list) {
  var out = [];
  hgEnsureArray(list).forEach(function (c, index) {
    if (!c || typeof c !== "object") return;
    var name = hgFirstText(c.nickname, c.name);
    if (!name) return;
    out.push({
      id: hgFirstText(c.celebrity_id) || ("hg-cast-" + index),
      name: name,
      character: hgFirstText(c.sub_title),
      profileUrl: hgFirstText(c.avatar),
      order: index
    });
  });
  return out;
}

/* ------------------------------ 兜底 -------------------------------------- */
