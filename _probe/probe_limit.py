# -*- coding: utf-8 -*-
"""量化红果网页版的「可播集数」限制"""
import json, ssl, urllib.request, urllib.error

BASE = "https://hongguoduanju.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
H = {"User-Agent": UA, "Referer": BASE + "/", "Accept": "text/html,*/*"}
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE


def rd(html):
    i = html.find("_ROUTER_DATA")
    if i < 0:
        return None
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
                return json.loads(html[s:j + 1])


def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=25, context=C).read().decode("utf-8", "ignore")


# 取前 18 部剧的 accessible_episode_cnt
rows = []
for route in ("real-drama", "comic-drama", "ai-drama"):
    html = fetch("%s/category/%s" % (BASE, route))
    for it in rd(html)["loaderData"]["category_$"]["recommendList"][:6]:
        rows.append((route, it["series_id"], it["series_name"],
                     it.get("episode_cnt"), it.get("accessible_episode_cnt")))

print("%-12s %-20s %6s %6s" % ("route", "title", "总集", "可播"))
print("-" * 50)
for r in rows:
    print("%-12s %-20s %6s %6s" % (r[0], r[2][:18], r[3], r[4]))

import collections
c = collections.Counter(r[4] for r in rows)
print("\n可播集数分布:", dict(c))

# 抽样验证：可播集数边界上下各探一次
sample = rows[0]
sid = sample[1]
html = fetch("%s/detail?series_id=%s" % (BASE, sid))
sd = rd(html)["loaderData"]["detail_page"]["seriesDetail"]
vids = sd["vid_list"]
n_acc = sample[4]
print("\n抽样剧集: %s (总%d集, 可播%s集)" % (sample[2], len(vids), n_acc))
for idx in sorted(set([0, n_acc - 1, n_acc, n_acc + 1, len(vids) - 1])):
    if idx < 0 or idx >= len(vids):
        continue
    url = "%s/player/%s/%s" % (BASE, sid, vids[idx])
    try:
        fetch(url)
        html2 = fetch(url)
        pg = [v for v in rd(html2)["loaderData"].values() if isinstance(v, dict) and v.get("video_player_info")]
        mu = pg[0]["video_player_info"].get("main_url") if pg else None
        print("  第%3d集 -> HTTP 200, main_url: %s" % (idx + 1, "有 ✓" if mu else "无 ✗"))
    except urllib.error.HTTPError as e:
        print("  第%3d集 -> HTTP %s %s" % (idx + 1, e.code, e.reason))
    except Exception as e:
        print("  第%3d集 -> %s" % (idx + 1, type(e).__name__))
