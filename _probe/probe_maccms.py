# -*- coding: utf-8 -*-
"""验证苹果CMS 通用解析法：首页 -> 详情 -> 播放页 -> player_aaaa"""
import re, ssl, urllib.request, urllib.error
from urllib.parse import urljoin

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE


def get(url, base=None):
    h = {"User-Agent": UA, "Referer": base or url}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h),
                                    timeout=25, context=C) as r:
            return r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return "__HTTP_%s__" % e.code
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__


PLAYER_RE = re.compile(r"player_aaaa\s*=\s*(\{.*?\})\s*</script>", re.S)
URL_RE = re.compile(r'"url"\s*:\s*"([^"]+)"')
EP_RE = re.compile(r'href="([^"]*(?:/vod/)?(?:play|vodplay|drama-play)[^"]*)"', re.I)
DETAIL_RE = re.compile(r'href="([^"]*/index\.php/vod/(?:detail|play)|[^"]*/(?:detail|vod|show)/[^"]*)"', re.I)


def survey(name, base):
    print("\n" + "=" * 68)
    print("%s  %s" % (name, base))
    print("=" * 68)
    home = get(base + "/")
    if home.startswith("__"):
        print("  首页拉取失败:", home); return
    print("  首页大小: %d B  | 含 player_aaaa: %s | 苹果CMS 标记: %s" % (
        len(home), "player_aaaa" in home,
        bool(re.search(r"maccms|苹果cms", home, re.I))))

    # 找详情页
    links = [urljoin(base + "/", m) for m in DETAIL_RE.findall(home)]
    links = [u for u in dict.fromkeys(links) if base.split("//")[1].split("/")[0] in u]
    print("  首页发现详情页链接: %d 个" % len(links))
    if not links:
        print("  （首页无详情链接，跳过）"); return

    detail = get(links[0], base + "/")
    if detail.startswith("__"):
        print("  详情页拉取失败:", detail); return
    print("  详情页: %s  (%d B)" % (links[0], len(detail)))

    # 详情页找播放链接
    plays = [urljoin(links[0], m) for m in EP_RE.findall(detail)]
    plays = [u for u in dict.fromkeys(plays) if u.startswith("http")]
    print("  详情页发现播放链接: %d 个" % len(plays))
    if plays:
        print("    样例:", plays[0][:100])

    target = plays[0] if plays else links[0]
    page = get(target, links[0])
    if page.startswith("__"):
        print("  播放页拉取失败:", page); return

    m = PLAYER_RE.search(page)
    print("  播放页 %s" % target[:80])
    print("  找到 player_aaaa: %s" % bool(m))
    if m:
        raw = m.group(1)
        u = URL_RE.search(raw)
        print("  player_aaaa 长度: %d B" % len(raw))
        if u:
            print("  ★ 播放地址(MacCMS 通用字段): %s" % u.group(1)[:160])
        else:
            print("  player_aaaa 内容片段:", raw[:200])


for n, b in [
    ("五五", "https://www.duanju55.com"),
    ("168", "https://www.xzyx168.com"),
]:
    survey(n, b)
