import json, ssl, urllib.request, urllib.error
from urllib.parse import quote
BASE="https://hongguoduanju.com"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
H={"User-Agent":UA,"Referer":BASE+"/","Accept":"text/html,*/*"}
C=ssl.create_default_context(); C.check_hostname=False; C.verify_mode=ssl.CERT_NONE

def rd(html):
    i=html.find("_ROUTER_DATA")
    if i<0: return None
    s=html.index("{",i); depth=0; instr=False; esc=False
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
            if depth==0: return json.loads(html[s:j+1])

for name in ["q","word","wd","k","keyword","query","search_query","searchWord","series_name","name","key","text"]:
    u="%s/search?%s=%s"%(BASE,name,quote("总裁"))
    try:
        html=urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=25,context=C).read().decode("utf-8","ignore")
        d=rd(html); sp=d["loaderData"]["search_page"]
        print("  %-14s -> query=%-10r totalCount=%-6s searchList=%d" % (
            name, sp.get("query"), sp.get("totalCount"), len(sp.get("searchList") or [])))
    except urllib.error.HTTPError as e:
        print("  %-14s -> HTTP %s"%(name,e.code))
    except Exception as e:
        print("  %-14s -> %s: %s"%(name,type(e).__name__,str(e)[:40]))
