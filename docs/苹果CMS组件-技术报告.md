# 苹果CMS 通用组件 · 技术报告

> 2026-10-01　全部结论基于真机实测 + 源码交叉验证，非文档推测。
> 组件：`widget/maccms.js`（1660 行）　自测：`tools/selftest_maccms.js`（647 行）　自测结果：**87 项断言全通过**

---

## 一、结论先行

**苹果CMS（maccms）站群是 CapyPlayer 组件性价比最高的接入目标，但「一套路由写死」必然失败。**

三条硬结论：

1. **数据模型统一、路由不统一。** 五个实测站的分类/详情/播放路径**没有两个是一样的**。
2. **五五短剧是比红果好得多的源** —— 整剧明文 m3u8、`encrypt=0`、`trysee=0`，无 3 集试看限制。
3. **必须做「运行时路由探测」**：抓首页 → 嗅探链接形态 → 实测验证 → 缓存。这是「一处适配、处处可用」唯一能落地的形态。

---

## 二、为什么路由不能写死（实测证据）

### 五个站的真实路由（全部来自实测或 短剧库源码 `provider_duanju_maccms.go:251-308`）

| 站 | 分类列表 | 详情 | 播放 | 形态 |
|---|---|---|---|---|
| **五五短剧** `duanju55.com` | `/index.php/vod/type/id/1.html`<br>`…/page/2.html` | `/index.php/vod/detail/id/{id}.html` | `/index.php/vod/play/id/{id}/sid/{s}/nid/{n}.html` | 标准 `index.php` 式 |
| **花生短剧** `zywest263.com` | `/zywtype/27.html` | `/zywview/{id}.html` | `/zywplay/{id}-{s}-{n}.html` | 自定义伪静态 `zyw*` |
| **168 影院** `xzyx168.com` | `/xzyxvt/{slug}.html`<br>`/xzyxvt/{page}zmn.html` | `/xzyxvd/{id}.html` | 由 JS 生成，HTML 里无 | 自定义伪静态 `xzyxv*` + 反爬 |
| **短剧网站** `duanju2.com` | `/show/duanju-----------.html` | `/vod/{id}.html` | `/vodplay/{id}-{s}-{n}.html` | 伪静态 `vodshow/vodplay` |
| **ptt.red** | `/p/66/c/{class}` | `/movie/{id}` | `/p/66/d/{id}` | 另一套写法 |

> 同一份源码里，`maccmsDetailCandidates()` 为每个站**硬编码了一组候选 URL**（`provider_duanju_maccms.go:358-392`）—— 这本身就是「路由不统一」的旁证。
> 我的组件用探测替代了这份硬编码表。

### 播放页形态也不统一

| 站 | 播放页变量 | 取值方式 |
|---|---|---|
| 五五短剧 | `player_aaaa = {"flag","encrypt","trysee","url",…}` | JSON 解析 |
| 花生短剧 | **无 `player_aaaa`**、无 MacPlayer | m3u8 明文拼在内联 `<iframe src="/player/mui-player.php?标题,https://…/master.m3u8,nextPage">` 里 |

> 花生短剧的播放页还有 JSFuck 混淆（`[][(![]+[])[+[]]…`）做反爬噪声，但**混淆块里没有 URL**，
> 所以「全页扫 m3u8」这一级兜底不会被污染。

---

## 三、组件架构

### 三层结构

```
① 站点配置表 MC_SITES            ← 内置已实测站点，一键可用（maccms.js:69）
② 路由自动探测 mcDetectRoutes     ← 任意苹果CMS 站，冷探测约 2s，缓存 24h（maccms.js:1130）
③ 播放地址三级回退 mcParsePlayer  ← 覆盖不同模板（maccms.js:942）
```

### 探测算法（`maccms.js:1130-1286`）

