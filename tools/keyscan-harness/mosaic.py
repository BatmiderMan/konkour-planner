import json,sys,numpy as np
from PIL import Image, ImageDraw
n=sys.argv[1]; start=int(sys.argv[2]) if len(sys.argv)>2 else 1
d=json.load(open(n+'.out.json')); W,H=d['W'],d['H']
g=np.fromfile(n+'.rgray',dtype=np.uint8).reshape(H,W)
h0=d['h0']
TW,TH=44,60
for lab in [1,2,3,4,0]:
    cs=[c for c in d['cells'] if c['lab']==lab and c['b']]
    if not cs: continue
    cols=14; rows=(len(cs)+cols-1)//cols
    im=Image.new('L',(cols*(TW+6),rows*(TH+16)),255); dr=ImageDraw.Draw(im)
    for k,c in enumerate(cs):
        x0,y0,x1,y1=c['b']; cx=(x0+x1)//2; cy=(y0+y1)//2
        hw=int(h0*0.8); hh=int(h0*1.05)
        crop=Image.fromarray(g[max(0,cy-hh):cy+hh,max(0,cx-hw):cx+hw]).resize((TW,TH))
        X=(k%cols)*(TW+6); Y=(k//cols)*(TH+16)
        im.paste(crop,(X,Y)); dr.rectangle([X,Y,X+TW-1,Y+TH-1],outline=0 if not c['low'] else 120)
        dr.text((X+2,Y+TH+1),str(start+c['i'])+('?' if c['low'] else ''),fill=0)
    im.save(f'{n}_m{lab}.png'); print(n,lab,len(cs),im.size)
