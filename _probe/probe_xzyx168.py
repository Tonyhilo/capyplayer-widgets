# -*- coding: utf-8 -*-
"""xzyx168 自定义伪静态路由深挖：详情 -> 播放 -> player_aaaa"""
import re, ssl, urllib.request, urllib.error, json
from urllib.parse import urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE
OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=C))

def get(url, referer=None, timeout=20):
    h = {"User-Agent": UA, "Referer": referer or url, "Accept": "*/*"}
    try:
        with OPENER.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
            return r.read().decode("utf-8", "ignore"), r.status
    except urllib.error.HTTPError as e:
        return "__HTTP_%s__" % e.code, e.code
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__, 0

def sec(t): print("\n" + "=" * 74); print(t); print("=" * 74)

B = "https://www.xzyx168.com"

sec("1. 短剧分类页 /xzyxvt/duanjun.html")
s, st = get(B + "/xzyxvt/duanjun.html", B + "/")
print("HTTP %s size=%d" % (st, len(s)))
d = list(dict.fromkeys(re.findall(r'href="(/xzyxvd/\d+\.html)"', s)))
print("详情链接 %d 个: %s" % (len(d), d[:8]))
# 分页
pg = list(dict.fromkeys(re.findall(r'href="([^"]*duanjun[^"]*)"', s)))
print("分页/相关链接:", pg[:8])
for k in ("vodshow", "page/", "--------"):
    print("  含 %-10s : %s" % (k, k in s))

sec("2. 详情页结构")
if d:
    did = re.match(r"/xzyxvd/(\d+)", d[0]).group(1)
    det, st = get(B + d[0], B + "/xzyxvt/duanjun.html")
    print("HTTP %s size=%d" % (st, len(det)))
    t = re.search(r"<title>([^<]*)</title>", det)
    print("title:", t.group(1)[:90] if t else None)
    for pat in (r'href="([^"]*play[^"]*)"', r'href="([^"]*/\d+-\d+-\d+\.html)"',
                r'href="([^"]*xzyxv[^"]*)"'):
        f = list(dict.fromkeys(re.findall(pat, det)))
        if f: print("  %-42s -> %s" % (pat, f[:5]))
    # 分集区块 class
    for m in re.finditer(r'class="([^"]*(?:play|list|catalog|episode|剧集)[^"]*)"', det):
        print("   block class:", m.group(1))
    # 详情页里的 script 变量
    for k in ("player_aaaa", "vod_play_list", "vod_url", "__NUXT__"):
        print("  含 %-14s : %s" % (k, k in det))

sec("3. 播放页")
# 从详情页抽任一 play 链接
det, _ = get(B + d[0], B + "/") if d else ("", 0)
cands = list(dict.fromkeys(re.findall(r'href="([^"]*)"', det)))
pl = [c for c in cands if "play" in c.lower()][:5]
print("播放候选:", pl)
for p in pl[:2]:
    pu = urljoin(B + "/", p)
    pp, st = get(pu, B + d[0])
    m = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", pp, re.S)
    print("  %s status=%s size=%s player_aaaa=%s" % (pu, st, len(pp), bool(m)))
    if m:
        print("   raw:", re.sub(r"\s+", " ", m.group(1))[:400])

sec("4. 标准 maccms 路由是否也能歪打正着")
for p in ("/index.php/vod/detail/id/%s.html" % (d[0].split("/")[-1].replace(".html", "") if d else "1"),
          "/xzyxvd/1.html", "/xzyxvd/1-1-1.html"):
    r, st = get(B + p, B + "/")
    n = len(set(re.findall(r"/xzyxvd/\d+\.html", r))) if not r.startswith("__") else 0
    print("  %-44s status=%-4s size=%-8s items=%d  sameAsHome=%s" %
          (p, st, len(r) if not r.startswith("__") else r, n, len(r) == 168489 if not r.startswith("__") else "-"))

print("\nDONE")
