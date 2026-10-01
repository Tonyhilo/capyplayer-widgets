# -*- coding: utf-8 -*-
"""验证红果 App 接口的 X-Gorgon 纯算法签名是否可离线复现"""
import hashlib, json, ssl, time, urllib.parse, urllib.request, urllib.error

BASE = "https://api5-normal-sinfonlineb.fqnovel.com"
UA = ("com.phoenix.read/73532 (Linux; U; Android 16; zh_CN; 25053RT47C; "
      "Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 "
      "QuicVersion:c67e9834 2025-09-08)")
KEY = [0x44, 0xb9, 0xb9, 0xd9, 0xa4, 0xae, 0xf9, 0xfc, 0xa4, 0x93,
       0xaa, 0x75, 0x7c, 0xa3, 0xc2, 0xc4, 0xa4, 0x96, 0x93, 0x8f]


def rotl8(v, n):
    return ((v << n) | (v >> (8 - n))) & 0xFF


def rev8(v):
    r = 0
    for i in range(8):
        if v & (1 << i):
            r |= 1 << (7 - i)
    return r


def sign(raw_query: str, body: bytes | None, ts: int):
    qh = hashlib.md5(raw_query.encode()).digest()
    payload = bytearray(20)
    payload[0:4] = qh[:4]
    stub = None
    if body is not None:
        bh = hashlib.md5(body).digest()
        payload[4:8] = bh[:4]
        stub = bh.hex().upper()
    payload[12:16] = bytes([0, 6, 11, 28])
    payload[16:20] = ts.to_bytes(4, "big")
    for i in range(20):
        payload[i] ^= KEY[i]
    for i in range(20):
        mixed = rotl8(payload[i], 4) ^ payload[(i + 1) % 20]
        payload[i] = rev8(mixed) ^ 0xFF ^ 20
    sig = bytes([0x84, 0x04, 0x40, 0x1C, 0, 0]) + bytes(payload)
    return sig.hex(), stub


def device_ids():
    import random
    return (str(10 ** 18 + random.randrange(8 * 10 ** 18)),
            str(10 ** 18 + random.randrange(8 * 10 ** 18)))


DEVICE_ID, INSTALL_ID = device_ids()


def call(path, payload):
    ts = int(time.time())
    body = json.dumps(payload, separators=(",", ":")).encode()
    q = {
        "aid": "8662", "app_name": "novelread", "version_code": "73532",
        "version_name": "7.3.5.32", "manifest_version_code": "73532",
        "update_version_code": "73532", "channel": "update_64",
        "device_platform": "android", "os": "android", "ssmix": "a",
        "device_type": "25053RT47C", "device_brand": "Redmi", "language": "zh",
        "os_api": "36", "os_version": "16", "resolution": "1280*2772",
        "dpi": "520", "ac": "wifi", "device_id": DEVICE_ID, "iid": INSTALL_ID,
    }
    q["_rticket"] = str(int(time.time() * 1000))
    raw_query = urllib.parse.urlencode(sorted(q.items()))
    gorgon, stub = sign(raw_query, body, ts)
    headers = {
        "User-Agent": UA, "Accept": "application/json", "X-XS-From-Web": "0",
        "Sdk-Version": "2", "Content-Type": "application/json; charset=utf-8",
        "X-Khronos": str(ts), "X-Gorgon": gorgon, "X-SS-Req-Ticket": str(int(time.time() * 1000)),
        "X-SS-STUB": stub,
    }
    url = BASE + path + "?" + raw_query
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            txt = r.read().decode("utf-8", "ignore")
            return r.status, txt
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:400]
    except Exception as e:
        return "ERR", "%s: %s" % (type(e).__name__, str(e)[:120])


print("device_id =", DEVICE_ID, "| iid =", INSTALL_ID)
print()
print("=== A. 详情接口 /novel/player/video_detail/v1/ ===")
st, txt = call("/novel/player/video_detail/v1/", {"series_id": "7687919221593885758"})
print("HTTP", st)
print(txt[:700])

print()
print("=== B. 取流接口 /novel/player/video_model/v1/ ===")
st, txt = call("/novel/player/video_model/v1/", {
    "video_id": "7687921187195735102", "content_type": 1,
    "biz_param": {"need_all_video_definition": True, "video_platform": 3}})
print("HTTP", st)
print(txt[:700])
