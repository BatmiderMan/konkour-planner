import json, sys
def mcost(ocr,n):
    s=str(n)
    if not ocr: return 0.8
    if ocr==s: return 0.0
    if ocr[-1]==s[-1] and (len(ocr)==1 or len(ocr)>=1): return 0.45 if ocr[-1:]==s[-1:] and (ocr in s or s.endswith(ocr)) else 0.6
    if s.endswith(ocr) or ocr in s: return 0.5
    return 1.4
def align(ocrs,first,last,skip_c=1.2,skip_n=0.9):
    K=len(ocrs); N=last-first+1; INF=1e9
    dp=[[INF]*(N+1) for _ in range(K+1)]; bk=[[None]*(N+1) for _ in range(K+1)]
    dp[0][0]=0
    for i in range(K+1):
        for j in range(N+1):
            c=dp[i][j]
            if c>=INF: continue
            if i<K and j<N:
                v=c+mcost(ocrs[i],first+j)
                if v<dp[i+1][j+1]: dp[i+1][j+1]=v; bk[i+1][j+1]=('m',i,j)
            if i<K:
                v=c+skip_c
                if v<dp[i+1][j]: dp[i+1][j]=v; bk[i+1][j]=('c',i,j)
            if j<N:
                v=c+skip_n
                if v<dp[i][j+1]: dp[i][j+1]=v; bk[i][j+1]=('n',i,j)
    i,j=K,N; assign={}; fp=[]; missing=[]
    while (i,j)!=(0,0):
        t,pi,pj=bk[i][j]
        if t=='m': assign[pi]=first+pj
        elif t=='c': fp.append(pi)
        else: missing.append(first+pj)
        i,j=pi,pj
    return assign,sorted(fp),sorted(missing),dp[K][N]
if __name__=='__main__':
    items=json.load(open('items_B.json'))
    a,fp,miss,cost=align([x[3] for x in items],55,563)
    print('cost',cost,'FP',len(fp),'missing',len(miss)); print('missing numbers',miss); print('fp items',[(items[i][0],items[i][1],items[i][3]) for i in fp])
