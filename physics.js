/* Original fixed-step silhouette physics for Nailong Pop. No external runtime. */
(function(root){
  'use strict';
  const RADII=[18,22,27,33,40,48,57,68,80,95];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class PopWorld{
    constructor(onMerge=()=>{},shapes=null){this.onMerge=onMerge;this.shapes=shapes;this.reset();}
    reset(){this.bodies=[];this.time=0;this.overflow=0;this.safeUntil=0;this.id=0;}
    spawn(level,x,y=49){
      const r=RADII[level];
      const b={id:++this.id,level,r,x:clamp(x,r+7,413-r),y,vx:0,vy:0,angle:0,spin:0,born:this.time,invMass:1/(r*r)};
      this.geometry(b);this.bodies.push(b);return b;
    }
    geometry(b){
      if(!this.shapes){b.minX=-b.r;b.maxX=b.r;b.minY=-b.r;b.maxY=b.r;return;}
      const angle=Math.sin(b.angle)*.16,cos=Math.cos(angle),sin=Math.sin(angle);
      b.vertices=this.shapes[b.level].map(([x,y])=>[(x*cos-y*sin)*b.r,(x*sin+y*cos)*b.r]);
      b.minX=Math.min(...b.vertices.map(p=>p[0]));b.maxX=Math.max(...b.vertices.map(p=>p[0]));b.minY=Math.min(...b.vertices.map(p=>p[1]));b.maxY=Math.max(...b.vertices.map(p=>p[1]));
      b.axes=b.vertices.map((p,i)=>{const q=b.vertices[(i+1)%b.vertices.length],dx=q[0]-p[0],dy=q[1]-p[1],d=Math.hypot(dx,dy);return [-dy/d,dx/d];});
    }
    overlap(a,b){
      const dx=b.x-a.x,dy=b.y-a.y;
      if(a.x+a.maxX<b.x+b.minX||b.x+b.maxX<a.x+a.minX||a.y+a.maxY<b.y+b.minY||b.y+b.maxY<a.y+a.minY)return null;
      if(!this.shapes){const d=Math.hypot(dx,dy),depth=a.r+b.r-d;if(depth<0)return null;return {nx:d>0?dx/d:1,ny:d>0?dy/d:0,depth};}
      let depth=Infinity,nx=0,ny=0;
      for(const axis of [...a.axes,...b.axes]){
        const [ax,ay]=axis,offset=dx*ax+dy*ay;
        let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
        for(const p of a.vertices){const v=p[0]*ax+p[1]*ay;amin=Math.min(amin,v);amax=Math.max(amax,v);}
        for(const p of b.vertices){const v=p[0]*ax+p[1]*ay+offset;bmin=Math.min(bmin,v);bmax=Math.max(bmax,v);}
        const overlap=Math.min(amax,bmax)-Math.max(amin,bmin);if(overlap<0)return null;
        if(overlap<depth){depth=overlap;const sign=offset>=0?1:-1;nx=ax*sign;ny=ay*sign;}
      }
      return {nx,ny,depth};
    }
    shake(random=Math.random){
      this.safeUntil=this.time+2;this.overflow=0;
      this.bodies.forEach(b=>{b.vx+=(random()-.5)*360;b.vy=-210-random()*110;b.spin=(random()-.5)*2;});
    }
    step(dt){
      this.time+=dt;
      for(const b of this.bodies){b.vy+=850*dt;b.vx*=Math.exp(-.4*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;b.spin*=Math.exp(-1.8*dt);this.geometry(b);}
      const consumed=new Set(),merges=[];
      for(let i=0;i<this.bodies.length;i++){
        const a=this.bodies[i];if(consumed.has(a.id))continue;
        for(let j=i+1;j<this.bodies.length;j++){
          const b=this.bodies[j];if(consumed.has(b.id)||a.level!==b.level||this.time-a.born<.12||this.time-b.born<.12)continue;
          if(this.overlap(a,b)){
            consumed.add(a.id);consumed.add(b.id);merges.push({level:a.level,x:(a.x+b.x)/2,y:(a.y+b.y)/2,vx:(a.vx+b.vx)/2});break;
          }
        }
      }
      if(consumed.size){
        this.bodies=this.bodies.filter(b=>!consumed.has(b.id));
        for(const m of merges){if(m.level<RADII.length-1){const b=this.spawn(m.level+1,m.x,m.y);b.vx=m.vx*.35;b.vy=-55;b.spin=(m.x-210)/150;}this.onMerge(m);}
      }
      for(let pass=0;pass<7;pass++){
        for(const b of this.bodies)this.walls(b);
        for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++)this.contact(this.bodies[i],this.bodies[j]);
      }
      for(const b of this.bodies)this.walls(b);
      const crowded=this.time>this.safeUntil&&this.bodies.some(b=>this.time-b.born>1.8&&b.y+b.minY<109);
      this.overflow=crowded?this.overflow+dt:Math.max(0,this.overflow-dt*3);
      return this.overflow>=3;
    }
    walls(b){
      const left=7-b.minX,right=413-b.maxX,bottom=590-b.maxY;
      if(b.x<left){b.x=left;if(b.vx<0)b.vx*=-.28;}
      if(b.x>right){b.x=right;if(b.vx>0)b.vx*=-.28;}
      if(b.y>bottom){b.y=bottom;if(b.vy>0)b.vy=b.vy>35?-b.vy*.16:0;b.vx*=.93;b.spin=b.vx/b.r*.3;}
    }
    contact(a,b){
      const overlap=this.overlap(a,b);if(!overlap)return;
      const {nx,ny,depth}=overlap,total=a.invMass+b.invMass;
      const correction=Math.max(0,depth-.02)*.9/total;
      a.x-=nx*correction*a.invMass;a.y-=ny*correction*a.invMass;b.x+=nx*correction*b.invMass;b.y+=ny*correction*b.invMass;
      const rvx=b.vx-a.vx,rvy=b.vy-a.vy,normal=rvx*nx+rvy*ny;
      if(normal>=0)return;
      const impulse=-(1+(normal<-70?.17:0))*normal/total;
      a.vx-=impulse*nx*a.invMass;a.vy-=impulse*ny*a.invMass;b.vx+=impulse*nx*b.invMass;b.vy+=impulse*ny*b.invMass;
      const tangent=rvx*(-ny)+rvy*nx;
      const friction=clamp(-tangent/total,-impulse*.25,impulse*.25);
      a.vx-=friction*(-ny)*a.invMass;a.vy-=friction*nx*a.invMass;b.vx+=friction*(-ny)*b.invMass;b.vy+=friction*nx*b.invMass;
      a.spin=clamp(a.spin+tangent*.00015,-1.5,1.5);b.spin=clamp(b.spin-tangent*.00015,-1.5,1.5);
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={PopWorld,RADII};
  else{root.PopWorld=PopWorld;root.POP_RADII=RADII;}
})(typeof globalThis!=='undefined'?globalThis:this);
