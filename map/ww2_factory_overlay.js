/* Source-backed Soviet and Japanese factory coverage, aggregated by map scale.
   2026-09-24: off by default (toggle in 'זרימות ואומדנים'); the marker says what it is in words;
   records inside Axis-held territory on the shown day are hidden. */
(()=>{'use strict';
const catalog=window.WW2_FACTORY_CATALOG;
if(!catalog?.plants?.length){window.onerror?.('קטלוג מפעלי ברית המועצות ויפן לא נטען','',0);return;}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const emoji={munitions:'💣',vehicle_tank:'🛡️',ordnance:'🔧',oil:'⛽',aircraft:'✈️',
 shipyard:'🚢',rail_facility:'🚂',electronics:'🔌'};
const css=document.createElement('style');css.textContent=`
.ww2-factory-group{background:transparent;border:0}
.ww2-factory-group span{position:relative;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
 border-radius:50%;background:#fbfaf6;border:2px solid var(--side);font-size:14px;line-height:1;box-shadow:0 1px 4px #0004}
.ww2-factory-group span b{position:absolute;top:-7px;left:-8px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;
 background:var(--side);color:#fff;font:700 10px/16px Heebo,Arial,sans-serif;text-align:center;box-sizing:border-box}
.ww2-factory-list{direction:rtl;max-width:300px;font:12px Heebo,Arial,sans-serif}
.ww2-factory-list button{display:block;width:100%;padding:4px;text-align:right;border:0;
 background:transparent;cursor:pointer;font:inherit}
.ww2-factory-list button:hover{background:#edf3f7}
.ww2-factory-list small{display:block;color:#716756;font-size:10px}
`;document.head.append(css);
const supplemental=L.layerGroup().addTo(map);
let enabled=true;
const indHe={munitions:'תחמושת',vehicle_tank:'טנקים ושריון',ordnance:'תותחים וחימוש',oil:'דלק',aircraft:'מטוסים',
 shipyard:'מספנה',rail_facility:'רכבת',electronics:'אלקטרוניקה'};
let fgIndex=null;
function axisHeld(x,y,day){
 const G=(typeof FG!=='undefined')?FG:null; if(!G||!G.cx)return false;
 if(!fgIndex){fgIndex=new Map();for(let i=0;i<G.cx.length;i++)fgIndex.set(G.cx[i]*1000+G.cy[i],i);}
 const i=fgIndex.get(Math.round((x-G.bbox[0])/G.step)*1000+Math.round((y-G.bbox[1])/G.step));
 if(i==null)return false;
 const f=G.fall[i],fr=G.free[i];
 return (f===-1||(f>0&&day>=f))&&!(fr>0&&day>=fr);}
const box=document.getElementById('ww2Enrich');
if(box){const label=document.createElement('label');label.style.display='block';
 label.innerHTML=`<input type="checkbox" id="ww2FactoryCatalogToggle" checked> 🏭 קטלוג מפעלי ברה״מ ומספנות יפן (${catalog.plants.length}) — מוסתר בשטח שבשליטת הציר`;
 box.append(label);
 label.querySelector('input').onchange=e=>{enabled=e.target.checked;render();};}
const byId=new Map(catalog.plants.map(p=>[p.id,p]));
const currentYear=()=>new Date(Date.UTC(1937,0,1)+Number(slider.value)*864e5).getUTCFullYear();
function render(){supplemental.clearLayers();if(!enabled||!map.hasLayer(plantLayer))return;
 const dayNow=Number(slider.value);
 const bounds=map.getBounds().pad(.12),z=map.getZoom(),year=currentYear();
 const step=z<5?5:z<6?3:z<7?1.5:z<9?.5:.08,buckets=new Map();
 for(const p of catalog.plants){if(p.year_from>year||p.year_to<year||!bounds.contains([p.y,p.x]))continue;
  if(axisHeld(p.x,p.y,dayNow))continue;
  const key=`${p.c}:${Math.round(p.x/step)}:${Math.round(p.y/step)}`;
  let bucket=buckets.get(key);if(!bucket){bucket=[];buckets.set(key,bucket);}bucket.push(p);}
 for(const bucket of buckets.values()){
  const c=bucket[0].c,side=c==='Japan'?'#a63c2e':'#2b6ca3';
  const x=bucket.reduce((a,p)=>a+p.x,0)/bucket.length;
  const y=bucket.reduce((a,p)=>a+p.y,0)/bucket.length;
  const industries=new Map();for(const p of bucket)industries.set(p.ind,(industries.get(p.ind)||0)+1);
  const dominant=[...industries].sort((a,b)=>b[1]-a[1])[0]?.[0];
  const size=bucket.length>1?30:26;
  const badge=bucket.length>1?`<b>${bucket.length}</b>`:'';
  const icon=L.divIcon({className:'ww2-factory-group',html:`<span style="--side:${side};width:${size}px;height:${size}px">${emoji[dominant]||'🏭'}${badge}</span>`,
   iconSize:[size,size],iconAnchor:[size/2,size/2]});
  const mix=[...industries].sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${emoji[k]||'🏭'} ${indHe[k]||k}${n>1?' ×'+n:''}`).join(' · ');
  const places=[...new Set(bucket.map(p=>p.city))].slice(0,4).join(' · ');
  const rows=bucket.slice(0,15).map(p=>`<button type="button" data-ww2-factory="${escape(p.id)}">${emoji[p.ind]||'🏭'} ${escape(p.n)}<small>${escape(p.city)} · ${escape(p.ind)} · ${p.year_from}–${p.year_to}</small></button>`).join('');
  const remainder=bucket.length>15?`<small>ועוד ${bucket.length-15} רשומות באזור הזה; חפש שם מפעל או התקרב במפה.</small>`:'';
  const html=`<div class="ww2-factory-list"><b>${c==='Japan'?'יפן — מספנות':'ברית המועצות — מפעלים'}: ${bucket.length} רשומות</b><br>${escape(places)}`+
   `<small>הנקודה היא מרכז עיר/מטרופולין, לא כתובת מפעל. מספר הרשומות אינו כמות ייצור.</small>${rows}${remainder}</div>`;
  L.marker([y,x],{icon,title:`${c==='Japan'?'יפן':'ברית המועצות'} · ${bucket.length>1?bucket.length+' מפעלים: ':''}${mix}`})
   .bindPopup(html,{maxWidth:320}).addTo(supplemental);
 }
}
document.addEventListener('click',e=>{const id=e.target.closest('[data-ww2-factory]')?.dataset.ww2Factory;
 if(id&&byId.has(id)){e.stopPropagation();map.closePopup();window.WW2BattleSupply?.showFactory?.(id);}});
map.on('moveend zoomend',render);
map.on('layeradd layerremove',e=>{if(e.layer===plantLayer)render();});
slider.addEventListener('input',()=>{if(enabled)render();});
const previousTick=tick;
tick=function(day){previousTick(day);if(enabled&&map.hasLayer(plantLayer)&&(currentYear()!==tick._factoryYear||day%7===0)){
 tick._factoryYear=currentYear();render();}};
render();
window.WW2FactoryCatalog={count:catalog.plants.length,byId,render};
})();
