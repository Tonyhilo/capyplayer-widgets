# -*- coding: utf-8 -*-
"""苹果CMS 站结构探测：列表 / 详情 / 分集 / 搜索 / 分类"""
import re, ssl, sys, urllib.request, urllib.error
from urllib.parse import quote, urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE


def get(url, referer=None):
    h = {"User-Agent": UA, "Referer": referer or url,
         "Accept": "text/html,application/xhtml+xml,*/*"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h),
                                    timeout=25, context=C) as r:
            return r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return "__HTTP_%s__" % e.code
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__


def sec(t):
    print("\n" + "=" * 70)
    print(t)
    print("=" * 70)


BASE = sys.argv[1] if len(sys.argv) > 1 else "https://www.duanju55.com"

# ---------- 1. 首页：分类入口 ----------
sec("1. 首页 -> 分类入口")
home = get(BASE + "/")
print("首页大小: %d B" % len(home))
nav = re.findall(r'href="([^"]*)"[^>]*>([^<]{1,20})</a>', home)
cats = []
for href, text in nav:
    text = text.strip()
    if not text:
        continue
    if re.search(r"/vod/(?:show|type|list)/", href) or re.search(r"/vodshow/|/vodtype/", href):
        if (href, text) not in cats:
            cats.append((href, text))
print("发现分类链接 %d 个:" % len(cats))
for href, text in cats[:20]:
    print("   %-46s %s" % (href, text))

# ---------- 2. 列表页 ----------
sec("2. 列表页 -> 条目结构")
list_url = None
if cats:
    list_url = urljoin(BASE + "/", cats[0][0])
if not list_url:
    list_url = BASE + "/index.php/vod/type/id/1.html"
print("测试列表页:", list_url)
page = get(list_url, BASE + "/")
print("HTTP 大小: %d B" % len(page))
detail_links = re.findall(r'href="([^"]*/vod/detail/id/(\d+)\.html)"', page)
print("详情链接数: %d" % len(set(d[0] for d in detail_links)))
# 看一个完整的 <a> 标签
m = re.search(r'<a[^>]*href="[^"]*/vod/detail/id/\d+\.html"[^>]*>.*?</a>', page, re.S)
if m:
    print("\n【条目原始 HTML（截断 700 字）】")
    print(m.group(0)[:700])
# 分页
pg = re.findall(r'href="([^"]*(?:/page/\d+|/page/\d+\.html|vodshow[^"]*page[^"]*))"', page)
print("\n分页链接样例:", list(dict.fromkeys(pg))[:5])

# ---------- 3. 详情页 ----------
sec("3. 详情页 -> 分集 + 元数据")
if detail_links:
    did = sorted(set(d[1] for d in detail_links))[0]
    durl = "%s/index.php/vod/detail/id/%s.html" % (BASE, did)
    print("测试详情页:", durl)
    det = get(durl, list_url)
    print("HTTP 大小: %d B" % len(det))
    t = re.search(r"<title>([^<]*)</title>", det)
    print("标题:", t.group(1)[:90] if t else None)
    print("封面:", (re.search(r'data-original="([^"]+)"', det) or re.search(r'<img[^>]*src="([^"]+)"', det)) and
          (re.search(r'data-original="([^"]+)"', det) or re.search(r'<img[^>]*src="([^"]+)"', det)).group(1)[:90])
    plays = sorted(set(re.findall(r'href="(/index\.php/vod/play/id/\d+/sid/\d+/nid/\d+\.html)"', det)))
    plays2 = sorted(set(re.findall(r'href="([^"]*/vod/play/[^"]*)"', det)))
    print("分集链接(标准式): %d 个" % len(plays), plays[:4])
    print("分集链接(宽松式): %d 个" % len(plays2), plays2[:4])
    # 分集区块
    mm = re.search(r'(class="[^"]*(?:playlist|pcDrama_catalogItem|playlink|content__playlist)[^"]*")', det)
    print("分集区块 class:", mm.group(1) if mm else "未找到")
    # 描述
    d = re.search(r'class="[^"]*(?:content|desc|introduction)[^"]*"[^>]*>(.*?)</div>', det, re.S)
    if d:
        txt = re.sub(r"<[^>]+>", "", d.group(1)).strip()
        print("简介:", txt[:120])
else:
    print("无详情链接")

# ---------- 4. 搜索 ----------
sec("4. 搜索")
for path in ("/index.php/vod/search.html?wd=%s",
             "/index.php/vod/search/page/1/wd/%s.html",
             "/vodsearch/-------------.html?wd=%s",
             "/index.php/vod/search.html?searchword=%s"):
    u = BASE + (path % quote("天医"))
    r = get(u, BASE + "/")
    n = len(set(re.findall(r"/vod/detail/id/\d+\.html", r))) if not r.startswith("__") else 0
    print("  %-46s size=%-7s 详情链接=%d" % (path % "天医", len(r) if not r.startswith("__") else r, n))

# ---------- 5. 播放页 ----------
sec("5. 播放页 -> player_aaaa")
if detail_links and plays:
    pu = urljoin(BASE + "/", plays[0])
    pp = get(pu, durl)
    m = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", pp, re.S)
    print("播放页:", pu)
    print("player_aaaa 命中:", bool(m))
    if m:
        print(m.group(1)[:400])
