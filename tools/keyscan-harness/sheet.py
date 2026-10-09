import json,sys,numpy as np
from PIL import Image, ImageDraw
n=sys.argv[1]; start=int(sys.argv[2])
d=json.load(open(n+'.out.json')); W,H=d['W'],d['H']
g=np.fromfile(n+'.rgray',dtype=np.uint8).reshape(H,W); h0=d['h0']
TW,TH=36,50; cols=19
for part,labs in (('a',[1,2]),('b',[3,4])):
    blocks=[]
    for lab in labs:
        cs=[c for c in d['cells'] if c['lab']==lab and c['b']]
        rows=(len(cs)+cols-1)//cols
        im=Image.new('L',(cols*(TW+2),rows*(TH+10)+14),255); dr=ImageDraw.Draw(im); dr.text((2,1),f'class {lab}  n={len(cs)}',fill=0)
        for k,c in enumerate(cs):
            x0,y0,x1,y1=c['b']; cx=(x0+x1)//2; cy=(y0+y1)//2; hw=int(h0*.75); hh=int(h0*1.0)
            t=Image.fromarray(g[max(0,cy-hh):cy+hh,max(0,cx-hw):cx+hw]).resize((TW,TH))
            X=(k%cols)*(TW+2); Y=14+(k//cols)*(TH+10); im.paste(t,(X,Y))
            if c['low']: dr.rectangle([X,Y,X+TW-1,Y+TH-1],outline=0)
            dr.text((X,Y+TH),str(start+c['i'])[-4:],fill=0)
        blocks.append(im)
    Hh=sum(b.size[1] for b in blocks); S=Image.new('L',(blocks[0].size[0],Hh),255); y=0
    for b in blocks: S.paste(b,(0,y)); y+=b.size[1]
    S.save(f'{n}_s{part}.png'); print(n,part,S.size)
