# -*- coding: utf-8 -*-
"""苹果CMS 多站路由矩阵探测
目的：找出各站实际可用的 列表/详情/播放/搜索 路由形态，
      为 widget/maccms.js 的「路由规则配置表」提供实测依据。
"""
import re, ssl, sys, urllib.request, urllib.error, json
from urllib.parse import quote, urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE
OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=C))

SITES = [
    "https://www.duanju55.com",
    "https://www.zywest263.com",
    "https://www.xzyx168.com",
]

def get(url, referer=None, timeout=20):
    h = {"User-Agent": UA, "Referer": referer or url,
         "Accept": "text/html,application/xhtml+xml,*/*",
         "Accept-Language": "zh-CN,zh;q=0.9"}
    try:
        with OPENER.open(urllib.request.Request(url, headers=h), timeout=timeout) as r:
            raw = r.read()
            return raw.decode("utf-8", "ignore"), r.status
    except urllib.error.HTTPError as e:
        return "__HTTP_%s__" % e.code, e.code
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__, 0

def size(s):
    return s if s.startswith("__") else str(len(s))

def probe_site(base):
    print("\n" + "#" * 78)
    print("SITE:", base)
    print("#" * 78)

    home, st = get(base + "/")
    print("[home] status=%s size=%s" % (st, size(home)))
    if home.startswith("__"):
        return

    # --- 站点标记 ---
    marks = []
    if re.search(r"player_aaaa", home):
        marks.append("home:player_aaaa")
    low = home.lower()
    for k in ("maccms", "苹果cms", "mac_cms", "template/mxone", "template/mxpro",
              "template/ds", "vod/type", "vod/show", "voddetail", "vodshow"):
        if k in low:
            marks.append(k)
    print("[marks] " + ", ".join(marks))

    # --- 分类 ID 候选：先从首页导航抠 ---
    cat_id = None
    nav = re.findall(r'href="([^"]*)"[^>]*>\s*([^<]{1,16}?)\s*</a>', home)
    catlinks = []
    for href, text in nav:
        if re.search(r"/vod/(show|type)/id/(\d+)", href) or re.search(r"/vodshow/(\d+)", href):
            catlinks.append((href, text))
    seen = set(); uniq = []
    for href, text in catlinks:
        if href in seen: continue
        seen.add(href); uniq.append((href, text))
    print("[nav] 分类链接 %d 个" % len(uniq))
    for href, text in uniq[:12]:
        print("        %-50s %s" % (href, text))
    m = re.search(r"/vod/(?:show|type)/id/(\d+)", " ".join(h for h, _ in uniq)) or \
        re.search(r"/vodshow/(\d+)", " ".join(h for h, _ in uniq))
    if m: cat_id = m.group(1)

    # --- 列表路由矩阵 ---
    print("[list] 列表路由矩阵 (cat_id=%s)" % cat_id)
    cid = cat_id or "1"
    list_candidates = [
        "/index.php/vod/type/id/%s.html" % cid,
        "/index.php/vod/show/id/%s.html" % cid,
        "/index.php/vod/type/id/%s/page/2.html" % cid,
        "/index.php/vod/show/id/%s/page/2.html" % cid,
        "/vodtype/%s.html" % cid,
        "/vodshow/%s--------2---.html" % cid,
        "/index.php/vod/show/class/" + quote("短剧") + "/id/%s.html" % cid,
    ]
    working_list = None
    for p in list_candidates:
        s, stt = get(base + p, base + "/")
        n = len(set(re.findall(r"/vod/detail/id/\d+\.html", s))) if not s.startswith("__") else 0
        flag = "OK " if n > 0 else ".. "
        print("   %s %-52s status=%-5s size=%-7s items=%d" % (flag, p, stt, size(s), n))
        if n > 0 and not working_list:
            working_list = (p, s)

    if not working_list:
        print("   !! 列表路由全部失败")
        return

    lpath, lhtml = working_list
    # --- 条目结构 ---
    m = re.search(r'<a[^>]*href="[^"]*/vod/detail/id/\d+\.html"[^>]*>.*?</a>', lhtml, re.S)
    if m:
        print("[list-item] " + re.sub(r"\s+", " ", m.group(0))[:520])
    # 分页形态
    pg = re.findall(r'href="([^"]*(?:/page/\d+|page/\d+/\w+/\d+|/vodshow/[^"]*---\d+---[^"]*))"', lhtml)
    print("[list-page] " + str(list(dict.fromkeys(pg))[:6]))

    # --- 详情 ---
    dids = sorted(set(re.findall(r"/vod/detail/id/(\d+)\.html", lhtml)))
    if not dids:
        print("   !! 无详情链接")
        return
    did = dids[0]
    print("[detail] 详情路由矩阵 (id=%s)" % did)
    det_candidates = [
        "/index.php/vod/detail/id/%s.html" % did,
        "/voddetail/%s.html" % did,
    ]
    working_det = None
    for p in det_candidates:
        s, stt = get(base + p, base + lpath)
        n = len(set(re.findall(r"/vod/play/id/%s/sid/\d+/nid/\d+\.html" % did, s))) if not s.startswith("__") else 0
        n2 = len(set(re.findall(r"/vod/play/", s))) if not s.startswith("__") else 0
        flag = "OK " if n2 > 0 else ".. "
        print("   %s %-52s status=%-5s size=%-7s playlinks=%d" % (flag, p, stt, size(s), n2))
        if n2 > 0 and not working_det:
            working_det = (p, s)
    if not working_det:
        print("   !! 详情路由全部失败")
        return
    dpath, dhtml = working_det

    # 详情字段
    t = re.search(r"<title>([^<]*)</title>", dhtml)
    print("[detail-title] " + (t.group(1)[:100] if t else "None"))
    plays = sorted(set(re.findall(r'href="([^"]*/vod/play/[^"]*)"', dhtml)))
    print("[detail-plays] %d 个: %s" % (len(plays), plays[:3]))
    block = re.search(r'class="([^"]*(?:playlist|playlink|catalog|playlist_col|stui-content__playlist)[^"]*)"', dhtml)
    print("[detail-block] " + (block.group(1) if block else "None"))
    # 数据脚本（部分模板把详情 JSON 塞在 script 里）
    for key in ("__NUXT__", "vod_plot_detail", "vod_content", "vod_play_list"):
        if key in dhtml:
            print("[detail-json] 命中 %s" % key)

    # --- 播放页 ---
    print("[play] 播放路由测试")
    ok_play = None
    for pl in plays[:1]:
        pu = urljoin(base + "/", pl)
        pp, pst = get(pu, base + dpath)
        hit = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", pp, re.S)
        print("   %s status=%s size=%s player_aaaa=%s" % (pu, pst, size(pp), bool(hit)))
        if hit:
            ok_play = (pu, hit.group(1))
            print("   raw: " + re.sub(r"\s+", " ", hit.group(1))[:520])
    if not ok_play:
        # 试通用式
        pu = "%s/index.php/vod/play/id/%s/sid/1/nid/1.html" % (base, did)
        pp, pst = get(pu, base + dpath)
        hit = re.search(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", pp, re.S)
        print("   [generic] %s status=%s player_aaaa=%s" % (pu, pst, bool(hit)))
        if hit:
            print("   raw: " + re.sub(r"\s+", " ", hit.group(1))[:520])

    # --- 搜索 ---
    print("[search] 搜索路由矩阵 (wd=天医)")
    kw = quote("天医")
    for p in ("/index.php/vod/search.html?wd=%s" % kw,
              "/index.php/vod/search/page/2/wd/%s.html" % kw,
              "/vodsearch/-------------.html?wd=%s" % kw,
              "/index.php/vod/search/wd/%s.html" % kw,
              "/index.php/vod/search.html?searchword=%s" % kw):
        s, stt = get(base + p, base + "/")
        n = len(set(re.findall(r"/vod/detail/id/\d+\.html", s))) if not s.startswith("__") else 0
        flag = "OK " if n > 0 else ".. "
        print("   %s %-52s status=%-5s size=%-7s items=%d" % (flag, p, stt, size(s), n))

for b in SITES:
    probe_site(b)

print("\nDONE")
