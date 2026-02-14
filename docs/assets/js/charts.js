// Canvas charts (no external libs). Export PNG supported via toDataURL.

export function exportCanvasPng(canvas, filename='chart.png'){
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function niceMax(v){
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  let m = 1;
  if (n <= 1) m = 1;
  else if (n <= 2) m = 2;
  else if (n <= 5) m = 5;
  else m = 10;
  return m * pow;
}

export function lineChart(canvas, labels, values, opts={}){
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = {l:54,r:16,t:18,b:44};
  ctx.clearRect(0,0,W,H);

  const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
  const maxV = niceMax(Math.max(1, ...values));

  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(pad.l,pad.t,plotW,plotH);

  // grid
  ctx.strokeStyle='rgba(255,255,255,0.10)';
  for(let i=0;i<=5;i++){
    const y=pad.t + (plotH*i/5);
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(pad.l+plotW,y); ctx.stroke();
  }

  const x = (i)=> pad.l + (labels.length<=1?0:(plotW*i/(labels.length-1)));
  const y = (v)=> pad.t + (1 - v/maxV)*plotH;

  // line
  ctx.strokeStyle = opts.color || 'rgba(34,197,94,0.9)';
  ctx.lineWidth=2;
  ctx.beginPath();
  values.forEach((v,i)=>{ const px=x(i), py=y(v); if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); });
  ctx.stroke();

  // points
  ctx.fillStyle = opts.pointColor || opts.color || 'rgba(34,197,94,0.9)';
  values.forEach((v,i)=>{ const px=x(i), py=y(v); ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill(); });

  // y labels
  ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.font='11px -apple-system,system-ui,Segoe UI,Roboto,sans-serif';
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let i=0;i<=5;i++){
    const v = maxV*(1 - i/5);
    const py = pad.t + (plotH*i/5);
    ctx.fillText(String(Math.round(v)), pad.l-8, py);
  }

  // x labels sparse
  ctx.textAlign='center'; ctx.textBaseline='top';
  const step = Math.ceil(labels.length/6);
  labels.forEach((lab,i)=>{
    if(i%step!==0 && i!==labels.length-1) return;
    ctx.fillText(lab, x(i), pad.t+plotH+10);
  });

  // border
  ctx.strokeStyle='rgba(255,255,255,0.18)';
  ctx.strokeRect(pad.l,pad.t,plotW,plotH);

  if(opts.title){
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.font='13px -apple-system,system-ui,Segoe UI,Roboto,sans-serif';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(opts.title, pad.l, 4);
  }
}

export function barChart(canvas, labels, values, opts={}){
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const pad={l:54,r:16,t:18,b:64};
  ctx.clearRect(0,0,W,H);
  const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
  const maxV = niceMax(Math.max(1, ...values));

  ctx.fillStyle='rgba(255,255,255,0.03)';
  ctx.fillRect(pad.l,pad.t,plotW,plotH);

  // grid + y labels
  ctx.strokeStyle='rgba(255,255,255,0.10)';
  ctx.fillStyle='rgba(255,255,255,0.65)';
  ctx.font='11px -apple-system,system-ui,Segoe UI,Roboto,sans-serif';
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let i=0;i<=5;i++){
    const v = maxV*(1 - i/5);
    const py = pad.t + (plotH*i/5);
    ctx.beginPath(); ctx.moveTo(pad.l,py); ctx.lineTo(pad.l+plotW,py); ctx.stroke();
    ctx.fillText(String(Math.round(v)), pad.l-8, py);
  }

  const n = labels.length;
  const bw = plotW / Math.max(1,n);
  for(let i=0;i<n;i++){
    const v=values[i];
    const h=(v/maxV)*plotH;
    const x=pad.l + i*bw + bw*0.15;
    const y=pad.t + (plotH-h);
    const w=bw*0.7;
    ctx.fillStyle = opts.color || 'rgba(124,58,237,0.85)';
    ctx.fillRect(x,y,w,h);
  }

  // x labels rotated
  ctx.save();
  ctx.translate(pad.l, pad.t+plotH+10);
  ctx.textAlign='right'; ctx.textBaseline='middle';
  ctx.fillStyle='rgba(255,255,255,0.70)';
  ctx.font='11px -apple-system,system-ui,Segoe UI,Roboto,sans-serif';
  for(let i=0;i<n;i++){
    const x = i*bw + bw*0.75;
    ctx.save();
    ctx.translate(x, 20);
    ctx.rotate(-Math.PI/4);
    ctx.fillText(labels[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle='rgba(255,255,255,0.18)';
  ctx.strokeRect(pad.l,pad.t,plotW,plotH);

  if(opts.title){
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.font='13px -apple-system,system-ui,Segoe UI,Roboto,sans-serif';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(opts.title, pad.l, 4);
  }
}
