# -*- coding: utf-8 -*-
"""补充探测：
A. duanju55 的分页 HTML 真实结构 + 多部分集详情页 + m3u8 直连校验
B. zywest263 / xzyx168 的真实形态（SPA？重写？）
"""
import re, ssl, sys, urllib.request, urllib.error, json
from urllib.parse import quote, urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE
OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=C))

def get(url, referer=None, timeout=20, raw=False):
    h = {"User-Agent": UA, "Referer": referer or url,
         "Accept": "text/html,application/xhtml+xml,*/*"}
    try:
        with OPENER.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
            b = r.read()
            return (b, r.status, dict(r.headers)) if raw else (b.decode("utf-8", "ignore"), r.status, dict(r.headers))
    except urllib.error.HTTPError as e:
        return ("__HTTP_%s__" % e.code, e.code, {})
    except Exception as e:
        return ("__ERR_%s__" % type(e).__name__, 0, {})

def sec(t):
    print("\n" + "=" * 74); print(t); print("=" * 74)

BASE = "https://www.duanju55.com"

# ---------------- A1. 分页结构 ----------------
sec("A1. duanju55 列表页分页 HTML 真实结构")
s, _, _ = get(BASE + "/index.php/vod/type/id/1.html", BASE + "/")
# 抓所有含 page 的 a 标签
for m in re.finditer(r'<a[^>]*>[^<]*</a>', s):
    tag = m.group(0)
    if "page" in tag.lower():
        print("  ", re.sub(r"\s+", " ", tag)[:200])
# 也看分页容器
mm = re.search(r'(<[^>]*class="[^"]*(?:page|pager|pagination|pages)[^"]*"[^>]*>.{0,1200})', s, re.S)
if mm:
    print("\n[分页容器片段]")
    print(re.sub(r"\s+", " ", mm.group(1))[:1200])

# ---------------- A2. 多部分集 ----------------
sec("A2. duanju55 抽查 6 部剧的分集形态")
ids = sorted(set(re.findall(r"/vod/detail/id/(\d+)\.html", s)))
print("本页剧 ID:", ids[:12])
multi = []
for did in ids[:6]:
    d, st, _ = get("%s/index.php/vod/detail/id/%s.html" % (BASE, did), BASE + "/")
    plays = sorted(set(re.findall(r'href="([^"]*/vod/play/id/%s/sid/\d+/nid/\d+\.html)"' % did, d)))
    name = re.search(r"<title>([^<]*)</title>", d)
    # 详情页里也可能写「集数」
    cnt = re.findall(r"(\d+)\s*集", d)
    print("  id=%-7s plays=%-3d 集数字样=%-8s %s" % (did, len(plays), (cnt[0] if cnt else "-"),
          (name.group(1).split("-")[0] if name else "")[:30]))
    if len(plays) > 1:
        multi.append((did, plays))
if multi:
    print("\n[多集样本] id=%s plays=%d" % (multi[0][0], len(multi[0][1])))
    print("   前 3:", multi[0][1][:3])
else:
    print("\n  → 抽查的 6 部剧全部只有 1 个分集链接（整剧打包）")

# ---------------- A3. m3u8 直连校验 ----------------
sec("A3. duanju55 m3u8 直链可播性校验（不带 Referer）")
pu = "%s/index.php/vod/play/id/53848/sid/1/nid/1.html" % BASE
pp, _, _ = get(pu, BASE + "/")
hit = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", pp, re.S)
if hit:
    info = json.loads(hit.group(1))
    m3u8 = info.get("url")
    print("m3u8:", m3u8)
    b, st, hdr = get(m3u8, None, 20, raw=True)
    if isinstance(b, bytes):
        txt = b.decode("utf-8", "ignore")
        print("HTTP %s | %d bytes | ctype=%s" % (st, len(b), hdr.get("Content-Type")))
        print("--- 前 300 字 ---")
        print(txt[:300])
        segs = len(re.findall(r"^[^#\n].*\.(?:ts|m4s|mp4)", txt, re.M))
        print("分片数=%d  含 #EXT-X-KEY=%s  含 #EXT-X-MAP=%s" %
              (segs, "#EXT-X-KEY" in txt, "#EXT-X-MAP" in txt))
        m2 = re.search(r"^([^#\n].*)$", txt, re.M)
        if m2:
            first = m2.group(1).strip()
            sl = urljoin(m3u8, first)
            print("首个分片:", sl)
            b2, st2, hdr2 = get(sl, None, 20, raw=True)
            if isinstance(b2, bytes):
                print("  分片 HTTP %s | %d bytes | ctype=%s | head=%r" %
                      (st2, len(b2), hdr2.get("Content-Type"), b2[:12]))
                if b2[4:8] == b"ftyp":
                    print("  ✅ 明文 MP4（ftyp/isom），可直接播")
                elif b2[:1] == b"\x47":
                    print("  ✅ MPEG-TS 明文，可直接播")
else:
    print("player_aaaa 未命中")

# ---------------- B. 另两站形态 ----------------
for site in ("https://www.zywest263.com", "https://www.xzyx168.com"):
    sec("B. %s 真实形态" % site)
    h, st, hdr = get(site + "/", site + "/")
    print("home: HTTP %s size=%s server=%s" % (st, len(h) if not h.startswith("__") else h, hdr.get("Server")))
    print("--- home 前 900 字 ---")
    print(h[:900])
    print("\n--- 标记扫描 ---")
    for k in ("<script", "vue", "nuxt", "_nuxt", "next", "__NEXT_DATA__", "window.location",
              "vod/detail", "vod/play", "vod/show", "vod/type", "api.php", "player_aaaa"):
        if k.lower() in h.lower():
            print("   命中:", k)
    # 试真正的详情路由
    print("\n--- 尝试直接找详情/播放链接 ---")
    for pat in (r'href="([^"]*vod[^"]*)"', r'href="(/[^"]{0,60}\.html)"'):
        found = list(dict.fromkeys(re.findall(pat, h)))[:12]
        if found:
            print("   %s ->" % pat, found[:12])
    # 试 maccms 类目接口
    for p in ("/index.php/vod/type/id/2.html", "/index.php/vod/type/id/20.html",
              "/index.php/vod/detail/id/1.html", "/index.php/vod/show/id/2.html",
              "/api.php/provide/vod/?ac=list"):
        r, s2, _ = get(site + p, site + "/")
        n = len(set(re.findall(r"/vod/detail/id/\d+\.html", r))) if not r.startswith("__") else 0
        print("   %-42s status=%-4s size=%-8s items=%d" % (p, s2, len(r) if not r.startswith("__") else r, n))

print("\nDONE")
