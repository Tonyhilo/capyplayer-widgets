import json, ssl, re, urllib.request
from urllib.parse import quote
BASE="https://hongguoduanju.com"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
H={"User-Agent":UA,"Referer":BASE+"/","Accept":"text/html,*/*"}
C=ssl.create_default_context(); C.check_hostname=False; C.verify_mode=ssl.CERT_NONE
req=urllib.request.Request(BASE+"/search?query="+quote("总裁"),headers=H)
html=urllib.request.urlopen(req,timeout=25,context=C).read().decode("utf-8","ignore")
i=html.find("_ROUTER_DATA"); s=html.index("{",i); depth=0; instr=False; esc=False
for j in range(s,len(html)):
    c=html[j]
    if instr:
        if esc: esc=False
        elif c=="\\": esc=True
        elif c=='"': instr=False
        continue
    if c=='"': instr=True
    elif c=="{": depth+=1
    elif c=="}":
        depth-=1
        if depth==0: d=json.loads(html[s:j+1]); break
sp=d["loaderData"]["search_page"]
print("search_page keys:", list(sp.keys()))
print(json.dumps({k:v for k,v in sp.items() if not isinstance(v,(list,dict))}, ensure_ascii=False)[:600])
for k,v in sp.items():
    if isinstance(v,dict): print("  dict[%s] keys:"%k, list(v.keys())[:20])
    if isinstance(v,list): print("  list[%s] len=%d"%(k,len(v)))
# 找 JS 里的搜索接口
print("\n=== 页面内出现的 API 路径 ===")
for pat in re.findall(r'["\'](/[a-zA-Z0-9_\-/]*(?:search|api)[a-zA-Z0-9_\-/]*)["\']', html):
    print("  ", pat)
