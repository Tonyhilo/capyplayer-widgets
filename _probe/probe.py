# -*- coding: utf-8 -*-
"""红果短剧网页版链路探测：列表 -> 详情 -> 取流"""
import json, re, sys, urllib.request, urllib.error, ssl

BASE = "https://hongguoduanju.com"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HDRS = {
    "User-Agent": UA,
    "Referer": BASE + "/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or HDRS)
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return r.status, r.read().decode("utf-8", "ignore")


def router_data(html):
    i = html.find("_ROUTER_DATA")
    if i < 0:
        return None
    s = html.index("{", i)
    depth = 0
    instr = False
    esc = False
    for j in range(s, len(html)):
        c = html[j]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
            continue
        if c == '"':
            instr = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(html[s:j + 1])
    return None


def step(t):
    print("\n" + "=" * 60)
    print(t)
    print("=" * 60)


# ---------- 1. 列表 ----------
step("1. 分类列表 /category/real-drama?page=1")
st, html = get(BASE + "/category/real-drama")
d = router_data(html)
page = d["loaderData"]["category_$"]
items = page["recommendList"]
print("HTTP", st, "| 条目数", len(items), "| pagination", json.dumps(page["pagination"], ensure_ascii=False))
first = items[0]
print("首条:", json.dumps({k: first.get(k) for k in
      ("series_id", "series_name", "episode_cnt", "accessible_episode_cnt",
       "pay_type", "episode_right_text")}, ensure_ascii=False))
series_id = first["series_id"]

# ---------- 2. 详情 ----------
step("2. 详情 /detail?series_id=%s" % series_id)
st, html = get(BASE + "/detail?series_id=" + series_id)
d = router_data(html)
dp = d["loaderData"]["detail_page"]
sd = dp["seriesDetail"]
print("HTTP", st, "| seriesDetail keys:", list(sd.keys()))
vids = sd.get("vid_list")
print("vid_list 长度:", len(vids) if isinstance(vids, list) else vids)
print("前3个 vid:", vids[:3] if isinstance(vids, list) else None)
print("末尾3个 vid:", vids[-3:] if isinstance(vids, list) else None)
print("recommendations:", len(dp.get("recommendations") or []))

# ---------- 3. 取流 ----------
for label, idx in (("第1集", 0), ("第3集", 2), ("最后1集", len(vids) - 1)):
    step("3. 取流 /player/<series>/<vid>  [%s]" % label)
    url = "%s/player/%s/%s" % (BASE, series_id, vids[idx])
    try:
        st, html = get(url)
    except Exception as e:
        print("  请求失败:", e)
        continue
    d = router_data(html)
    if not d:
        print("  HTTP", st, "无 _ROUTER_DATA")
        continue
    ld = d.get("loaderData", {})
    print("  HTTP", st, "| loaderData:", list(ld.keys()))
    pg = None
    for k, v in ld.items():
        if isinstance(v, dict) and v.get("video_player_info"):
            pg = v
            print("  -> 命中层:", k)
            break
    if pg is None:
        for k, v in ld.items():
            if isinstance(v, dict):
                print("    [%s] keys: %s" % (k, list(v.keys())[:15]))
        print("  未找到 video_player_info")
        continue
    print("  vid:", pg.get("vid"), "| series_id:", pg.get("series_id"))
    info = pg.get("video_player_info") or {}
    print("  video_player_info keys:", list(info.keys())[:20])
    main_url = info.get("main_url")
    print("  main_url:", (main_url[:160] + "...") if isinstance(main_url, str) and len(main_url) > 160 else main_url)
    print("  duration:", info.get("duration"), "| definition:", info.get("definition"))
    # 探一下直链响应头
    if isinstance(main_url, str) and main_url.startswith("http"):
        try:
            req = urllib.request.Request(main_url, headers={
                **HDRS, "Referer": "https://novel.snssdk.com/", "Range": "bytes=0-1023"})
            with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
                head = r.read(32)
                print("  直链 HTTP", r.status, "| Content-Type:", r.headers.get("Content-Type"),
                      "| Content-Length:", r.headers.get("Content-Length"))
                print("  首32字节 hex:", head[:24].hex())
        except Exception as e:
            print("  直链探测失败:", type(e).__name__, e)