```
抓 base/
 ├─ 锚点分组：所有 <a href> 按「路径数字段归一成 #」分组
 │     mcCollectAnchors:479 → mcSignature:474
 ├─ 分类候选：短文本 + 无 <img> + 非黑名单 + 目录段提示(type/show/list/以 t 结尾)
 │     mcDetectCategoryGroups:625 → mcCategoryTplFromAnchors:660
 ├─ 逐个实测分类页，要求能解析出 ≥3 条详情条目 → 通过者即为真实分类路由
 ├─ 用该页锚点分组泛化出详情模板 mcDetectDetailGroup:558
 │     先套 MC_DETAIL_SHAPES 形态表:131，未命中则用「成员最多的可变数组」泛化 mcGeneralize:519
 ├─ 嗅探分页（找 /page/N 链接）mcDetectPageTpl:688
 ├─ 抓一部剧详情 → 泛化播放模板 mcPlayTplFromList:1288
 └─ 探测搜索路由，且必须通过两道否决：
       ① 响应不得等于首页（识别伪静态把未知路径重写回首页）
       ② 响应必须真的含关键词
```

**关键设计**：每一步都「构造 URL → 真的请求 → 校验产出」，而不是猜测正则对不对。
探测结果写入 `Widget.storage`，键 `maccms_routes_{host}`，TTL 24h。

### 播放地址三级回退（`maccms.js:942-995`）

| 级别 | 匹配 | 覆盖 |
|---|---|---|
| 1 | `player_aaaa = {...}` → 取 `url` | 标准苹果CMS 模板 |
| 2 | `<iframe src=…>` / `player/*.php?…,<url>,…` | 花生短剧这类内联式 |
| 3 | 全页扫 `.m3u8/.mp4/.flv` 并打分排序 | 兜底 |

`player_aaaa` 用**跳过字符串字面量的括号配对**提取（`mcExtractBraceObject:997`），不用正则 —— 因为它的 `vod_data` 是嵌套对象，
`/\{.*?\}/` 会截断。离线夹具专门测了这一条。

---

## 四、实测数据

### 五五短剧（`duanju55.com`）—— 整剧打包

| 项 | 实测值 |
|---|---|
| 列表 | 24 条/页，分页 `/page/N.html`，共 **2246 页** |
| 详情 | 每剧**只有 1 个分集链接**（`nid/1`）→ 整剧打包 |
| `player_aaaa` | ✅ 命中，`encrypt:0`、`trysee:0`、`from:"tym3u8"` |
| m3u8 | `https://tyyszywvod2.com/videos/202609/30/6abbff14…/76f346/index.m3u8` |
| 清单 | HTTP 200，`application/vnd.apple.mpegurl`，`#EXTM3U`，`PLAYLIST-TYPE:VOD` |
| 分片 | **921 片 × 2s ≈ 30 分钟**；**无 `#EXT-X-KEY`**、**无 `#EXT-X-MAP`** |
| 首片 | HTTP 200，205,108 B，`content-type: video/mp2t`，首字节 `0x47` → **MPEG-TS 明文** |
| Referer | **不校验**（不带 Referer 也 200） |
| 搜索 | `/index.php/vod/search.html?wd=` 可用，命中 10 条 |

### 花生短剧（`zywest263.com`）—— 真·多集

| 项 | 实测值 |
|---|---|
| 列表 | 36 条/页 |
| 详情 | **173 个分集链接**：`/zywplay/84794-0-0.html` … `-0-N.html`（sid 恒为 0） |
| `player_aaaa` | ❌ **不存在** |
| 取值 | 内联 JS：`innerHTML = '<iframe … src="/player/mui-player.php?'+ '<剧名 第01集>' +',https://cdn.yddsha2.com/m3u87/…/1080/master.m3u8,'+ nextPage +'"…>'` |
| m3u8 | HTTP 200，`#EXTM3U`，**无 `#EXT-X-KEY`** |
| 反爬 | 页面含 JSFuck 混淆块；class 名前缀随机化（`_9dbe81752a1dbf17-vodlist__item`） |

### 站点存活修正

⚠️ **重要**：初版探测把 `zywest263.com` 判为「死站」，是我的 **Python 探测脚本没解压**（该站 CDN 强制 br 压缩）。
用 `curl --compressed` 复查后 **完全正常**。教训已写进技能：
**国内站的「乱码/超时」先怀疑压缩与 UA，别急着判死，换 `curl --compressed` 复核。**

---

## 五、与红果对比

| 维度 | 红果短剧 | 五五短剧（苹果CMS） |
|---|---|---|
| 接入难度 | 中（SSR 状态提取） | 中（路由探测 + HTML 解析） |
| 内容量 | 4 个频道，数十万部 | 2246 页 × 24 ≈ **5.4 万条**（仅短剧分类） |
| **可播集数** | ❌ **仅前 3 集** | ✅ **整剧无限制**（`trysee=0`） |
| 流形态 | 明文 MP4 直链 | 明文 m3u8（HLS VOD） |
| 加密 | 网页版明文 / App 版 CENC | **无加密** |
| 稳定性 | 官方站，稳定 | 站群，随时可能挂 |

