// Original flat illustrations for explicitly labelled local demo exhibits.
// PNG encoding uses only Node built-ins; no image service or runtime dependency.
import { deflateSync } from 'node:zlib';
function crc(bytes) { let c=0xffffffff; for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);} return (c^0xffffffff)>>>0; }
function chunk(name,bytes){const type=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(bytes.length);sum.writeUInt32BE(crc(Buffer.concat([type,bytes])));return Buffer.concat([length,type,bytes,sum]);}
export function museumDemoImage(index) {
  const w=960,h=640,pixels=Buffer.alloc(w*h*3);
  const palettes=[['e8ede4','2d4c3c','e6c78d'],['ece7df','3e4c4b','c78b73'],['e4eaf0','3e5366','dfc8a0'],['f1e9e0','b66354','3c5e4b'],['e6ede9','345d54','d7b77d'],['ece9f0','665975','c7d6c0']];
  const colors=palettes[index%palettes.length].map(hex=>hex.match(/../g).map(n=>parseInt(n,16)));
  function rect(x,y,rw,rh,color){for(let j=Math.max(0,y|0);j<Math.min(h,y+rh);j++)for(let i=Math.max(0,x|0);i<Math.min(w,x+rw);i++){const p=(j*w+i)*3;pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];}}
  function circle(cx,cy,r,color){for(let y=Math.max(0,cy-r);y<Math.min(h,cy+r);y++)for(let x=Math.max(0,cx-r);x<Math.min(w,cx+r);x++)if((x-cx)**2+(y-cy)**2<r*r){const p=(y*w+x)*3;pixels[p]=color[0];pixels[p+1]=color[1];pixels[p+2]=color[2];}}
  rect(0,0,w,h,colors[0]);
  if(index===0){rect(205,215,550,275,colors[1]);rect(285,170,140,50,colors[1]);circle(500,350,118,colors[0]);circle(500,350,87,colors[1]);circle(500,350,57,colors[2]);rect(660,250,50,30,colors[2]);}
  else if(index===1){rect(230,190,500,320,colors[1]);rect(300,150,16,60,colors[2]);rect(305,150,300,14,colors[2]);circle(395,350,105,colors[0]);for(let i=0;i<8;i++)rect(325+i*19,280,8,140,colors[2]);rect(550,260,125,45,colors[2]);circle(580,395,24,colors[2]);circle(650,395,24,colors[2]);}
  else if(index===2){circle(480,325,205,colors[1]);circle(480,325,182,colors[0]);for(let i=0;i<12;i++){const a=i*Math.PI/6;circle(Math.round(480+Math.sin(a)*152),Math.round(325-Math.cos(a)*152),7,colors[1]);}rect(470,220,15,110,colors[1]);rect(480,320,110,14,colors[1]);circle(480,325,16,colors[2]);}
  else if(index===3){rect(260,90,440,470,[255,252,245]);circle(470,260,118,colors[1]);circle(520,230,92,colors[2]);rect(310,425,340,10,colors[1]);rect(310,455,220,8,colors[2]);}
  else if(index===4){rect(260,100,440,460,colors[1]);rect(290,130,380,400,colors[0]);circle(550,250,68,colors[2]);rect(290,415,380,115,colors[2]);rect(472,130,16,400,colors[1]);rect(290,330,380,16,colors[1]);}
  else {rect(240,95,480,470,[254,252,247]);for(let i=0;i<5;i++){rect(300+i*60,430-i*55,66,55+i*55,colors[1]);}circle(350,200,52,colors[2]);}
  const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)pixels.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);
  const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
