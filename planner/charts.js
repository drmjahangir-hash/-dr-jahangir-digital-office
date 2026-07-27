'use strict';

/* ============================================================================
   Personal Planner - chart functions (SVG, no external library)
   ----------------------------------------------------------------------------
   Same hand-rolled approach as Rental Manager's charts (see rental/app.js
   svgGroupedHBarChart/svgDonutChart) — kept dependency-free so reports work
   fully offline with zero network dependency, and copied rather than shared
   since every JM Digital Office module is self-contained by convention.
============================================================================ */

function svgEmptyState(){
  return '<div class="empty-note">Not enough data yet.</div>';
}

function svgGroupedHBarChart(items, seriesLabels, colors){
  if(!items.length) return svgEmptyState();
  const w = 640, leftPad = 130, rightPad = 90, rowH = 30, gap = 10, topPad = 10;
  const max = Math.max(1, ...items.map((it)=>Math.max(it.a||0, it.b!==undefined?it.b:0)));
  const h = topPad*2 + items.length*(rowH+gap);
  const barAreaW = w-leftPad-rightPad;
  const bars = items.map((it,i)=>{
    const y = topPad + i*(rowH+gap);
    const wA = Math.max(2, barAreaW*((it.a||0)/max));
    const hasB = it.b!==undefined;
    const wB = hasB ? Math.max(2, barAreaW*((it.b||0)/max)) : 0;
    return `
      <text x="${leftPad-8}" y="${y+12}" text-anchor="end" font-size="11" fill="#333">${escapeHtml(it.label)}</text>
      <rect x="${leftPad}" y="${y}" width="${wA}" height="12" rx="3" fill="${colors[0]}"></rect>
      <text x="${leftPad+wA+6}" y="${y+11}" font-size="10.5" fill="#333">${escapeHtml(String(it.a||0))}</text>
      ${hasB?`<rect x="${leftPad}" y="${y+15}" width="${wB}" height="12" rx="3" fill="${colors[1]}"></rect>
      <text x="${leftPad+wB+6}" y="${y+25}" font-size="10.5" fill="#333">${escapeHtml(String(it.b||0))}</text>`:''}
    `;
  }).join('');
  const legend = `<div class="chart-legend"><span><span class="sw" style="background:${colors[0]}"></span>${escapeHtml(seriesLabels[0])}</span>${seriesLabels[1]?`<span><span class="sw" style="background:${colors[1]}"></span>${escapeHtml(seriesLabels[1])}</span>`:''}</div>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">${bars}</svg>${legend}`;
}

function svgDonutChart(segments){
  segments = segments.filter((s)=>s.value>0);
  if(!segments.length) return svgEmptyState();
  const total = segments.reduce((s,x)=>s+x.value,0);
  const cx=90, cy=90, r=70, sw=28;
  let angle = -90;
  const circumference = 2*Math.PI*r;
  const arcs = segments.map((seg)=>{
    const frac = seg.value/total;
    const dash = frac*circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${sw}" stroke-dasharray="${dash} ${circumference-dash}" stroke-dashoffset="${-((angle+90)/360)*circumference}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    angle += frac*360;
    return arc;
  }).join('');
  const legend = `<div class="chart-legend">${segments.map((s)=>`<span><span class="sw" style="background:${s.color}"></span>${escapeHtml(s.label)}: ${s.value} (${Math.round((s.value/total)*100)}%)</span>`).join('')}</div>`;
  return `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" role="img" style="max-width:220px;margin:0 auto;display:block;">${arcs}<text x="90" y="94" text-anchor="middle" font-size="13" fill="#333">${total}</text></svg>${legend}`;
}

function svgLineChart(points, opts){
  opts = opts || {};
  if(!points.length) return svgEmptyState();
  const w = 600, h = 200, padL = 36, padR = 16, padT = 16, padB = 28;
  const max = Math.max(1, ...points.map((p)=>p.value));
  const stepX = (w-padL-padR) / Math.max(1, points.length-1);
  const coords = points.map((p,i)=>{
    const x = padL + i*stepX;
    const y = padT + (h-padT-padB) * (1 - (p.value/max));
    return { x, y, label:p.label, value:p.value };
  });
  const poly = coords.map((c)=>`${c.x},${c.y}`).join(' ');
  const dots = coords.map((c)=>`<circle cx="${c.x}" cy="${c.y}" r="3" fill="${opts.color||'#1565c0'}"></circle>`).join('');
  const labels = coords.filter((_,i)=>i%Math.ceil(coords.length/8||1)===0).map((c)=>`<text x="${c.x}" y="${h-8}" font-size="9.5" text-anchor="middle" fill="#5b6b7b">${escapeHtml(c.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h-padB}" stroke="#d7dee5"></line>
    <line x1="${padL}" y1="${h-padB}" x2="${w-padR}" y2="${h-padB}" stroke="#d7dee5"></line>
    <polyline points="${poly}" fill="none" stroke="${opts.color||'#1565c0'}" stroke-width="2"></polyline>
    ${dots}${labels}
  </svg>`;
}