**结论：红果适合做「发现」，苹果CMS 适合做「能看」。两者互补，都要留。**

---

## 六、风险与待办（P0/P1/P2）

### P0 · 必须知道

| # | 风险 | 依据 | 影响 |
|---|---|---|---|
| P0-1 | **站点可能随时消失** | 本次 20 个源实测 6 个已死；`ptt.red` 403、`duanju2` 曾超时 | 用户点开是空的 → 需要多站回退 |
| P0-2 | **多集站解析成本随集数线性增长** | 花生短剧单剧 173 集 → 173 次请求 | 已加 `MC_CONFIG.maxEpisodes`（默认 60）截断 |
| P0-3 | **部分站 HTML 解析不可行** | 168 影院：class 随机化 + 播放链接 JS 生成 + 未知路径重写回首页 | 该站明确不适用，已在站点表标注 |

### P1 · 建议后续做

| # | 事项 | 价值 |
|---|---|---|
| P1-1 | 多站回退（A 站挂了自动走 B 站） | 直接解决 P0-1，是「聚合组件」的雏形 |
| P1-2 | 探测结果跨设备共享（WebDAV / 自建接口） | 每次换设备都要冷探测 2s |
| P1-3 | 采集 API 优先（`/api.php/provide/vod/`） | 比 HTML 解析快且稳 —— 但实测多站返回 `closed`，只能作为**命中就用、不命中就回落** |

### P2 · 观察

| # | 事项 |
|---|---|
| P2-1 | 苹果CMS 的 `/api.php/provide/vod/?ac=detail` 若开着，可一次拿到剧集列表，省掉逐集请求 |
| P2-2 | 部分站有 `vod_play_list` 内联 JSON，可直接拿到全部分集 m3u8（无需逐集请求） |
| P2-3 | 站点表需要定期复核（域名易变） |

---

## 七、验收证据（可复现）

```bash
# 全量自测（离线夹具 + 真实站点 + 自动探测），87 项断言
node tools/selftest_maccms.js
```

自测覆盖：

| 阶段 | 内容 | 结果 |
|---|---|---|
| 1 | 契约预检（`var WidgetMetadata` / functionName / 可调用性） | 14/14 |
| 2 | 离线夹具：播放页三级回退（含 `player_aaaa` 嵌套不截断） | 9/9 |
| 3 | 离线夹具：列表字段提取（双模板） | 12/12 |
| 4 | 离线夹具：路由形态识别（含自定义伪静态） | 12/12 |
| 5 | 离线夹具：详情分集 + 线路分组 + 模板泛化 | 6/6 |
| 6 | 真实五五短剧：分类/列表/翻页不重复/搜索 | 8/8 |
| 7 | 真实五五短剧：详情取流 + **m3u8 无 KEY + 首片明文 TS** | 11/11 |
| 8 | 真实花生短剧：列表 + **多集解析 + 内联 m3u8 未加密** | 5/5 |
| 9 | 自动探测：五五短剧冷探测自愈（4 条路由全自发现）+ 缓存命中 | 6/6 |
| 10 | 自动探测：花生短剧自定义伪静态 + 搜索假阳性否决 | 4/4 |

**探测量化**：五五短剧冷探测 2171ms 完成，二次调用走缓存 583ms。

---

## 八、文件清单

| 文件 | 说明 |
|---|---|
| `widget/maccms.js` | 组件本体，1660 行 |
| `tools/selftest_maccms.js` | 自测，647 行，87 项断言 |
| `web/index.html` | 一键安装落地页（红果 / 苹果CMS 双组件可切换） |
| `_probe/probe_maccms_matrix.py` | 多站路由矩阵探测 |
| `_probe/probe_maccms_deep.py` | 分页结构 / 分集形态 / m3u8 直连校验 |
| `_probe/probe_detail_fields.py` | 详情页字段提取点定位 |
| `_probe/probe_curl_multi.py` | `curl --compressed` 版多站探测（解决压缩误判） |
| `_probe/probe_xzyx168.py` | 168 影院自定义伪静态深挖 |
