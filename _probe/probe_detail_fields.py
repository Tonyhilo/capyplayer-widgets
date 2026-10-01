# -*- coding: utf-8 -*-
"""duanju55 详情页字段提取点 + 列表卡片完整结构"""
import re, ssl, urllib.request, urllib.error, json
C = ssl.create_default_context(); C.check_hostname = False; C.verify_mode = ssl.CERT_NONE
OP = urllib.request.build_opener(urllib.request.HTTPSHandler(context=C))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

def get(url, ref=None):
    h = {"User-Agent": UA, "Referer": ref or url, "Accept": "*/*"}
    try:
        with OP.open(urllib.request.Request(url, headers=h), timeout=25) as r:
            return r.read().decode("utf-8", "ignore")
    except Exception as e:
        return "__ERR_%s__" % type(e).__name__

B = "https://www.duanju55.com"
def sec(t): print("\n" + "=" * 74); print(t); print("=" * 74)

# ---------------- 1. 列表卡片完整上下文 ----------------
sec("1. 列表页：详情链接前后 900 字原始上下文")
lst = get(B + "/index.php/vod/type/id/1.html", B + "/")
i = lst.find("/vod/detail/id/")
print(lst[max(0, i - 500):i + 700])

# ---------------- 2. 详情页字段点 ----------------
sec("2. 详情页：meta / h1 / 元数据")
det = get(B + "/index.php/vod/detail/id/53848.html", B + "/")
print("size=%d" % len(det))
for pat, lbl in [
    (r'<meta[^>]*(?:property|name)="og:title"[^>]*>', "og:title"),
    (r'<meta[^>]*(?:property|name)="og:image"[^>]*>', "og:image"),
    (r'<meta[^>]*(?:property|name)="og:description"[^>]*>', "og:description"),
    (r'<meta\s+name="description"[^>]*>', "description"),
    (r'<meta\s+name="keywords"[^>]*>', "keywords"),
    (r"<h1[^>]*>.*?</h1>", "h1"),
    (r'<meta[^>]*property="og:type"[^>]*>', "og:type"),
]:
    m = re.search(pat, det, re.S)
    print("  %-16s : %s" % (lbl, re.sub(r"\s+", " ", m.group(0))[:200] if m else "None"))

sec("3. 详情页：结构化数据 / 详情区块")
for k in ("application/ld+json", "stui-content__detail", "vod_actor", "vod_director",
          "vod_class", "vod_year", "vod_area", "vod_remarks", "content__playlist",
          "playlist", "data-original", "lazyload"):
    print("  %-26s : %s" % (k, k in det))

m = re.search(r'(<div[^>]*class="[^"]*stui-content__detail[^"]*"[^>]*>[\s\S]{0,2200})', det)
if m:
    print("\n[stui-content__detail 片段]")
    print(re.sub(r"\s+", " ", m.group(1))[:1800])

m = re.search(r'(<ul[^>]*class="[^"]*(?:playlist|playList|play-list)[^"]*"[^>]*>[\s\S]{0,1400})', det)
if m:
    print("\n[playlist 片段]")
    print(re.sub(r"\s+", " ", m.group(1))[:1400])

# ---------------- 4. 详情页里所有 script 变量 ----------------
sec("4. 详情页 script 变量名扫描")
for v in sorted(set(re.findall(r'\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=', det))):
    print("   ", v)
print("  含 __NUXT__:", "__NUXT__" in det, "| 含 ld+json:", "ld+json" in det)

# ---------------- 5. 搜索页条目结构 ----------------
sec("5. 搜索页条目结构")
s = get(B + "/index.php/vod/search.html?wd=%E5%A4%A9%E5%8C%BB", B + "/")
i = s.find("/vod/detail/id/")
print(s[max(0, i - 400):i + 700])

print("\nDONE")
