import cv2, numpy as np, collections
from det3 import comps
def load3(i):
    g=cv2.imread(f'nat/{i:03d}.png',0); s=2160/g.shape[1]
    return cv2.resize(g,None,fx=s,fy=s,interpolation=cv2.INTER_AREA if s<1 else cv2.INTER_CUBIC)
def cands(g):
    C=comps(g,10); H,W=g.shape; out=[]
    for dx,dy,dw,dh,da in C:
        if not (9<=dw<=30 and 2<=dh<=9 and dw/dh>=2.0 and dx+dw>W*0.55): continue
        cy=dy+dh/2
        run=[c for c in C if c[0]>=dx+dw-3 and c[0]<=dx+dw+110 and 8<=c[3]<=36 and c[2]<=34 and abs((c[1]+c[3]/2)-cy)<=24]
        run.sort(key=lambda c:c[0]); R=[]; last=dx+dw
        for c in run:
            if c[0]-last>16: break
            R.append(c); last=c[0]+c[2]
        if not R or max(c[3] for c in R)<18: continue
        out.append(((dx,dy,dw,dh),R,R[-1][0]+R[-1][2]))
    return out
def page5(i):
    g=load3(i); cs=cands(g); W=g.shape[1]
    cs=[c for c in cs if W*0.88<=c[2]<=W*0.975]
    if not cs: return g,[]
    mode=collections.Counter([c[2]//5*5 for c in cs]).most_common(1)[0][0]
    sel=sorted([c for c in cs if abs(c[2]-mode-2)<=9],key=lambda c:c[0][1]); out=[]
    for c in sel:
        if out and c[0][1]-out[-1][0][1]<60: continue
        out.append(c)
    return g,out
if __name__=='__main__':
    tot=0; per={}
    for i in list(range(14,20))+list(range(21,118)):
        g,o=page5(i); per[i]=len(o); tot+=len(o)
    print(tot); print({i:n for i,n in per.items() if n>=1})
