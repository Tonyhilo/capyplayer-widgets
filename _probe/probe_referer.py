# -*- coding: utf-8 -*-
"""验证红果直链：1) 完整URL结构 2) 是否需要 Referer 3) 是否有时效参数"""
import json, ssl, urllib.request

BASE = "https://hongguoduanju.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HDRS = {"User-Agent": UA, "Referer": BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HDRS)
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return r.status, r.read().decode("utf-8", "ignore")


def router_data(html):
    i = html.find("_ROUTER_DATA")
    s = html.index("{", i); depth = 0; instr = False; esc = False
    for j in range(s, len(html)):
        c = html[j]
        if instr:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': instr = False
            continue
        if c == '"': instr = True
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return json.loads(html[s:j + 1])


_, html = get(BASE + "/category/real-drama")
sid = router_data(html)["loaderData"]["category_$"]["recommendList"][0]["series_id"]
_, html = get(BASE + "/detail?series_id=" + sid)
vids = router_data(html)["loaderData"]["detail_page"]["seriesDetail"]["vid_list"]
_, html = get("%s/player/%s/%s" % (BASE, sid, vids[0]))
ld = router_data(html)["loaderData"]
pg = [v for v in ld.values() if isinstance(v, dict) and v.get("video_player_info")][0]
url = pg["video_player_info"]["main_url"]

print("=== 完整 main_url ===")
print(url)
print("\n=== 路径/查询拆解 ===")
from urllib.parse import urlparse, parse_qs
p = urlparse(url)
print("host:", p.netloc, "| path:", p.path)
q = parse_qs(p.query)
for k in ("a", "ch", "cr", "dr", "er", "l", "btag", "cd", "vid", "expire", "x-expires", "sign", "signature", "mime_type", "definition"):
    if k in q: print("  %s = %s" % (k, q[k]))

print("\n=== Referer 依赖性测试 ===")
import urllib.error
cases = [
    ("不带任何 Referer", {"User-Agent": UA, "Range": "bytes=0-1023"}),
    ("带 referer=hongguoduanju.com", {"User-Agent": UA, "Referer": BASE + "/", "Range": "bytes=0-1023"}),
    ("带 referer=novel.snssdk.com", {"User-Agent": UA, "Referer": "https://novel.snssdk.com/", "Range": "bytes=0-1023"}),
    ("伪造 referer=evil.com", {"User-Agent": UA, "Referer": "https://evil.example.com/", "Range": "bytes=0-1023"}),
    ("无 UA 无 Referer", {"Range": "bytes=0-1023"}),
]
for name, h in cases:
    try:
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            head = r.read(16)
            print("  [OK  ] %-32s HTTP %s %s | %s" % (
                name, r.status, r.headers.get("Content-Type"), head[:8].hex()))
    except urllib.error.HTTPError as e:
        print("  [FAIL] %-32s HTTP %s %s" % (name, e.code, e.reason))
    except Exception as e:
        print("  [ERR ] %-32s %s: %s" % (name, type(e).__name__, str(e)[:70]))
