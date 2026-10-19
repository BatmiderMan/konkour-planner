import pickle, json, numpy as np, cv2, collections
from det5 import load3
d=pickle.load(open('num2.pkl','rb')); items=d['items']; a=d['assign']
M={n:(items[i]['p'],items[i]['y']) for i,n in a.items()}
M.update({380:(87,2912),428:(99,775),429:(99,1063),549:(117,3536)})
pages=collections.defaultdict(list)
for n,(p,y) in M.items(): pages[p].append((y,n))
def vmask(g):
    H,W=g.shape; seg=(g[int(H*0.25):int(H*0.85)]<190).mean(axis=0)
    m=seg>0.5
    # widen by 2px
    m2=m.copy(); m2[1:]|=m[:-1]; m2[:-1]|=m[1:]; return m2
def clean(g):
    g=g.copy(); g[:,vmask(g)]=255; return g
def footer_y(g):
    H,W=g.shape; rows=(np.abs(g.astype(int)-237)<=5).mean(axis=1)
    ys=[y for y in range(int(H*0.86),H) if rows[y]>0.8]
    return ys[0] if ys else int(H*0.905)
def bbox(c,pad=10):
    th=(c<130); ys=np.where(th.sum(axis=1)>=3)[0]; xs=np.where(th.sum(axis=0)>=2)[0]
    if len(ys)==0: return None
    return max(0,xs[0]-pad),max(0,ys[0]-pad),min(c.shape[1],xs[-1]+pad),min(c.shape[0],ys[-1]+pad)
def _bands(c,gapmin=6):
    rows=(c<170).sum(axis=1)>1; out=[]; s0=None
    for y,v in enumerate(rows):
        if v and s0 is None: s0=y
        if not v and s0 is not None:
            if out and s0-out[-1][1]<gapmin: out[-1][1]=y
            else: out.append([s0,y])
            s0=None
    if s0 is not None: out.append([s0,len(rows)])
    return out
def _longrun(row,th=170):
    best=cur=0
    for v in (row<th):
        cur=cur+1 if v else 0
        if cur>best: best=cur
    return best
def trim_tail(c,thr=70,minfirst=110):
    W=c.shape[1]; bs=_bands(c)
    # 1) lesson banner (a long horizontal rule) or 2) gray example box: the question ends before that band
    for k,(a0,b0) in enumerate(bs):
        if k==0: continue
        seg=c[a0:b0]
        has_rule=any(_longrun(seg[y])>=0.2*W for y in range(0,len(seg),2)) if b0-a0>=20 else False
        gray=((np.abs(c[a0:b0].astype(int)-237)<=5).mean(axis=1)>0.4).any() if b0-a0>=30 else False
        if (has_rule or gray) and a0>=60: return c[:max(a0-4,1)]
    rows=(c<170).sum(axis=1)>1; last=-1
    for y in range(len(rows)):
        if rows[y]:
            if last>=0 and y-last>=thr and last>=minfirst: return c[:last+10]
            last=y
    return c
def top_boundary(g,y,lo,thr=6,big=999,maxup=330):
    W=g.shape[1]; base=max(lo,y-maxup); seg=g[base:y,int(W*0.02):int(W*0.95)]<115
    rows=seg.sum(axis=1)>=4; n=len(rows); run=0; fallback=None
    for k in range(n-1,-1,-1):
        if not rows[k]:
            run+=1
            if run==thr and fallback is None: fallback=base+k+thr//2
            if run>=big: return base+k+run//2
        else:
            if run>=thr and fallback is not None and run<big:
                pass
            run=0
    return fallback if fallback is not None else base
crops={};info={}
for p,L in sorted(pages.items()):
    g=clean(load3(p)); L.sort(); H,W=g.shape; fy=footer_y(g)
    for k,(y,n) in enumerate(L):
        lo=(L[k-1][0]+60) if k>0 else (min(880,y-120))
        top=top_boundary(g,y,lo); lastp=(k+1==len(L))
        bot=(top_boundary(g,L[k+1][0],y+60)-2) if not lastp else fy-6
        c=g[top:bot,int(W*0.01):int(W*0.985)]
        if lastp: c=trim_tail(c)
        bb=bbox(c)
        if bb is None: continue
        x0,y0,x1,y1=bb; crops[n]=c[y0:y1,x0:x1]
        info[n]=dict(page=p,y=y,h=y1-y0,w=x1-x0,last=lastp)
pickle.dump((crops,info),open('crops3.pkl','wb'))
hs=[v['h'] for v in info.values()]
print(len(crops),'median',np.median(hs),'p95',np.percentile(hs,95),'max',max(hs))
print('tall',[(n,v['h']) for n,v in sorted(info.items()) if v['h']>520])
print('short',[(n,v['h']) for n,v in sorted(info.items()) if v['h']<100])
# continuation check: first marker of next page far below top, with ink above it
for n,v in sorted(info.items()):
    if v['last']:
        nn=n+1
        if nn in info and info[nn]['page']==v['page']+1:
            g=load3(info[nn]['page']); y1=info[nn]['y']
            reg=g[900:max(900,y1-40), int(g.shape[1]*0.02):int(g.shape[1]*0.98)]
            ink=int(((reg<170).sum(axis=1)>1).sum()) if reg.size else 0
            if ink>25: print('continuation?',n,'->',nn,'ink rows',ink,'region',reg.shape[0])
