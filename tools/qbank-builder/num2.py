import json, numpy as np, collections, pickle
from det5 import page5
from boxes import find_boxes
import dp
from digits import feat
pages=list(range(14,20))+list(range(21,118))
items=[]  # (page, y, E, comps, gray-ref)
G={}
for p in pages:
    g,o=page5(p)
    if not o: continue
    G[p]=g
    B=[]
    if p>=20:
        _,B=find_boxes(p); B=[b for b in B if b[0]>0 and b[1]<1250 and b[2]<715]
    for d,R,E in o:
        if p>=20 and any((b[1]-4)*3<=d[1]<=(b[1]+b[3]+4)*3 for b in B): continue
        items.append(dict(p=p,y=int(d[1]),E=int(E),R=[tuple(int(v) for v in c) for c in R],dash=tuple(int(v) for v in d)))
print('items',len(items))
F=[[feat(G[it['p']],c) for c in it['R']] for it in items]
M0={int(k):tuple(v) for k,v in json.load(open('markers_final.json')).items()}
# initial labels from old table
lab={}
for n,(p,y) in M0.items():
    for i,it in enumerate(items):
        if it['p']==p and abs(it['y']-y)<=12: lab[i]=n
def train(lab):
    X=[];Y=[]
    for i,n in lab.items():
        s=str(n)
        if len(F[i])==len(s):
            for f,ch in zip(F[i],s): X.append(f);Y.append(ch)
    return np.array(X),np.array(Y)
def classify(i,X,Y,k=5):
    out=''
    for f in F[i]:
        d=np.linalg.norm(X-f,axis=1); idx=np.argsort(d)[:k]; v={}
        for j in idx: v[Y[j]]=v.get(Y[j],0)+1/(1+d[j])
        out+=max(v,key=v.get)
    return out
def mcost2(read,n):
    s=str(n)
    if not read: return 0.9
    if len(read)==len(s): return 0.45*sum(a!=b for a,b in zip(read,s))
    return 1.1
dp.mcost=lambda o,n: mcost2(o,n)
for it in range(3):
    X,Y=train(lab); reads=[classify(i,X,Y) for i in range(len(items))]
    a,fp,miss,cost=dp.align(reads,1,549,1.0,0.9)
    lab=dict(a)
    print('iter',it,'cost',round(cost,1),'assigned',len(a),'exact',sum(reads[i]==str(n) for i,n in a.items()),'fp',len(fp),'missing',miss)
pickle.dump(dict(items=items,reads=reads,assign=a,fp=fp,miss=miss),open('num2.pkl','wb'))
