# CapyPlayer 组件集

把第三方影视/短剧内容源接进 CapyPlayer。**纯 JS 脚本，零后端、零依赖。**

> 仓库：`Tonyhilo/capyplayer-widgets` · 分发：jsDelivr CDN · 两个组件均已自测通过

| 组件 | 文件 | 覆盖目标 | 状态 |
|---|---|---|---|
| **苹果CMS 影视** | `widget/maccms.js` | 苹果CMS（maccms）站群，**上万个站点** | ✅ 自测 87/87 |
| **红果短剧** | `widget/hongguo.js` | 红果短剧网页版 | ✅ 自测 36/36 |

---

## 先读这个：两个组件怎么选

| 维度 | 苹果CMS 影视 | 红果短剧 |
|---|---|---|
| 内容量 | 单站数万条，且有上万个站可换 | 4 个频道 |
| **可播集数** | ✅ **整剧无限制**（`trysee=0`） | ❌ **仅前 3 集** |
| 流形态 | 明文 m3u8（HLS VOD，无 `#EXT-X-KEY`） | 明文 MP4 直链 |
| 稳定性 | 站群，随时可能挂（需多站切换） | 官方站，稳定 |
| 建议用法 | **主力播放源** | 发现 / 试看 |

---

## 快速开始

### 1. 先自测（不用装进 App）

```bash
node tools/selftest_maccms.js     # 苹果CMS：87 项断言
node tools/selftest.js            # 红果：36 项断言
```

两个脚本都用模拟沙箱加载组件，跑在**真实站点**上。苹果CMS 那个额外带一条**离线夹具轨**：
把各站页面形态做成合成 HTML，验证解析器，不受站点存活影响。

### 1.5 验证线上产物（改完推送后跑这个）

```bash
node tools/verify_remote.js          # 从 CDN 拉取已发布的 JS，全链路验证
node tools/verify_remote.js --hash   # 额外打印 commit SHA 锁定形式的地址
```

它会：**从 jsDelivr 拉已发布的组件 → 校验与本地字节一致（防漏推/防缓存错版本）
→ 在沙箱加载远端那份代码 → 真打一次线上数据（分类→列表→详情→取流）→ 打印安装深链**。
这是最接近 App 真实加载路径的验证。

### 2. 安装（组件已托管在 jsDelivr，开箱即用）

两个组件都已发布到公共仓库 `Tonyhilo/capyplayer-widgets`，通过 jsDelivr CDN 分发：

| 组件 | 组件 JS 地址 |
|---|---|
| **苹果CMS 影视** | `https://cdn.jsdelivr.net/gh/Tonyhilo/capyplayer-widgets@main/widget/maccms.js` |
| **红果短剧** | `https://cdn.jsdelivr.net/gh/Tonyhilo/capyplayer-widgets@main/widget/hongguo.js` |

**安装方式（任选）**

- **扫码**：浏览器打开 `web/index.html`（地址已预填，打开就能看到二维码）→ 手机扫码 → App 自动安装
- **点链接**：手机浏览器打开下面这条深链

```
# 苹果CMS 影视
com.feifeiduck.capyplayer://add-widget?data=aHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL1RvbnloaWxvL2NhcHlwbGF5ZXItd2lkZ2V0c0BtYWluL3dpZGdldC9tYWNjbXMuanM

# 红果短剧
com.feifeiduck.capyplayer://add-widget?data=aHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL1RvbnloaWxvL2NhcHlwbGF5ZXItd2lkZ2V0c0BtYWluL3dpZGdldC9ob25nZ3VvLmpz
```

深链格式（官方规范）：`com.feifeiduck.capyplayer://add-widget?data=<base64url(组件JS地址)>`

**CDN 端点（不通时可换）**

| 端点 | 说明 |
|---|---|
| `cdn.jsdelivr.net` | 默认，实测最快 |
| `fastly.jsdelivr.net` | 备用，实测同样快 |
| `gcore.jsdelivr.net` | 备用 |
| `raw.githubusercontent.com/Tonyhilo/capyplayer-widgets/main/widget/maccms.js` | 直连 GitHub，国内可能不稳 |

> **想锁定版本**，把 `@main` 换成 commit SHA 即可（如 `@f39b728…`），
> 避免以后改动 `main` 导致行为漂移。

### 3. 自己改一版 / 重新托管

```bash
# 本仓库已配好代理与远端，改完直接推
git add -A && git commit -m "..." && git push
# jsDelivr 会缓存在线内容，刷新用：
#   https://purge.jsdelivr.net/gh/Tonyhilo/capyplayer-widgets@main/widget/maccms.js
```

---

## 苹果CMS 组件（`widget/maccms.js`）

苹果CMS 是国内最主流的开源影视建站程序，全网**上万个站点**。数据模型统一，但
**路由可被站长自定义** —— 实测五种形态互不相同。所以组件不写死路由：

```
① 站点配置表    内置已实测站点，一键可用
② 路由自动探测  抓首页 → 嗅探链接形态 → 实测验证 → 缓存 24h（冷探测约 2s）
③ 播放三级回退  player_aaaa → 内联 iframe/JS → 全页扫描 m3u8/mp4
```

| 模块 | 类型 | 函数 | 说明 |
|---|---|---|---|
| 分类 | `category` | `getCategories` | 自动嗅探站点分类导航 |
| 影视库 | `media_list` | `getVideoList` | 按分类分页浏览 |
| 搜索 | `media_list` | `searchVideos` | 自动探测搜索路由 |
| 详情 | — | `loadDetail` | 多线路多集，输出每集明文直链 |

