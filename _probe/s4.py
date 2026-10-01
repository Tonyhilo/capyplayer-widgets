import json,ssl,urllib.request,urllib.parse
UB="https://hongguoduanju.com"
H={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","Referer":UB+"/","Accept":"text/html,*/*"}
C=ssl.create_default_context();C.check_hostname=False;C.verify_mode=ssl.CERT_NONE
def rd(h):
    i=h.find("_ROUTER_DATA");s=h.index("{",i);d=0;q=False;e=False
    for j in range(s,len(h)):
        c=h[j]
        if q:
            if e:e=False
            elif c=="\\":e=True
            elif c=='"':q=False
            continue
        if c=='"':q=True
        elif c=="{":d+=1
        elif c=="}":
            d-=1
            if d==0:return json.loads(h[s:j+1])
def go(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=25,context=C).read().decode("utf-8","ignore")

h=go(UB+"/search/"+urllib.parse.quote("总裁"))
sp=[v for v in rd(h)["loaderData"].values() if isinstance(v,dict) and "searchList" in v][0]
item=sp["searchList"][0]
print("=== 搜索结果条目结构 ===")
print(json.dumps(item, ensure_ascii=False)[:1200])
print("\n=== video_data 内字段 ===")
vd=item.get("video_data") or item
print(json.dumps(vd, ensure_ascii=False)[:900])

# 换一部剧看 recommendations
h2=go(UB+"/detail?series_id=7688177952311233598")
dp=rd(h2)["loaderData"]["detail_page"]
print("\n=== 另一部剧 detail_page ===")
print("recommendations 条数:", len(dp.get("recommendations") or []))
if dp.get("recommendations"):
    print("样例:", json.dumps(dp["recommendations"][0], ensure_ascii=False)[:500])
sd=dp["seriesDetail"]
print("\nseriesDetail.celebrities[0]:", json.dumps((sd.get("celebrities") or [{}])[0], ensure_ascii=False)[:300])
print("seriesDetail.series_episode_info:", json.dumps(sd.get("series_episode_info"), ensure_ascii=False)[:300])
