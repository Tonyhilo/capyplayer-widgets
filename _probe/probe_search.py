# -*- coding: utf-8 -*-
import json, ssl, urllib.request, urllib.error
from urllib.parse import quote

BASE = "https://hongguoduanju.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HDRS = {"User-Agent": UA, "Referer": BASE + "/", "Accept": "text/html,*/*"}
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE


def probe(url):
    try:
        req = urllib.request.Request(url, headers=HDRS)
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            html = r.read().decode("utf-8", "ignore")
        i = html.find("_ROUTER_DATA")
        keys, n = None, 0
        if i >= 0:
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
                    if depth == 0:
                        d = json.loads(html[s:j + 1]); break
            ld = d.get("loaderData", {})
            keys = list(ld.keys())
            for v in ld.values():
                if isinstance(v, dict):
                    for kk in ("recommendList", "resultList", "searchList", "list"):
                        if isinstance(v.get(kk), list):
                            n = len(v[kk])
        return r.status, len(html), keys, n
    except urllib.error.HTTPError as e:
        return e.code, 0, None, 0
    except Exception as e:
        return "ERR:" + type(e).__name__, 0, str(e)[:50], 0


print("=== 分类路由 ===")
for route in ("real-drama", "comic-drama", "ai-drama", "comic"):
    st, size, keys, n = probe("%s/category/%s" % (BASE, route))
    print("  /category/%-12s -> HTTP %-6s size=%-7s items=%-3s keys=%s" % (route, st, size, n, keys))

print("\n=== 搜索候选 ===")
for path in ("/search?query=%s", "/search?keyword=%s", "/search?q=%s", "/search?query=%s&page=1"):
    u = BASE + (path % quote("总裁"))
    st, size, keys, n = probe(u)
    print("  %-34s -> HTTP %-6s size=%-7s items=%-3s keys=%s" % (path % "总裁", st, size, n, keys))
