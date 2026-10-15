// @ts-nocheck
/* keyScan.ts
   SCANNING ENGINE — copied verbatim from Pasokhbarg_Checker_v7.html by script (extract_engine.py), not rewritten.
   Original lines 476-826: the layout-free reader for printed answer-key lists (KeyScan 4).
   Only addition: the export on the last line.
 */
/* ---------- reading keys from a photo of the book page ---------- */
/* KeyScan 4: layout-free reader for printed answer-key lists.
   Idea: find every digit-sized glyph, group touching glyphs into "elements" (1 glyph = option digit, 2+ = question number),
   pair each option digit with its question number, order the pairs column by column, then cluster the option digits
   into 4 shapes (the book's own font) and name the clusters 1-4. Nothing is tied to one book's grid or template. */
const KeyScan: any = (function(root){
"use strict";
var GX=12,GY=16;

function sauvola(g,w,h,win,k){
  var W1=w+1,I=new Float64Array(W1*(h+1)),Q=new Float64Array(W1*(h+1)),x,y;
  for(y=0;y<h;y++){var rs=0,rq=0;for(x=0;x<w;x++){var v=g[y*w+x];rs+=v;rq+=v*v;I[(y+1)*W1+x+1]=I[y*W1+x+1]+rs;Q[(y+1)*W1+x+1]=Q[y*W1+x+1]+rq}}
  var r=win>>1,ink=new Uint8Array(w*h);
  for(y=0;y<h;y++){var y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
    for(x=0;x<w;x++){var x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),n=(x1-x0)*(y1-y0);
      var s=I[y1*W1+x1]-I[y0*W1+x1]-I[y1*W1+x0]+I[y0*W1+x0],q=Q[y1*W1+x1]-Q[y0*W1+x1]-Q[y1*W1+x0]+Q[y0*W1+x0];
      var m=s/n,sd=Math.sqrt(Math.max(0,q/n-m*m));
      ink[y*w+x]=g[y*w+x]<m*(1+k*(sd/128-1))-4?1:0}}
  return ink;
}
function label(ink,w,h){ // 8-connected components -> bbox, area, pixel indices
  var lab=new Int32Array(w*h),out=[],st=[];
  for(var i0=0;i0<w*h;i0++){
    if(!ink[i0]||lab[i0])continue;
    var id=out.length+1,c={x0:w,x1:-1,y0:h,y1:-1,n:0,px:[]};lab[i0]=id;st.push(i0);
    while(st.length){var p=st.pop(),x=p%w,y=(p/w)|0;c.n++;c.px.push(p);
      if(x<c.x0)c.x0=x;if(x>c.x1)c.x1=x;if(y<c.y0)c.y0=y;if(y>c.y1)c.y1=y;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=w||ny>=h)continue;var q=ny*w+nx;if(ink[q]&&!lab[q]){lab[q]=id;st.push(q)}}}
    c.w=c.x1-c.x0+1;c.h=c.y1-c.y0+1;out.push(c);
  }
  return out;
}
function median(a){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y});return b[b.length>>1]}
function holes(c,w){ // number of enclosed background regions inside a glyph
  var bw=c.w+2,bh=c.h+2,m=new Uint8Array(bw*bh),i,n=0;
  for(i=0;i<c.px.length;i++){var p=c.px[i];m[(((p/w)|0)-c.y0+1)*bw+(p%w)-c.x0+1]=1}
  var st=[0];m[0]=2;
  while(st.length){var q=st.pop(),x=q%bw,y=(q/bw)|0;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=x+d[0],ny=y+d[1];if(nx<0||ny<0||nx>=bw||ny>=bh)return;var k=ny*bw+nx;if(!m[k]){m[k]=2;st.push(k)}})}
  for(i=0;i<m.length;i++)if(m[i]===0){n++;var s2=[i];m[i]=3;var area=0;
    while(s2.length){var q2=s2.pop(),x2=q2%bw,y2=(q2/bw)|0;area++;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=x2+d[0],ny=y2+d[1];var k=ny*bw+nx;if(m[k]===0){m[k]=3;s2.push(k)}})}
    if(area<3)n--;}
  return n;
}
function feat(c,w,cs,sn,gray,H){ // shape vector: grey-level patch of the glyph box, sampled in the de-skewed frame
  var i,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(i=0;i<c.px.length;i+=1){var p=c.px[i],x=p%w,y=(p/w)|0,u=x*cs+y*sn,v=y*cs-x*sn;
    if(u<x0)x0=u;if(u>x1)x1=u;if(v<y0)y0=v;if(v>y1)y1=v}
  var bw=Math.max(1,x1-x0+1),bh=Math.max(1,y1-y0+1),f=new Float32Array(GX*GY+2),mn=255,mx=0;
  x0-=.5;y0-=.5;
  function samp(u,v){var X=u*cs-v*sn,Y=v*cs+u*sn;X=Math.max(0,Math.min(w-1.01,X));Y=Math.max(0,Math.min(H-1.01,Y));
    var xi=X|0,yi=Y|0,fx=X-xi,fy=Y-yi,k=yi*w+xi;
    return gray[k]*(1-fx)*(1-fy)+gray[k+1]*fx*(1-fy)+gray[k+w]*(1-fx)*fy+gray[k+w+1]*fx*fy}
  for(var gy=0;gy<GY;gy++)for(var gx=0;gx<GX;gx++){var s=0;
    for(var sy=0;sy<3;sy++)for(var sx=0;sx<3;sx++)s+=samp(x0+(gx+(sx+.5)/3)*bw/GX,y0+(gy+(sy+.5)/3)*bh/GY);
    s/=9;f[gy*GX+gx]=s;if(s<mn)mn=s;if(s>mx)mx=s}
  for(i=0;i<GX*GY;i++)f[i]=(mx-f[i])/(mx-mn||1);
  var asp=bw/bh;f[GX*GY]=Math.min(1.2,asp)*3;f[GX*GY+1]=holes(c,w)*1.5;
  return {f:f,asp:asp,x0:x0,y0:y0,bw:bw,bh:bh};
}
function dist(a,b){var d=0;for(var i=0;i<a.length;i++){var t=a[i]-b[i];d+=t*t}return Math.sqrt(d)}

