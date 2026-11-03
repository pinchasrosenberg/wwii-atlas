/* Graph-backed enrichment. Estimates are intentionally separate from observations. */
(()=>{
'use strict';
const G=window.WW2_GRAPH_DATA;
if(!G){window.onerror?.('שכבת הגרף לא נטענה: חסר ww2_graph_data.js','',0);return;}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('en-US');
const epoch=Date.UTC(1937,0,1),dayOf=s=>Math.round((Date.parse(s+'T00:00:00Z')-epoch)/864e5);
const iso=d=>new Date(epoch+d*864e5).toISOString().slice(0,10);
const range=(a,b)=>a===b?fmt(a):`${fmt(a)}–${fmt(b)}`;
const css=document.createElement('style');css.textContent=`
@keyframes ww2RouteFlow{to{stroke-dashoffset:-32}}
.ww2-route-flow{animation:ww2RouteFlow 1.6s linear infinite}
@media(prefers-reduced-motion:reduce){.ww2-route-flow{animation:none}}
.ww2-flow-packet{font-size:17px;text-shadow:0 1px 3px #fff,0 0 4px #fff;line-height:20px}
#ww2Enrich{position:absolute;z-index:1100;left:14px;bottom:calc(var(--tlH) + 58px);
 width:305px;max-height:35vh;overflow:auto;background:rgba(250,247,240,.97);
 border:1px solid #d8c9ad;border-radius:10px;padding:10px 12px;box-shadow:0 6px 22px #15212b22;
 direction:rtl;font:12px Heebo,Arial,sans-serif}
#ww2Enrich h2{font-size:13px;margin:0 0 6px}
#ww2Enrich label{display:block;margin:4px 0;cursor:pointer}
#ww2Enrich small{display:block;color:#695e4b;line-height:1.4}
#ww2Enrich input[type=date],#ww2Enrich input[type=text]{font:inherit;width:100%;box-sizing:border-box;
 border:1px solid #cfc5b5;border-radius:4px;padding:4px;background:#fff}
#ww2Enrich button{font:inherit;border:1px solid #a58151;border-radius:5px;background:#fff7e8;
 padding:4px 8px;cursor:pointer;margin-top:5px}
#ww2Enrich .ww2result{margin-top:6px;line-height:1.5;max-height:125px;overflow:auto}
#feed{max-height:25vh}
body.clean #ww2Enrich{opacity:0;pointer-events:none}
@media(max-width:700px){#ww2Enrich{width:190px;max-height:23vh;font-size:11px}}
`;document.head.append(css);

// Plant size: breadth of mapped product categories, never bombing tonnage.
const oldDrawPlants=drawPlants;
drawPlants=function(){oldDrawPlants();
 const visible=(D.plants||[]).filter(p=>map.getZoom()>=5||BOMB[p.id]);
 plantLayer.getLayers().forEach((m,i)=>{const p=visible[i];if(!p)return;
  const info=G.plants[p.id],n=info?.product_types||0;
  m.setRadius(Math.max(2.5,Math.min(9,(n?3+1.8*Math.sqrt(n):3)*(map.getZoom()<5?.8:map.getZoom()>7?1.2:1))));
  const popup=m.getPopup();if(!popup)return;
  popup.setContent(popup.getContent()+`<br><b>חשיבות ייצור:</b> ${n?`${fmt(n)} סוגי מוצר ממופים`:'סוג מוצר לא ממופה'}`+
   `<br><span style="color:#8a5a22">◌ גודל העיגול הוא מדד מגוון, לא כמות ייצור.</span>`+
   `<br>תפוקה כמותית למפעל הזה: לא זמינה בגרף.`+
   (info?.products?.length?`<br>מוצרים: ${info.products.map(esc).join(' · ')}`:''));
  m.on('click',()=>showRailForPlant(p));
 });};
if(map.hasLayer(plantLayer))drawPlants();

// Keep dated, confirmed track geometry fixed but only show it after opening.
const rails=rail.getLayers(),ties=railTies.getLayers();let lastRailYear=null;
function updateRails(day){const year=new Date(epoch+day*864e5).getUTCFullYear();if(year===lastRailYear)return;
 lastRailYear=year;
 for(const [group,all] of [[rail,rails],[railTies,ties]])for(const line of all){
  const m=G.rail[line._ridx],active=m&&(!m[1]||m[1]<=year)&&(!m[2]||m[2]>=year);
  if(active&&!group.hasLayer(line))group.addLayer(line);
  else if(!active&&group.hasLayer(line))group.removeLayer(line);
 }}

const pane=map.createPane('ww2FlowPane');pane.style.zIndex='455';pane.style.pointerEvents='auto';
const renderer=L.svg({pane:'ww2FlowPane'}),flowLayer=L.layerGroup().addTo(map);
const cargoEmoji={food:'🍞',pol:'⛽',vehicles:'🚛',ordnance_weapons:'💣',
 aircraft:'✈️',raw_material:'⚙️'};
const cargoLabel={food:'מזון',pol:'דלק',vehicles:'כלי רכב',ordnance_weapons:'תחמושת וחימוש',
 aircraft:'מטוסים',raw_material:'חומרי גלם'};
const industryEmoji={vehicle_tank:'🛡️',munitions:'💣',ordnance:'💣',oil:'⛽',
 oil_chemical:'⛽',chemical:'🧪',aircraft:'✈️',aero_engine:'🛠️',rail_facility:'🚂',
 depot:'🏬',shipyard:'🚢',steel:'⚙️',submarine:'🚢',power:'⚡',aluminium:'🔩'};
const iconFor=emoji=>L.divIcon({className:'ww2-flow-packet',html:esc(emoji),iconSize:[20,20],iconAnchor:[10,10]});
const routeLines=[];
const packets=[];
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let selectedRail=null,selectedRailSource=null,selectedPacket=null;
for(const route of D.sea.routes){const code=route.n.split(' — ')[0];const fact=G.routes[code];if(!fact)continue;
 const points=route.c.map(p=>[p[1],p[0]]);
 const line=L.polyline(points,{renderer,color:'#c77a20',weight:3,opacity:.75,
  dashArray:'5,9',className:'ww2-route-flow',interactive:true});
 line.bindPopup(`<b>${esc(route.n)}</b><br>מסדרון ימי ממופה לתקופה ${esc(iso(fact.day_from))}–${esc(iso(fact.day_to))}.`+
  `<br>סוגי מטען המקושרים למסדרון בגרף: ${(fact.cargo_classes||[]).map(c=>`${cargoEmoji[c]||'◇'} ${esc(cargoLabel[c]||c)}`).join(' · ')||'לא צוינו'}.`+
  `<br><span style="color:#9a611b">שיוך צד ושליטה בנמלים לא אומתו. המסדרון אינו אספקה של הציר או של בעלות הברית, ולכן אין אנימציית מטען.</span>`+
  `<br>הסוגים אינם רשימת מטען מאומתת לכל שיירה או לכל יום.`);
 routeLines.push({code,fact,line,points});
}
function showRailForPlant(plant){
 if(selectedRail){flowLayer.removeLayer(selectedRail);selectedRail=null;}
 if(selectedPacket){map.removeLayer(selectedPacket.marker);const i=packets.indexOf(selectedPacket);
  if(i>=0)packets.splice(i,1);selectedPacket=null;}
 const node=(D.plink?.rail||[]).find(x=>x.id===plant.id);if(!node)return;
 let best=null,bestDist=.025;selectedRailSource=null;
 for(const line of rails){if(!rail.hasLayer(line))continue;
  const coords=D.rail[line._ridx];for(const c of coords){
   const d=Math.hypot((c[0]-node.nx)*Math.cos(node.ny*Math.PI/180),c[1]-node.ny);
   if(d<bestDist){bestDist=d;best=coords;selectedRailSource=line;}}}
 if(!best)return;
 const points=best.map(p=>[p[1],p[0]]);
 selectedRail=L.polyline(points,{renderer,color:'#e1982c',weight:4,opacity:.95,
  dashArray:'5,8',className:'ww2-route-flow'});
 selectedRail.bindPopup(`<b>מסילה סמוכה ל־${esc(plant.n)}</b><br>המסילה מתוארכת לתקופה.`+
  `<br><span style="color:#9a611b">תנועת סמל המוצר היא הדגמה משוערת בלבד. אין בגרף רישום של המטען שעבר בקטע הזה.</span>`);
 if(showSupply)selectedRail.addTo(flowLayer);
 if(!reduceMotion){const marker=L.marker(points[0],{icon:iconFor(industryEmoji[plant.ind]||'🏭'),interactive:false,keyboard:false,zIndexOffset:900});
  selectedPacket={marker,points,line:selectedRail,phase:0};packets.push(selectedPacket);}
}
let showSupply=true,showTroops=true;const troopLayer=L.layerGroup().addTo(map);
function updateSupply(day){if(selectedRail){const active=showSupply&&selectedRailSource&&rail.hasLayer(selectedRailSource);
 if(active&&!flowLayer.hasLayer(selectedRail))flowLayer.addLayer(selectedRail);
 else if(!active&&flowLayer.hasLayer(selectedRail))flowLayer.removeLayer(selectedRail);}
 for(const o of routeLines){const active=showSupply&&day>=o.fact.day_from&&day<=o.fact.day_to;
 if(active&&!flowLayer.hasLayer(o.line))flowLayer.addLayer(o.line);
 else if(!active&&flowLayer.hasLayer(o.line))flowLayer.removeLayer(o.line);}}
function updateTroops(day){troopLayer.clearLayers();if(!showTroops)return;
 for(const f of D.ftrk||[]){const t=f.t;if(!t?.length||day<t[0][0]||day>t.at(-1)[0])continue;
  let i=t.findIndex(p=>p[0]>=day);if(i<1)i=1;const a=t[i-1],b=t[i];
  const k=Math.max(0,Math.min(1,(day-a[0])/(b[0]-a[0]||1)));
  const pos=[a[2]+(b[2]-a[2])*k,a[1]+(b[1]-a[1])*k];
  const first=Math.max(0,i-6),tail=t.slice(first,i).map(p=>[p[2],p[1]]);tail.push(pos);
  L.polyline(tail,{color:'#a85e16',weight:2.8,opacity:.85,dashArray:'4,7'})
   .bindPopup(`תנועת כוח משוערת · ${esc(f.pol||'')}<br>עוצמה במודל: ~${fmt(f.st||0)} חיילים`+
    `<br>הנקודות שבין עוגני התנועה הן אינטרפולציה, לא תצפית יומית.`).addTo(troopLayer);
  L.circleMarker(pos,{radius:4,color:'#8d480d',weight:1.5,fillColor:'#e8a146',fillOpacity:.9})
   .bindPopup(`תנועת חיילים משוערת · ${esc(f.pol||'')}<br>~${fmt(f.st||0)} חיילים במודל`+
    `<br>מיקום יומי מחושב בין עוגנים, לא נצפה ישירות.`).addTo(troopLayer);
 }}

// New observations augment, but never overwrite or sum incompatible battle scopes.
for(const {b,m} of BAT){const e=G.battles[b.id];if(!e)continue;
 const obs=(label,arr)=>{if(!arr?.length)return'';
  const rows=arr.slice(0,3).map(o=>`${range(o.lo??0,o.hi??o.lo??0)}`+
    ` (${esc(o.from||'?')}–${esc(o.to||'?')}; ${esc((o.sources||[]).join(', '))})`);
  return `<br><b>${label} — תצפיות חדשות בגרף:</b> ${rows.join(' · ')}`+
   (arr.length>3?` · ועוד ${arr.length-3}`:'');};
 const extra=obs('כוח אדם',e.manpower)+obs('אבדות',e.losses);
 if(extra)m.getPopup().setContent(m.getPopup().getContent()+`<hr>`+extra+
  `<br><small>הטווחים עשויים לתאר צדדים או תתי־יחידות שונים; אין לסכום אותם.</small>`);
}

function querySupply({from,to,commodity='',origin='',destination='',plantId='',battleId=''}){
 const a=dayOf(from),b=dayOf(to);if(!Number.isFinite(a)||!Number.isFinite(b)||a>b)
  return {status:'invalid_range',message:'יש להזין טווח תאריכים תקין.'};
 const norm=s=>String(s||'').trim().toLowerCase();
 const commodityRequested=!!norm(commodity);
 const targetPlant=(D.plants||[]).find(p=>p.id===plantId||norm(p.n)===norm(plantId));
 const targetBattle=(D.bat||[]).find(x=>x.id===battleId||norm(x.n)===norm(battleId));
 const routes=routeLines.filter(r=>!targetPlant&&!targetBattle&&b>=r.fact.day_from&&a<=r.fact.day_to&&
  (!origin||norm(r.code).includes(norm(origin))||norm(r.fact.name).includes(norm(origin)))&&
  (!destination||norm(r.fact.name).includes(norm(destination))));
 const samples=routes.map(r=>{const convoys=r.fact.convoys.filter(c=>c.date&&dayOf(c.date)>=a&&dayOf(c.date)<=b);
  const ships=convoys.reduce((s,c)=>s+(Number(c.ships)||0),0);
  return {code:r.code,side:'unassigned',convoys:convoys.length,ships_known:ships,
   scenario_tons:ships&&!commodityRequested?[ships*2000,ships*8000]:null};});
 const linkedPorts=targetPlant?((D.plink?.poe)||[]).filter(p=>p.id===targetPlant.id):[];
 const relatedRouteNames=targetBattle?.rt||[];
 const portNameAllowed=p=>targetBattle?false:targetPlant?linkedPorts.some(x=>norm(x.p)===norm(p.n)):
  origin||destination?norm(p.n).includes(norm(origin||destination))||norm(p.n).includes(norm(destination||origin)):true;
 const portObservations=(D.sply||[]).filter(portNameAllowed).flatMap(p=>(p.periods||[])
  .filter(x=>dayOf(x.to)>=a&&dayOf(x.from)<=b)
  .map(x=>({port:p.n,side:'unassigned',from:x.from,to:x.to,metric:x.metric,min:x.min,max:x.max,source:p.src,locator:x.locator})));
 return {status:commodityRequested?'commodity_unlinked':'partial',from,to,commodity,
  target:targetPlant?{type:'plant',id:targetPlant.id,name:targetPlant.n}:targetBattle?{type:'battle',id:targetBattle.id,name:targetBattle.n}:null,
  route_samples:samples,port_observations:portObservations,side_assignment:'unverified',
  related_ports:linkedPorts.map(p=>({name:p.p,share:p.s,share_is_model:true})),
  related_routes:relatedRouteNames,
  caveat:commodityRequested?'אין בגרף שיוך מאומת של סחורה מסוימת למסלול, למפעל או לקרב. אומדן ספציפי יהיה בלתי מבוסס.':
   targetPlant||targetBattle?'אין בגרף כמות מטען משויכת ישירות ליעד הזה. קשרי נמל/מסדרון הם הקשר אפשרי בלבד, לא עדות להגעה.':
   'המדגם של השיירות אינו מלא. טווח הטונות הוא תרחיש המחשה של 2,000–8,000 טון לאונייה עם מספר אוניות ידוע, לא כמות אספקה שנמדדה.'};
}
window.WW2Atlas={querySupply,graphGeneratedAt:G.generated_at};

const panel=document.createElement('section');panel.id='ww2Enrich';panel.setAttribute('aria-label','זרימות ואומדנים');
panel.innerHTML=`<h2>זרימות ואומדנים</h2>
 <label><input type="checkbox" id="ww2SupplyToggle" checked> 🌊 מסדרונות ימיים ללא שיוך צד</label>
 <label><input type="checkbox" id="ww2TroopToggle" checked> 🟠 תנועת חיילים משוערת</label>
 <small>מסילה חומה רציפה: מתוארכת ומאושרת לתקופה. קו כתום מקווקו: אומדן, לא משלוח מתועד.</small>
 <details><summary>בדיקת אספקה בין תאריכים</summary>
 <label>מתאריך <input type="date" id="ww2From" value="1944-01-01"></label>
 <label>עד תאריך <input type="date" id="ww2To" value="1944-12-31"></label>
 <label>סחורה (אפשר להשאיר ריק) <input type="text" id="ww2Commodity" placeholder="למשל דלק"></label>
 <label>מסלול / נמל מוצא (אפשר להשאיר ריק) <input type="text" id="ww2Origin" placeholder="למשל HX"></label>
 <label>נמל יעד / מפעל / קרב (אפשר להשאיר ריק) <input type="text" id="ww2Target" placeholder="למשל Cherbourg או שם קרב"></label>
 <button id="ww2Estimate" type="button">הצג נתונים ואומדן</button><div class="ww2result" id="ww2Result"></div></details>`;
document.body.append(panel);
panel.querySelector('#ww2SupplyToggle').onchange=e=>{showSupply=e.target.checked;updateSupply(+slider.value);};
panel.querySelector('#ww2TroopToggle').onchange=e=>{showTroops=e.target.checked;updateTroops(+slider.value);};
panel.querySelector('#ww2Estimate').onclick=()=>{const val=id=>panel.querySelector(id).value;
 const target=val('#ww2Target').trim(),needle=target.toLowerCase();
 const plant=(D.plants||[]).find(p=>needle&&(p.id===target||p.n.toLowerCase().includes(needle)));
 const battle=(D.bat||[]).find(b=>needle&&(b.id===target||b.n.toLowerCase().includes(needle)));
 const result=querySupply({from:val('#ww2From'),to:val('#ww2To'),commodity:val('#ww2Commodity'),
  origin:val('#ww2Origin'),destination:!plant&&!battle?target:'',plantId:plant?.id||'',battleId:battle?.id||''});
 const el=panel.querySelector('#ww2Result');if(result.status==='invalid_range'){el.textContent=result.message;return;}
 let html=`<b>${esc(result.from)}–${esc(result.to)}</b><br>`;
 if(result.target)html+=`יעד: ${esc(result.target.name)} (${result.target.type==='plant'?'מפעל':'קרב'})<br>`;
 if(result.related_ports.length)html+=`נמלים מקושרים: ${result.related_ports.slice(0,4).map(x=>esc(x.name)).join(' · ')} (קישור מודלי, לא תנועת מטען נצפית)<br>`;
 if(result.related_routes.length)html+=`מסדרונות סמוכים: ${result.related_routes.slice(0,4).map(esc).join(' · ')}<br>`;
 for(const p of result.port_observations.slice(0,8))html+=`${esc(p.port)}: ${range(p.min,p.max)} טון ארוך/יום (${p.metric==='port_capacity_tons_day'?'קיבולת':'פריקה נמדדת'}; ${esc(p.from)}–${esc(p.to)})<br>`;
 for(const s of result.route_samples.filter(x=>x.convoys).slice(0,8))html+=`${esc(s.code)}: ${s.convoys} ${s.convoys===1?'שיירה':'שיירות'} במדגם; ${s.ships_known?fmt(s.ships_known)+' אוניות עם ספירה':'מספר אוניות חסר'}`+
  `${s.scenario_tons?' · תרחיש מטען: '+range(...s.scenario_tons)+' טון':''}<br>`;
 if(!result.port_observations.length&&!result.route_samples.some(x=>x.convoys))html+='לא נמצאו תצפיות כמותיות בטווח זה.<br>';
 html+=`<small>${esc(result.caveat)}</small>`;el.innerHTML=html;};

const originalTick=tick;tick=function(day){originalTick(day);updateRails(day);updateSupply(day);updateTroops(day);};
updateRails(+slider.value);updateSupply(+slider.value);updateTroops(+slider.value);
if(!reduceMotion){let last=performance.now();const run=now=>{const dt=Math.min(.08,(now-last)/1000);last=now;
 for(const p of packets){const show=showSupply&&flowLayer.hasLayer(p.line);
  if(show&&!map.hasLayer(p.marker))p.marker.addTo(map);
  else if(!show&&map.hasLayer(p.marker))map.removeLayer(p.marker);
  if(!show)continue;p.phase=(p.phase+dt*.085)%1;
  const ix=p.phase*(p.points.length-1),i=Math.min(p.points.length-2,Math.floor(ix)),f=ix-i;
  p.marker.setLatLng([p.points[i][0]+(p.points[i+1][0]-p.points[i][0])*f,
    p.points[i][1]+(p.points[i+1][1]-p.points[i][1])*f]);}
 requestAnimationFrame(run);};requestAnimationFrame(run);}
})();
