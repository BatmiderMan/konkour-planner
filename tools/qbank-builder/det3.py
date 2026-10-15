import cv2, numpy as np, collections
def comps(g,c=12):
    th=cv2.adaptiveThreshold(g,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,41,c)
    n,lab,st,cen=cv2.connectedComponentsWithStats(th,8)
    return [tuple(int(v) for v in st[k]) for k in range(1,n)]
def markers2(g):
    C=comps(g); H,W=g.shape
    dash=[c for c in C if 9<=c[2]<=30 and 2<=c[3]<=9 and c[2]/c[3]>=2.0 and c[0]>W*0.6]
    out=[]
    for dx,dy,dw,dh,da in dash:
        dig=[c for c in C if 16<=c[3]<=36 and c[2]<=32 and dx+dw-3<=c[0]<=dx+dw+16 and abs((c[1]+c[3]/2)-(dy+dh/2))<=c[3]*0.65+4]
        if dig: out.append((dx,dy,dw,dh,dx+dw))
    return out
def page(i):
    g=cv2.imread(f'nat/{i:03d}.png',0); s=2160/g.shape[1]
    g=cv2.resize(g,None,fx=s,fy=s,interpolation=cv2.INTER_AREA if s<1 else cv2.INTER_CUBIC)
    M=markers2(g)
    if not M: return g,[]
    c=collections.Counter([m[4]//8*8 for m in M]); mode,_=c.most_common(1)[0]
    sel=sorted([m for m in M if abs(m[4]-mode-4)<=12],key=lambda m:m[1]); out=[]
    for m in sel:
        if out and m[1]-out[-1][1]<60: continue
        out.append(m)
    return g,out
if __name__=='__main__':
    for i in range(14,21):
        g,m=page(i); print(i,len(m),[x[1] for x in m])
