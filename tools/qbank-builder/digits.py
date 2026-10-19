import json, cv2, numpy as np
from det3 import page, comps
from dp import align
def marker_digits(g,m):
    dx,dy,dw,dh,right=m
    C=comps(g)
    cand=[c for c in C if 16<=c[3]<=36 and c[2]<=34 and right-3<=c[0]<=right+110 and abs((c[1]+c[3]/2)-(dy+dh/2))<=c[3]*0.65+6]
    cand.sort(key=lambda c:c[0])
    # keep contiguous run starting at the dash: gaps <14px
    out=[]; last=right
    for c in cand:
        if c[0]-last>14: break
        out.append(c); last=c[0]+c[2]
    return out
def feat(g,c):
    x,y,w,h,a=c; t=g[y:y+h,x:x+w]
    t=cv2.resize(t,(14,20),interpolation=cv2.INTER_AREA).astype(np.float32)
    t=(t-t.min())/(t.max()-t.min()+1e-6); t=1-t
    return np.concatenate([t.ravel(),[w/h*3]])
