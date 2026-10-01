# -*- coding: utf-8 -*-
"""最后一轮：1) 网页搜索路径式接口  2) App 取流的加密结构"""
import hashlib, json, ssl, time, urllib.parse, urllib.request, urllib.error

UBASE = "https://hongguoduanju.com"
UAW = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
HW = {"User-Agent": UAW, "Referer": UBASE + "/", "Accept": "text/html,*/*"}
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


print("=" * 60)
print("1. 网页搜索 路径式 /search/<keyword>")
print("=" * 60)
for kw in ("总裁", "逆袭"):
    u = UBASE + "/search/" + urllib.parse.quote(kw)
    try:
        html = urllib.request.urlopen(urllib.request.Request(u, headers=HW), timeout=25, context=C).read().decode("utf-8", "ignore")
        d = rd(html)
        ld = d["loaderData"]
        layer = None
        for k in ld:
            if "search" in k and isinstance(ld[k], dict) and "searchList" in ld[k]:
                layer = ld[k]; key = k; break
        if layer is None:
            print("  %s -> loaderData keys=%s（无 searchList）" % (kw, list(ld.keys())))
            continue
        rows = layer.get("searchList") or []
        print("  %-6s -> 层=%s query=%r totalCount=%s 结果=%d" % (
            kw, key, layer.get("query"), layer.get("totalCount"), len(rows)))
        if rows:
            r0 = rows[0]
            vd = r0.get("video_data") or r0
            print("         首条: %s | id=%s | 总集=%s | 可播=%s" % (
                vd.get("series_name"), vd.get("series_id_str") or vd.get("series_id"),
                vd.get("episode_cnt"), vd.get("accessible_episode_cnt")))
    except urllib.error.HTTPError as e:
        print("  %s -> HTTP %s" % (kw, e.code))
    except Exception as e:
        print("  %s -> %s: %s" % (kw, type(e).__name__, str(e)[:60]))

# ---------- 2. App 取流 ----------
print()
print("=" * 60)
print("2. App 取流接口返回的加密结构")
print("=" * 60)
BASE = "https://api5-normal-sinfonlineb.fqnovel.com"
UAA = ("com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; "
       "Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)")
KEY = [0x44, 0xb9, 0xb9, 0xd9, 0xa4, 0xae, 0xf9, 0xfc, 0xa4, 0x93,
       0xaa, 0x75, 0x7c, 0xa3, 0xc2, 0xc4, 0xa4, 0x96, 0x93, 0x8f]


def sign(raw_query, body, ts):
    p = bytearray(20)
    p[0:4] = hashlib.md5(raw_query.encode()).digest()[:4]
    stub = None
    if body is not None:
        bh = hashlib.md5(body).digest(); p[4:8] = bh[:4]; stub = bh.hex().upper()
    p[12:16] = bytes([0, 6, 11, 28]); p[16:20] = ts.to_bytes(4, "big")
    for i in range(20): p[i] ^= KEY[i]
    for i in range(20):
        m = (((p[i] << 4) | (p[i] >> 4)) & 0xFF) ^ p[(i + 1) % 20]
        r = int('{:08b}'.format(m)[::-1], 2)
        p[i] = r ^ 0xFF ^ 20
    return (bytes([0x84, 0x04, 0x40, 0x1C, 0, 0]) + bytes(p)).hex(), stub


import random
DID = str(10 ** 18 + random.randrange(8 * 10 ** 18))
IID = str(10 ** 18 + random.randrange(8 * 10 ** 18))


def app_call(path, payload):
    ts = int(time.time()); body = json.dumps(payload, separators=(",", ":")).encode()
    q = {"aid": "8662", "app_name": "novelread", "version_code": "73532", "version_name": "7.3.5.32",
         "manifest_version_code": "73532", "update_version_code": "73532", "channel": "update_64",
         "device_platform": "android", "os": "android", "ssmix": "a", "device_type": "25053RT47C",
         "device_brand": "Redmi", "language": "zh", "os_api": "36", "os_version": "16",
         "resolution": "1280*2772", "dpi": "520", "ac": "wifi", "device_id": DID, "iid": IID}
    q["_rticket"] = str(int(time.time() * 1000))
    rq = urllib.parse.urlencode(sorted(q.items()))
    g, stub = sign(rq, body, ts)
    h = {"User-Agent": UAA, "Accept": "application/json", "X-XS-From-Web": "0", "Sdk-Version": "2",
         "Content-Type": "application/json; charset=utf-8", "X-Khronos": str(ts), "X-Gorgon": g,
         "X-SS-Req-Ticket": str(int(time.time() * 1000)), "X-SS-STUB": stub}
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path + "?" + rq, data=body, headers=h, method="POST"),
                                    timeout=25, context=C) as r:
            return r.status, json.loads(r.read().decode("utf-8", "ignore"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return "ERR", "%s %s" % (type(e).__name__, str(e)[:80])


st, res = app_call("/novel/player/video_model/v1/", {
    "video_id": "7687921187195735102", "content_type": 1,
    "biz_param": {"need_all_video_definition": True, "video_platform": 3}})
print("HTTP", st)
if isinstance(res, dict):
    vm = res.get("data", {}).get("video_model")
    if isinstance(vm, str):
        vm = json.loads(vm)
    vl = (vm or {}).get("video_list") or []
    print("video_list 条数:", len(vl))
    for v in vl[:6]:
        meta = v.get("video_meta") or {}
        enc = v.get("encrypt_info") or {}
        print("  - definition=%-6s codec=%-10s size=%sx%s  encrypt=%s method=%s spade_a=%s" % (
            meta.get("definition"), meta.get("codec_type"), meta.get("vwidth"), meta.get("vheight"),
            enc.get("encrypt"), enc.get("encryption_method"),
            (str(enc.get("spade_a"))[:24] + "...") if enc.get("spade_a") else None))
        mu = v.get("main_url")
        print("      main_url host=%s" % (urllib.parse.urlparse(mu).netloc if mu else None))
    # 拿最高清非 bytevc2 的直链，检查是否明文
    cand = [v for v in vl if "bytevc2" not in str((v.get("video_meta") or {}).get("codec_type", "")).lower()]
    if cand:
        u = cand[0].get("main_url")
        print("\n  抽样直链:", u[:110], "...")
        try:
            rq2 = urllib.request.Request(u, headers={"User-Agent": UAA, "Range": "bytes=0-63"})
            with urllib.request.urlopen(rq2, timeout=25, context=C) as r:
                b = r.read(64)
                print("  直链 HTTP", r.status, r.headers.get("Content-Type"), r.headers.get("Content-Length"))
                print("  首48字节 hex:", b[:48].hex())
        except Exception as e:
            print("  直链探测:", type(e).__name__, str(e)[:80])
else:
    print(res)