function kmeans(F,k){
  var n=F.length,best=null;
  for(var rs=0;rs<12;rs++){
    var seed=rs*7919+13,rnd=function(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
    var C=[F[Math.floor(rnd()*n)].slice()];
    while(C.length<k){var dd=F.map(function(f){return Math.min.apply(null,C.map(function(c){return dist(f,c)}))}),tot=0,i;
      for(i=0;i<n;i++){dd[i]=dd[i]*dd[i];tot+=dd[i]}var r=rnd()*tot,acc=0,pick=n-1;
      for(i=0;i<n;i++){acc+=dd[i];if(acc>=r){pick=i;break}}C.push(F[pick].slice())}
    var as=new Array(n).fill(-1),it;
    for(it=0;it<40;it++){var ch=false;
      for(var i2=0;i2<n;i2++){var b=0,bd=1e18;for(var j=0;j<k;j++){var d=dist(F[i2],C[j]);if(d<bd){bd=d;b=j}}if(as[i2]!==b){as[i2]=b;ch=true}}
      for(var j2=0;j2<k;j2++){var m=new Float32Array(F[0].length),c2=0;
        for(var i3=0;i3<n;i3++)if(as[i3]===j2){c2++;for(var t=0;t<m.length;t++)m[t]+=F[i3][t]}
        if(c2){for(t=0;t<m.length;t++)m[t]/=c2;C[j2]=m}}
      if(!ch)break}
    var inertia=0;for(var i4=0;i4<n;i4++)inertia+=Math.pow(dist(F[i4],C[as[i4]]),2);
    if(!best||inertia<best.inertia)best={C:C,as:as,inertia:inertia};
  }
  return best;
}

/* protos: [{label:1-4, f:Float32Array}] from fonts / earlier confirmed pages. Returns permutation cluster->label */
function nameClusters(C,protos){
  if(!protos||!protos.length)return null;
  var cost=C.map(function(c){var r=[1e9,1e9,1e9,1e9,1e9];protos.forEach(function(p){var d=dist(c,p.f);if(d<r[p.label])r[p.label]=d});return r});
  var best=null;
  (function perm(a,used){
    if(a.length===4){var s=0;for(var i=0;i<4;i++)s+=cost[i][a[i]];if(!best||s<best.s)best={s:s,p:a.slice()};return}
    for(var l=1;l<=4;l++)if(!used[l]){used[l]=1;a.push(l);perm(a,used);a.pop();used[l]=0}
  })([],{});
  return best.p;
}

function resize(g,w,h,s){
  var nw=Math.round(w*s),nh=Math.round(h*s),o=new Uint8Array(nw*nh);
  for(var y=0;y<nh;y++){var fy=Math.min(h-1.001,y/s),y0=fy|0,wy=fy-y0;
    for(var x=0;x<nw;x++){var fx=Math.min(w-1.001,x/s),x0=fx|0,wx=fx-x0,k=y0*w+x0;
      o[y*nw+x]=g[k]*(1-wx)*(1-wy)+g[k+1]*wx*(1-wy)+g[k+w]*(1-wx)*wy+g[k+w+1]*wx*wy}}
  return {g:o,w:nw,h:nh};
}
function scan(gray,W,H,opt){
  opt=opt||{};var t0=Date.now();
  if(!opt._up){ // photos with tiny digits are enlarged first so every glyph has enough pixels
    var q=sauvola(gray,W,H,31,0.3),qs=label(q,W,H),hh=new Float32Array(121),hm=6,bv0=-1;
    qs.forEach(function(c){if(c.n>=10&&c.h>=6&&c.h<=100&&c.w<=2*c.h)hh[c.h]++});
    for(var z=6;z<=100;z++){var s0=hh[z-1]+2*hh[z]+hh[z+1];if(s0>bv0){bv0=s0;hm=z}}
    if(hm<22){var sc0=Math.max(1,Math.min(4,Math.ceil(26/hm*10)/10,Math.sqrt(14e6/(W*H)))),R=resize(gray,W,H,sc0),o2={};for(var kk in opt)o2[kk]=opt[kk];o2._up=sc0;
      var out0=scan(R.g,R.w,R.h,o2);out0.scale=sc0;return out0}
  }
  // 1. binarise, find glyph-sized blobs, learn the page's digit height
  var win=opt._up?(Math.round(31*opt._up)|1):31,ink=sauvola(gray,W,H,win,0.3),cs=label(ink,W,H),hs=[],i;
  var hist=new Float32Array(121);
  var hmin=opt._up?Math.round(6*opt._up):6; // specks of an enlarged photo scale up with it: count only glyph-sized blobs
  cs.forEach(function(c){if(c.n>=10&&c.h>=hmin&&c.h<=100&&c.w<=2*c.h)hist[c.h]++});
  var h0=hmin,bv=-1;for(i=hmin;i<=100;i++){var sc=hist[i-1]+2*hist[i]+hist[i+1];if(sc>bv){bv=sc;h0=i}}
  var nwin=Math.max(15,Math.round(2.6*h0))|1;
  if(Math.abs(nwin-win)>8){ink=sauvola(gray,W,H,nwin,0.3);cs=label(ink,W,H)}
  var G=cs.filter(function(c){var fill=c.n/(c.w*c.h);return c.h>=.7*h0&&c.h<=1.9*h0&&c.w>=.08*h0&&c.w<=4.2*h0&&fill>.1&&(fill<.95||(c.w<=.5*h0&&fill<.995))}); // a crisp thin bar (the digit 1) is almost fully inked: only wide solid blobs are boxes
  // a wide blob that is clearly shorter or taller than a digit is a printed word / letter group (e.g. "گزینه" printed between
  // the option digit and the question number in some books), never a digit or a number: drop it so it cannot glue to the digit
  G=G.filter(function(c){return !((c.w>1.2*h0&&c.h<.88*h0)||c.h>1.35*h0)});
  G.forEach(function(c){c.cnt=c.w>1.25*h0?Math.max(2,Math.round(c.w/(.72*h0))):1;var s=0,m=Math.min(c.px.length,400),st=Math.max(1,(c.px.length/m)|0),q=0;
    for(var i=0;i<c.px.length;i+=st){s+=255-gray[c.px[i]];q++}c.dk=s/q});
  var dkm=median(G.map(function(c){return c.dk}));
  G=G.filter(function(c){return c.dk>=.62*dkm});
  var DOTS=cs.filter(function(c){return c.h>=.12*h0&&c.h<=.5*h0&&c.w>=.12*h0&&c.w<=.6*h0&&c.n>=4&&c.n/(c.w*c.h)>.4});
  // 2. de-skew: rows of text line up when the angle is right
  function rowScore(a){var co=Math.cos(a),si=Math.sin(a),b={},s=0;G.forEach(function(c){var k=Math.round(((c.y0+c.y1)/2*co-(c.x0+c.x1)/2*si)/(.4*h0));b[k]=(b[k]||0)+1});
    for(var k in b)s+=b[k]*b[k];return s}
  var ang=0,bs=-1,a;
  for(a=-6;a<=6.001;a+=.25){var s1=rowScore(a*Math.PI/180);if(s1>bs){bs=s1;ang=a}}
  var a0=ang;for(a=a0-.25;a<=a0+.251;a+=.05){var s2=rowScore(a*Math.PI/180);if(s2>bs){bs=s2;ang=a}}
  var th=ang*Math.PI/180,cs_=Math.cos(th),sn_=Math.sin(th);
  G.forEach(function(c){var cx=(c.x0+c.x1)/2,cy=(c.y0+c.y1)/2;
    c.u=cx*cs_+cy*sn_;c.v=cy*cs_-cx*sn_;c.l=c.u-c.w/2;c.r=c.u+c.w/2});
  DOTS.forEach(function(c){var cx=(c.x0+c.x1)/2,cy=(c.y0+c.y1)/2;c.u=cx*cs_+cy*sn_;c.v=cy*cs_-cx*sn_;c.l=c.u-c.w/2;c.r=c.u+c.w/2});
  // 3. gap statistics: touching digits of one number vs the larger gaps between columns of the layout
  var srt=G.slice().sort(function(p,q){return p.l-q.l}),gaps=[];
  for(i=0;i<srt.length;i++){var best=1e9;
    for(var j=i+1;j<srt.length&&srt[j].l-srt[i].r<6*h0;j++)if(Math.abs(srt[j].v-srt[i].v)<.4*h0){var gp=srt[j].l-srt[i].r;if(gp<best)best=gp}
    if(best<6*h0)gaps.push(Math.max(0,best)/h0)}
  gaps.sort(function(p,q){return p-q});
  var lo=Math.floor(gaps.length*.35),hi=Math.floor(gaps.length*.8),jb=1,jt=.5;
  for(i=lo;i<hi;i++){var rj=(gaps[i+1]+.08)/(gaps[i]+.08);if(rj>jb){jb=rj;jt=Math.sqrt((gaps[i]+.04)*(gaps[i+1]+.04))}}
  var gapT=Math.max(.3,Math.min(.8,jt))*h0;
  // 4. glyphs -> elements (union-find over near neighbours on one text line)
  var par=srt.map(function(_,k){return k});
  function fd(x){while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x}
  for(i=0;i<srt.length;i++)for(var j2=i+1;j2<srt.length&&srt[j2].l-srt[i].r<=gapT;j2++)
    if(Math.abs(srt[j2].v-srt[i].v)<.4*h0&&srt[j2].l-srt[i].r>=-.3*h0)par[fd(j2)]=fd(i);
  var map={};srt.forEach(function(c,k){var r=fd(k);(map[r]=map[r]||[]).push(c)});
  var E=Object.keys(map).map(function(k){var g=map[k].sort(function(p,q){return p.u-q.u});
    return{g:g,n:g.length,dots:0,l:g[0].l,r:g[g.length-1].r,v:median(g.map(function(c){return c.v}))}});
  DOTS.forEach(function(d){
    var L=null,R2=null,bl=1e18,br=1e18,one=null,bo=1e18;
    E.forEach(function(e){if(e.dead)return;var dy=Math.abs(d.v-e.v);if(dy>.5*h0)return;
      var left=d.l>e.r,right=d.r<e.l,dx=left?d.l-e.r:(right?e.l-d.r:0);if(dx>gapT*1.5)return;
      if(left&&dx<bl){bl=dx;L=e}if(right&&dx<br){br=dx;R2=e}if(dx<bo){bo=dx;one=e}});
    if(L&&R2&&L!==R2&&Math.abs(d.v-L.v)<.35*h0&&Math.abs(d.v-R2.v)<.35*h0){ // 1 . 8  ->  one number
      L.g=L.g.concat(R2.g).sort(function(p,q){return p.u-q.u});L.n=L.g.length;L.dots=(L.dots||0)+(R2.dots||0)+1;
      L.l=Math.min(L.l,R2.l,d.l);L.r=Math.max(L.r,R2.r,d.r);R2.dead=true}
    else if(one&&bo<=gapT){one.dots=(one.dots||0)+1;one.l=Math.min(one.l,d.l);one.r=Math.max(one.r,d.r)}});
  E=E.filter(function(e){return !e.dead});
  E.forEach(function(e){e.k=e.g.reduce(function(a,c){return a+c.cnt},0)+(e.dots||0);e.single=e.n===1&&e.g[0].cnt===1&&!e.dots});
  // a "number" is an element with 2+ digit marks; a lone dot-bearing glyph cannot be an option digit
  var Ds=E.filter(function(e){return e.single}),Ns=E.filter(function(e){return e.k>=2&&e.k<=6});
  // 5. which side of the question number does the option digit sit on? (look at the left-most element of every text line)
  var vD=0,vN=0;
  E.forEach(function(e){var left=false;
    for(var k=0;k<E.length;k++){var f=E[k];if(f!==e&&Math.abs(f.v-e.v)<.5*h0&&f.r<e.l){left=true;break}}
    if(!left){if(e.single)vD++;else if(e.k>=2&&e.k<=6)vN++}});
  var dir=vD>=vN?1:-1; // +1: option digit is left of its number (all three sample books)
  // 6. pair each option digit with the nearest question number in that direction on the same line
  function pairUp(minDx){
    var out=[];
    Ns.forEach(function(nn){var cand=[];
      Ds.forEach(function(d){var dy=Math.abs(nn.v-d.v);if(dy>.95*h0)return;var dx=dir>0?nn.l-d.r:d.l-nn.r;if(dx>minDx&&dx<8*h0)cand.push({d:d,dx:dx,dk:d.g[0].dk,sc:dx+4*dy})});
      if(!cand.length)return;cand.sort(function(p,q){return p.sc-q.sc});
      var pick=cand[0];
      // a faint box border can sit between digit and number: prefer a clearly darker mark a bit further away
      for(var i=1;i<cand.length;i++)if(cand[i].dk>1.35*pick.dk&&cand[i].dx-pick.dx<2.2*h0&&cand[i].sc-pick.sc<2.5*h0)pick=cand[i];
      out.push({d:pick.d,n:nn,dx:pick.dx})});
    return out}
  var pairs=pairUp(0);
  // The real option digit sits a typical distance from its number. A mark much closer than that is a leading glyph of the
  // number itself (e.g. the thin "1" of 1089) that came loose: fold it into the number and pair again.
  var typDx=median(pairs.map(function(p){return p.dx}));var dbgDx=pairs.map(function(p){return Math.round(p.dx/h0*10)/10}).sort(function(a,b){return a-b});
  var folded=new Set();
  if(typDx>1.2*h0){ // a mark almost touching its number is a loose glyph of that number (e.g. the thin "1" of 1089), not an option digit
    pairs.forEach(function(p){if(p.dx<.5*h0&&p.n.g.every(function(c){return c.h>=.85*h0&&c.h<=1.2*h0})&&p.n.k>=3){folded.add(p.d);if(dir>0)p.n.l=Math.min(p.n.l,p.d.l);else p.n.r=Math.max(p.n.r,p.d.r);p.n.k++}});
    if(folded.size){Ds=Ds.filter(function(d){return !folded.has(d)});pairs=pairUp(0)}
  }
  var usedD0=new Map();pairs.sort(function(p,q){return p.dx-q.dx});
  pairs=pairs.filter(function(p){if(usedD0.has(p.d))return false;usedD0.set(p.d,1);return true});
  var mdx=median(pairs.map(function(p){return p.dx}));
  pairs=pairs.filter(function(p){return p.dx<=Math.max(1.8*mdx,2*h0)});
  // 7. columns: cluster by x with a threshold learnt from the page (gap between columns >> jitter inside a column)
  pairs.forEach(function(p){p.x=p.d.g[0].u;p.y=p.d.v});
  function colsOf(list){
    var xs=list.map(function(p){return p.x}).sort(function(p,q){return p-q}),gp=[];
    for(var i=1;i<xs.length;i++)gp.push(xs[i]-xs[i-1]);
    var big=gp.filter(function(v){return v>4.5*h0}).sort(function(p,q){return p-q}),cut=3*h0;
    if(big.length){var typ=big[big.length>>1];cut=Math.max(2.2*h0,.55*typ)}
    var cuts=[];for(i=1;i<xs.length;i++)if(xs[i]-xs[i-1]>cut)cuts.push((xs[i]+xs[i-1])/2);
    colsOf.dbg=gp.filter(function(v){return v>h0}).map(Math.round).sort(function(a,b){return a-b});
    return cuts;
  }
  var cuts=colsOf(pairs);
  function colIdx(x){var c=0;while(c<cuts.length&&x>cuts[c])c++;return c}
  pairs.forEach(function(p){p.col=colIdx(p.x)});
  var ncol=cuts.length+1,cols=[],ci0;
  for(ci0=0;ci0<ncol;ci0++)cols.push(pairs.filter(function(p){return p.col===ci0}).sort(function(p,q){return p.y-q.y}));
  // 7b. recovery. (a) a number with no digit: take the nearest sensible blob on the digit side. (b) a digit with no number
  // but sitting in a column's digit lane: keep it (the number is only a witness, the digit is the answer).
  var pitch0=median([].concat.apply([],cols.map(function(c){var r=[];for(var k=1;k<c.length;k++)r.push(c[k].y-c[k-1].y);return r}).map(function(r){return r.filter(function(v){return v<1.5*median(r)||!r.length})})));
  var usedN=new Set(pairs.map(function(p){return p.n})),usedD=new Set(pairs.map(function(p){return p.d})),recovered=0,orphan=0;
  var colX=cols.map(function(c){return median(c.map(function(p){return p.x}))});
  function lane(x,y){ // is (x,y) a free slot in the digit lane of some column?
    var ci=-1,bx=1e18;colX.forEach(function(cx,i){if(Math.abs(cx-x)<bx){bx=Math.abs(cx-x);ci=i}});
    if(ci<0||bx>.8*h0)return -1;
    var cy=cols[ci].map(function(p){return p.y});if(!cy.length)return -1;
    if(y<Math.min.apply(null,cy)-1.6*pitch0||y>Math.max.apply(null,cy)+1.6*pitch0)return -1;
    if(pairs.some(function(p){return p.col===ci&&Math.abs(p.y-y)<.6*pitch0}))return -1;
    return ci}
  Ns.forEach(function(nn){
    if(usedN.has(nn))return;
    var best=null,bd=1e18;
    cs.forEach(function(c){
      if(c.h<.4*h0||c.h>2.2*h0||c.w>1.5*h0||c.w<.15*h0)return;
      var cu=(c.x0+c.x1)/2,cy=(c.y0+c.y1)/2,u=cu*cs_+cy*sn_,v=cy*cs_-cu*sn_;
      if(Math.abs(v-nn.v)>.55*h0)return;
      var dx=dir>0?nn.l-(u+c.w/2):(u-c.w/2)-nn.r;if(dx<-.2*h0||dx>4*h0)return;
      if(dx<bd&&lane(u,v)>=0){bd=dx;best={c:c,u:u,v:v,l:u-c.w/2,r:u+c.w/2}}});
    if(best){var pc=best.c;pc.u=best.u;pc.v=best.v;pc.l=best.l;pc.r=best.r;pc.cnt=1;
      var el={g:[pc],n:1,dots:0,k:1,single:true,l:pc.l,r:pc.r,v:pc.v};
      var pr={d:el,n:nn,dx:bd,x:pc.u,y:pc.v,rec:true};pr.col=colIdx(pr.x);pairs.push(pr);recovered++}});
  Ds.forEach(function(d){
    if(usedD.has(d)||pairs.some(function(p){return p.d===d}))return;
    var x=d.g[0].u,y=d.v,ci=lane(x,y);
    if(ci<0)return;
    pairs.push({d:d,n:null,dx:0,x:x,y:y,col:ci,orphan:true});orphan++});
  cols=[];for(ci0=0;ci0<ncol;ci0++)cols.push(pairs.filter(function(p){return p.col===ci0}).sort(function(p,q){return p.y-q.y}));
  // 7b1. a column with only a couple of entries next to full ones is a stray mark (logo, page number), not a column
  var medLen=median(cols.map(function(c){return c.length})),strays=0;
  if(cols.length>2){cols=cols.filter(function(c){if(c.length<Math.max(3,.2*medLen)){strays+=c.length;return false}return true});ncol=cols.length}
  // 7b2. two entries closer than half a row cannot both be real: keep the one that has a question number
  cols=cols.map(function(c){var out=[];c.forEach(function(p){var q=out[out.length-1];
    if(q&&p.y-q.y<.55*pitch0){var keepP=(p.n&&!q.n)||(!!p.n===!!q.n&&p.d&&q.d&&p.d.g[0].dk>q.d.g[0].dk);if(keepP)out[out.length-1]=p}else out.push(p)});return out});
  var titles=0;
  cols=cols.map(function(c){
    if(c.length<8)return c;var pt=pitch0;
    while(c.length>8&&c[1].y-c[0].y>1.9*pt){c=c.slice(1);titles++}
    while(c.length>8&&c[c.length-1].y-c[c.length-2].y>1.9*pt){c=c.slice(0,-1);titles++}
    return c});
  // 7c. numbering must never shift: if a column skips a row that still shows a question number, keep a placeholder for it.
  // A gap with no number-like text in it is a chapter header (or a picture) and is skipped.
  var hdr={},headers=0,holes=0,pitchG=median([].concat.apply([],cols.map(function(c){var r=[];for(var k=1;k<c.length;k++)r.push(c[k].y-c[k-1].y);return r})));
  cols.forEach(function(c,ci){
    if(!c.length)return;
    var nr=median(c.filter(function(p){return p.n}).map(function(p){return p.n.r})),add=[];
    for(var k=1;k<c.length;k++){var gy=c[k].y-c[k-1].y,nrow=Math.round(gy/pitchG);
      if(nrow<2||gy<1.6*pitchG)continue;
      var found=Ns.filter(function(o){return o.r>nr-1.4*h0&&o.r<nr+1.4*h0&&o.v>c[k-1].y+.45*pitchG&&o.v<c[k].y-.45*pitchG&&o.g.every(function(g){return g.h>=.8*h0&&g.h<=1.3*h0})&&!pairs.some(function(p){return p.n===o})});
      found.forEach(function(o){add.push({d:null,n:o,dx:0,x:c[k].x,y:o.v,col:ci,missing:true});holes++});
      if(!found.length){headers++;hdr[ci]=(hdr[ci]||0)+nrow-1}}
    add.forEach(function(p){c.push(p)});c.sort(function(p,q){return p.y-q.y})});
  var full=cols.filter(function(c){return c.length>=.9*Math.max.apply(null,cols.map(function(q){return q.length}))});
  var refTop=median(full.map(function(c){return c[0].y})),refBot=median(full.map(function(c){return c[c.length-1].y}));
  cols.forEach(function(c,ci){if(!c.length)return;
    var nr=median(c.filter(function(p){return p.n}).map(function(p){return p.n.r}));
    Ns.forEach(function(o){if(pairs.some(function(p){return p.n===o}))return;
      if(o.r<nr-1.4*h0||o.r>nr+1.4*h0||!o.g.every(function(g){return g.h>=.8*h0&&g.h<=1.3*h0}))return;
      var top=c[0].y,bot=c[c.length-1].y;
      if((o.v<top-.6*pitchG&&o.v>refTop-.5*pitchG)||(o.v>bot+.6*pitchG&&o.v<refBot+.5*pitchG)){c.push({d:null,n:o,dx:0,x:c[0].x,y:o.v,col:ci,missing:true});holes++}});
    c.sort(function(p,q){return p.y-q.y})});
  // every column except the last one read must be full: pad short ones so numbering cannot shift
  var slots=cols.map(function(c,ci){return c.length+(hdr[ci]||0)}),cnt={},modeS=0,mm=0;
  slots.forEach(function(v){cnt[v]=(cnt[v]||0)+1;if(cnt[v]>mm||(cnt[v]===mm&&v>modeS)){mm=cnt[v];modeS=v}});
  if(mm>=3){var lastRead=opt.rtl!==false?0:cols.length-1;
    cols.forEach(function(c,ci){if(ci===lastRead||!c.length)return;var need=modeS-slots[ci];if(need<=0||need>3)return;
      var topGap=Math.round((c[0].y-refTop)/pitchG),botGap=Math.round((refBot-c[c.length-1].y)/pitchG);
      var addTop=Math.max(0,Math.min(need,topGap)),addBot=Math.min(need-addTop,Math.max(0,botGap));if(addBot<need-addTop&&botGap>=0)addBot=need-addTop;
      for(var k=1;k<=addTop;k++)c.push({d:null,n:null,dx:0,x:c[0].x,y:c[0].y-k*pitchG,col:ci,missing:true});
      for(k=1;k<=addBot;k++)c.push({d:null,n:null,dx:0,x:c[0].x,y:c[c.length-1].y+pitchG,col:ci,missing:true});
      holes+=addTop+addBot;c.sort(function(p,q){return p.y-q.y})})}
  pairs=[].concat.apply([],cols);
  if(opt.rtl!==false)cols.reverse();
  var seq=[];cols.forEach(function(c,ci){c.forEach(function(p,ri){p.col=ci;p.row=ri;seq.push(p)})});
  // row pitch / gap report (a gap of ~2 rows = a chapter header or a missed row)
  var pitch=median([].concat.apply([],cols.map(function(c){var r=[];for(var k=1;k<c.length;k++)r.push(c[k].y-c[k-1].y);return r})));
  var odd=[];cols.forEach(function(c,ci){for(var k=1;k<c.length;k++){var gy=c[k].y-c[k-1].y;if(gy>1.6*pitch)odd.push({col:ci,after:k-1,rows:Math.round(gy/pitch)})}});
  // 8. shape clustering of the option digits
  var real=seq.filter(function(p){return p.d}),feats=real.map(function(p){return feat(p.d.g[0],W,cs_,sn_,gray,H)});
  seq.forEach(function(p){if(!p.d){p.cl=-1;p.low=true}});
  var km=real.length>=8?kmeans(feats.map(function(x){return x.f}),4):null,res=null;
  if(km){
    var order=[0,1,2,3].sort(function(a,b){var ma=0,na=0,mb=0,nb=0;
      km.as.forEach(function(c,k){if(c===a){ma+=feats[k].asp;na++}if(c===b){mb+=feats[k].asp;nb++}});return ma/(na||1)-mb/(nb||1)});
    var rank={};order.forEach(function(c,r){rank[c]=r});
    var C=order.map(function(c){return km.C[c]});
    real.forEach(function(p,k){var cl=rank[km.as[k]],d=[0,1,2,3].map(function(j){return dist(feats[k].f,C[j])}),
      d1=d[cl],d2=Math.min.apply(null,d.filter(function(_,j){return j!==cl}));
      p.cl=cl;p.d1=d1;p.ratio=d1/(d2||1e-9);p.f=feats[k].f;p.box=feats[k]});
    var cd=[[],[],[],[]];real.forEach(function(p){cd[p.cl].push(p.d1)});
    var cst=cd.map(function(a){var m=a.reduce(function(s,v){return s+v},0)/(a.length||1),sd=Math.sqrt(a.reduce(function(s,v){return s+(v-m)*(v-m)},0)/(a.length||1));return{m:m,sd:sd,n:a.length}});
    real.forEach(function(p){var s=cst[p.cl];p.low=p.ratio>.72||p.d1>s.m+2.8*s.sd});
    res={C:C,stats:cst};
  }
  return{W:W,H:H,gray:gray,h0:h0,recovered:recovered,titles:titles,headers:headers,holes:holes,dbgDx:dbgDx,dbgGaps:colsOf.dbg,orphan:orphan,angle:ang,gapT:gapT/h0,dir:dir,pitch:pitch,ncol:ncol,seq:seq,odd:odd,km:res,
    glyphs:G.length,elements:E.length,ms:Date.now()-t0,
    cosS:cs_,sinS:sn_};
}

/* Look for one option digit near a point (x,y) of the scanned image. Returns a ready-made entry or null. */
function localFind(R,cx,cy){
  var W=R.W,H=R.H,h0=R.h0,rx=Math.round(2.4*h0),ry=Math.round(1.9*h0);
  var x0=Math.max(0,Math.round(cx-rx)),x1=Math.min(W,Math.round(cx+rx)),y0=Math.max(0,Math.round(cy-ry)),y1=Math.min(H,Math.round(cy+ry)),cw=x1-x0,ch=y1-y0;
  if(cw<8||ch<8)return null;
  var hist=new Uint32Array(256),i,x,y;
  for(y=0;y<ch;y++)for(x=0;x<cw;x++)hist[R.gray[(y0+y)*W+x0+x]]++;
  var tot=cw*ch,sum=0;for(i=0;i<256;i++)sum+=i*hist[i];
  var wB=0,sB=0,best=-1,thr=128;
  for(i=0;i<256;i++){wB+=hist[i];if(!wB)continue;var wF=tot-wB;if(!wF)break;sB+=i*hist[i];var mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;thr=i}}
  var out=[],r;
  for(r=0;r<3;r++){ // try the Otsu level, then a slightly darker and a lighter one
    var t=thr+[0,-18,18][r],ink=new Uint8Array(cw*ch);
    for(i=0;i<ink.length;i++)ink[i]=R.gray[(Math.floor(i/cw)+y0)*W+x0+i%cw]<t?1:0;
    label(ink,cw,ch).forEach(function(c){
      if(c.x0<=0||c.y0<=0||c.x1>=cw-1||c.y1>=ch-1)return;
      var fill=c.n/(c.w*c.h);
      if(c.h<.5*h0||c.h>1.7*h0||c.w<.1*h0||c.w>1.6*h0||fill<.1||(fill>.95&&!(c.w<=.5*h0&&fill<.995)))return;
      var px=c.px.map(function(p){return(((p/cw)|0)+y0)*W+(p%cw)+x0});
      var g={x0:c.x0+x0,x1:c.x1+x0,y0:c.y0+y0,y1:c.y1+y0,n:c.n,w:c.w,h:c.h,px:px,cnt:1},ccx=(g.x0+g.x1)/2,ccy=(g.y0+g.y1)/2;
      g.u=ccx*R.cosS+ccy*R.sinS;g.v=ccy*R.cosS-ccx*R.sinS;g.l=g.u-g.w/2;g.r=g.u+g.w/2;
      var s=0;for(var k=0;k<px.length;k++)s+=255-R.gray[px[k]];g.dk=s/px.length;
      g.dist=Math.hypot(ccx-cx,ccy-cy);out.push(g)})
    if(out.length)break;
  }
  if(!out.length)return null;
  out.sort(function(a,b){return a.dist-b.dist});
  var g=out[0];if(g.dist>1.6*h0)return null;
  var ft=feat(g,W,R.cosS,R.sinS,R.gray,H),cl=-1,d1=0,ratio=1,low=true;
  if(R.km){var ds=R.km.C.map(function(c){return dist(ft.f,c)});cl=0;for(i=1;i<4;i++)if(ds[i]<ds[cl])cl=i;
    d1=ds[cl];var d2=Math.min.apply(null,ds.filter(function(_,j){return j!==cl}));ratio=d1/(d2||1e-9);
    var st=R.km.stats[cl];low=ratio>.85||d1>st.m+4*st.sd}
  return{d:{g:[g]},n:null,dx:0,x:g.u,y:g.v,added:true,cl:cl,d1:d1,ratio:ratio,low:low,f:ft.f};
}

var api={kmeans:kmeans,localFind:localFind,scan:scan,resize:resize,feat:feat,label:label,nameClusters:nameClusters,dist:dist,sauvola:sauvola,GX:GX,GY:GY};
return api;
})(typeof window!=="undefined"?window:globalThis);

export { KeyScan };