可用参数：

- `site` —— 站点：`duanju55`（五五短剧）/ `huasheng`（花生短剧）/ `custom`
- `siteBase` —— 仅当 `site=custom` 时生效，填任意苹果CMS 站地址（如 `https://www.example.com`）
- `catId` —— 分类 ID，留空则用站点默认分类
- `keyword` —— 搜索关键词
- `page` —— 页码（系统注入）

主要可调项（`widget/maccms.js:25` `MC_CONFIG`）：

| 键 | 默认 | 说明 |
|---|---|---|
| `maxEpisodes` | `60` | 详情页最多解析多少集（多集站动辄上百集，全量解析会拖死客户端） |
| `fetchConcurrency` | `3` | 分集取流并发数 |
| `detectCacheSeconds` | `86400` | 路由探测结果缓存时长 |

### 站点实测状态（2026-10-01）

| 站点 | 域名 | 状态 | 说明 |
|---|---|---|---|
| 五五短剧 | `www.duanju55.com` | ✅ 可用 | 整剧打包单个 m3u8；921 分片；VOD；无 KEY；TS 明文 |
| 花生短剧 | `www.zywest263.com` | ✅ 可用 | 真·多集；播放地址明文内联在页面 JS 里 |
| 短剧网站 | `www.duanju2.com` | ⚠️ 待深测 | 站点可达，路由交给自动探测 |
| 168 影院 | `www.xzyx168.com` | ❌ 不适用 | class 随机化 + 播放链接 JS 生成 |
| ptt.red | `ptt.red` | ❌ 挂了 | Cloudflare 403 |

> 其余站点请用「自定义站点」+ 自动探测试。**任何苹果CMS 站都可以直接填地址试。**

---

## 红果短剧组件（`widget/hongguo.js`）

### ⚠️ 能力边界（务必先读）

**红果网页版每部剧只开放前 3 集试看**，第 4 集起播放页返回 `404`。
组件默认只输出可播集，并在详情描述里标注 `可播 3 集 / 全 77 集`。

想要**全集可播**需要自建解密代理 —— 红果 App 接口下发的是 `CENC AES-128-CTR` 加密流。
组件已预留开关：

```js
// widget/hongguo.js
proxyBase: "",   // 填上你的代理地址即可解锁全集
```

| 模块 | 类型 | 函数 | 说明 |
|---|---|---|---|
| 分类 | `category` | `getCategories` | 真人剧 / 漫剧 / AI剧 / 动漫 |
| 剧库 | `media_list` | `getDramaList` | 按频道分页，24 条/页 |
| 搜索 | `media_list` | `searchDramas` | 按剧名关键词 |
| 详情 | — | `loadDetail` | 剧集 + 明文直链 + 演职员 + 标签 |

参数：`route`（频道）、`keyword`、`page`。

---

## 目录

```
widget/maccms.js              苹果CMS 通用组件（交付物）
widget/hongguo.js             红果组件（交付物）
tools/selftest_maccms.js      苹果CMS 自测：离线夹具 + 真实站点 + 自动探测
tools/selftest.js             红果自测
tools/verify_remote.js        线上产物验证：CDN → 沙箱 → 真实数据
web/index.html                一键安装落地页（双组件可切换，地址已预填）
docs/苹果CMS组件-技术报告.md    完整技术报告（实测数据 + file:line + P0/P1/P2）
docs/红果组件-技术报告.md      红果技术报告
docs/组件能力与可用资源.md      能力边界 + 五层资源 + 存活表
_probe/                       可行性探测脚本，可复现全部结论
_inspect/                     参考源码（《短剧库》Go 项目，已 gitignore 不入库）
```

---

## 排查

### 苹果CMS

| 现象 | 原因 | 处理 |
|---|---|---|
| `无法识别该站点的苹果CMS 路由` | 站点是 SPA / 播放链接由 JS 生成 / 有强反爬 | 不是所有站都能解析。换站或用「自定义站点」换一个 |
| 列表空但站点能打开 | 分类 ID 猜错 | 先看「分类」模块，用嗅探出来的分类进去 |
| 详情页有剧但 0 集可播 | 该站播放地址需要 JS 执行 | 见上，换站 |
| 探测很慢（约 2s） | 冷探测，正常 | 之后走 24h 缓存 |
| 第 2 页无数据 | 该站分页形态特殊 | 组件会回退不翻页并告警 |

### 红果

| 现象 | 原因 | 处理 |
|---|---|---|
| 列表/搜索返回空数组 | 站点改版，`_ROUTER_DATA` 层名变了 | 看 App 内组件日志，调整 `hgLoaderLayer` 的层名常量 |
| 只能播 3 集 | 红果网页版的设计限制 | 正常。要全集需接 `proxyBase` |
| 播放 403 | 直链过期 | 退出详情重新进入，组件会实时重解析 |

---

## 探测经验（跨组件通用）

1. **国内站报「乱码/超时」，先怀疑压缩** —— 用 `curl --compressed` 复核。本次 `zywest263.com` 就被 Python 探测误判为死站。
2. **别信接口文档，一律实测** —— 本次 3 家公开免费 API 全挂（500 / 连不上 / 522）。
3. **`player_aaaa` 必须括号配对提取**，正则 `/\{.*?\}/` 会被嵌套的 `vod_data` 截断。
4. **采集 API（`/api.php/provide/vod/`）多站返回 `closed`** —— 只能作为「命中就用」的优化，不能作为依赖。

数据来源：各站点网页版 · 内容版权归原平台所有 · 组件仅做数据搬运，请合规使用。
