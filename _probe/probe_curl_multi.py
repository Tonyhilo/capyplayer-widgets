# -*- coding: utf-8 -*-
"""用 curl --compressed 绕开压缩问题，探测多站 maccms 结构"""
import re, subprocess, sys, json

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

def curl(url, ref=None, timeout=25):
    cmd = ["curl", "-s", "--compressed", "-A", UA, "--max-time", str(timeout),
           "-H", "Accept-Language: zh-CN,zh;q=0.9", "-L"]
    if ref:
        cmd += ["-H", "Referer: " + ref]
    cmd.append(url)
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout + 10)
        return p.stdout.decode("utf-8", "ignore")
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__

def sec(t): print("\n" + "=" * 74); print(t); print("=" * 74)

SITES = {
    "花生短剧 zywest263": "https://www.zywest263.com",
    "网果 duanju2": "https://www.duanju2.com",
}

for name, B in SITES.items():
    sec("%s  (%s)" % (name, B))
    home = curl(B + "/", B + "/")
    print("home size=%d" % len(home))
    if home.startswith("__"):
        print(home); continue

    # 分类链接
    cats = []
    for m in re.finditer(r'<a[^>]*href="([^"]+)"[^>]*>\s*([^<]{1,18}?)\s*</a>', home):
        href, txt = m.group(1), m.group(2).strip()
        if not txt: continue
        if re.search(r"(vod/type|vod/show|vodshow|vodtype|/show/|/list/|/vod/|type/|zmn)", href):
            if (href, txt) not in cats:
                cats.append((href, txt))
    print("[nav] %d 个:" % len(cats))
    for h, t in cats[:16]:
        print("     %-52s %s" % (h, t))

    # 详情链接（首页）
    det = list(dict.fromkeys(re.findall(r'href="([^"]*(?:detail|view|movie|vod|d|vd)/[^"]*?\d+[^"]*?\.html)"', home)))
    print("[detail-on-home] %s" % det[:4])

    sec("%s · 列表页解析" % name)
    # 逐个尝试候选列表页
    cands = [h for h, _ in cats[:3]]
    if not cands:
        cands = ["/vodshow/1--------1---.html", "/index.php/vod/type/id/1.html",
                 "/show/duanju-----------.html", "/search.html?page=1&searchtype=5&tid=27"]
    picked = None
    for c in cands:
        u = c if c.startswith("http") else B + ("" if c.startswith("/") else "/") + c
        page = curl(u, B + "/")
        if page.startswith("__"):
            print("   %-56s %s" % (c, page)); continue
        dets = list(dict.fromkeys(re.findall(r'href="([^"]*?(?:detail|view|movie|vod|/d/)[^"]*?\d+[^"]*?\.html)"', page)))
        print("   %-56s size=%-7d 详情链接=%d" % (c, len(page), len(dets)))
        if dets and not picked:
            picked = (u, page, dets)
    if not picked:
        print("   !! 未找到可用列表页")
        continue

    u, page, dets = picked
    print("\n[列表条目原始片段]")
    i = page.find(dets[0])
    print(re.sub(r"\s+", " ", page[max(0, i - 420):i + 560])[:900])

    sec("%s · 详情页 + 播放页" % name)
    durl = dets[0] if dets[0].startswith("http") else B + ("" if dets[0].startswith("/") else "/") + dets[0]
    det_html = curl(durl, u)
    print("detail size=%d" % len(det_html))
    t = re.search(r"<title>([^<]*)</title>", det_html)
    print("title:", t.group(1)[:110] if t else None)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", det_html, re.S)
    print("h1:", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", h1.group(1))).strip()[:80] if h1 else None)
    for k in ("content__playlist", "playlist", "pcDrama_catalog", "playlink", "play-btn", "tab-pane"):
        if k in det_html: print("   含 class:", k)
    plays = list(dict.fromkeys(re.findall(r'href="([^"]*(?:play|vodplay|movie)[^"]*)"', det_html)))
    plays = [p for p in plays if not p.startswith("#") and re.search(r"\d", p)]
    print("play 候选 %d: %s" % (len(plays), plays[:5]))

    if plays:
        pu = plays[0] if plays[0].startswith("http") else B + ("" if plays[0].startswith("/") else "/") + plays[0]
        ph = curl(pu, durl)
        m = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", ph, re.S)
        print("播放页 %s size=%d player_aaaa=%s" % (pu, len(ph), bool(m)))
        if m:
            print("  raw:", re.sub(r"\s+", " ", m.group(1))[:400])

    sec("%s · 搜索" % name)
    for p in ("/index.php/vod/search.html?wd=%E5%A4%A9%E5%8C%BB",
              "/search.html?searchword=%E5%A4%A9%E5%8C%BB",
              "/index.php/vod/search/page/1/wd/%E5%A4%A9%E5%8C%BB.html",
              "/search/%E5%A4%A9%E5%8C%BB----------1---.html"):
        s = curl(B + p, B + "/")
        n = len(set(re.findall(r'href="([^"]*?\d+\.html)"', s))) if not s.startswith("__") else 0
        print("   %-56s size=%-7s links=%d" % (p, (s if s.startswith("__") else len(s)), n))

print("\nDONE")
