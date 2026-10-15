import cv2, numpy as np
def find_boxes(i):
    g=cv2.imread(f'nat/{i:03d}.png',0)
    m=(np.abs(g.astype(int)-237)<=4).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(m,8)
    out=[]
    for k in range(1,n):
        x,y,w,h,a=st[k]
        if w>=520 and h>=45 and a>=0.55*w*h: out.append((int(x),int(y),int(w),int(h)))
    out.sort(key=lambda b:b[1]); return g,out
if __name__=='__main__':
    tot=0
    for i in range(6,118):
        g,b=find_boxes(i); tot+=len(b); print(i,len(b),end=' | ')
    print('\nTOTAL boxes',tot)
