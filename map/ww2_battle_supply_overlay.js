/* 100-battle supply explorer. A route is a candidate unless every link is sourced. */
(()=>{'use strict';
const S=window.WW2_BATTLE_SUPPLY_100,G=window.WW2_GRAPH_DATA,K=window.WW2_ROUTE_KNOWLEDGE;
if(!S||!G){window.onerror?.('שכבת 100 הקרבות לא נטענה','',0);return;}
const byId=new Map(S.battles.map(b=>[b.id,b]));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Math.round(n).toLocaleString('en-US');
const dayDate=d=>new Date(Date.UTC(1937,0,1)+d*864e5).toISOString().slice(0,10);
const dayOf=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?Math.round((Date.parse(s+'T00:00:00Z')-Date.UTC(1937,0,1))/864e5):null;
const cargoEmoji={food:'🍞',pol:'⛽',vehicles:'🚛',ordnance_weapons:'💣',
 aircraft:'✈️',raw_material:'⚙️'};
const cargoLabel={food:'מזון',pol:'דלק',vehicles:'כלי רכב',ordnance_weapons:'תחמושת וחימוש',
 aircraft:'מטוסים',raw_material:'חומרי גלם'};
const factoryEmoji={vehicle_tank:'🛡️',munitions:'💣',ordnance:'💣',oil:'⛽',
 oil_chemical:'⛽',chemical:'🧪',aircraft:'✈️',aero_engine:'🛠️',rail_facility:'🚂',
 depot:'🏬',shipyard:'🚢',steel:'⚙️',submarine:'🚢',power:'⚡',aluminium:'🔩',
 machine_tool:'🔧',bearing:'⚙️',mixed:'🏭',equipment:'🧰',electronics:'🔌'};
const categoryToCargo={armor:'vehicles',arms:'ordnance_weapons',fuel:'pol',chem:'chem',air:'aircraft',rail:'raw_material'};
const supplyCategoryEmoji={armor:'🛡️',arms:'💣',fuel:'⛽',chem:'🧪',air:'✈️',rail:'🚂',food:'🍞'};
const supplyCategoryLabel={armor:'רכב וטנקים',arms:'תחמושת',fuel:'דלק',chem:'כימיה',air:'מטוסים',rail:'ציוד מסילות',food:'מזון'};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const css=document.createElement('style');css.textContent=`
.ww2-factory-emoji{background:transparent;border:0;text-align:center;line-height:1;filter:drop-shadow(0 1px 2px #fff)}
.ww2-factory-emoji span{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;
 background:#f9f5eccc;border:2px solid var(--factory-side);box-shadow:0 1px 5px #0003}
.ww2-battle-emoji{background:transparent;border:0;font-size:18px;line-height:24px;text-shadow:0 1px 3px #fff}
.ww2-supply-context{font:12px Heebo,Arial,sans-serif;direction:rtl;max-width:440px}
.ww2-supply-context h3{font-size:12px;margin:9px 0 3px}
.ww2-supply-context button{font:inherit;border:1px solid #bbab8e;border-radius:5px;background:#fff9ee;
 cursor:pointer;padding:3px 7px;margin:2px}
.ww2-supply-context .supply-item{border-top:1px solid #e2d9c9;padding:6px 0;line-height:1.5}
.ww2-supply-context .supply-note{color:#786a55;font-size:10.5px;line-height:1.45}
.ww2-supply-context .supply-gap{color:#9b5c1a}.ww2-supply-context .supply-fact{color:#1d6245}
.ww2-supply-context .ww2-base-facts{border-top:1px solid #ddd;margin-top:8px;padding-top:6px}
.ww2-supply-context .ww2-base-facts summary{cursor:pointer;color:#304c69;font-weight:600}
`;document.head.append(css);

// Replace anonymous dots with product-specific symbols, retaining the popup
// and the source-aware size proxy from the underlying plant renderer.
const earlierDrawPlants=drawPlants;
drawPlants=function(){earlierDrawPlants();
 const visible=(D.plants||[]).filter(p=>map.getZoom()>=5||BOMB[p.id]);
 const old=plantLayer.getLayers();old.forEach((m,i)=>{const p=visible[i];if(!p)return;
  const n=G.plants[p.id]?.product_types||0,size=Math.round(Math.max(18,Math.min(30,18+3*Math.sqrt(n))));
  const emoji=factoryEmoji[p.ind]||'🏭',side=p.side==='axis'?'#a63c2e':'#2b6ca3';
  const icon=L.divIcon({className:'ww2-factory-emoji',html:`<span style="--factory-side:${side};width:${size}px;height:${size}px;font-size:${size-7}px">${emoji}</span>`,
   iconSize:[size+4,size+4],iconAnchor:[(size+4)/2,(size+4)/2]});
  const marker=L.marker([p.y,p.x],{icon,title:p.n,keyboard:true});
  const popup=m.getPopup();if(popup)marker.bindPopup(popup.getContent());
  marker.on('click',()=>showFactory(p.id));
  plantLayer.removeLayer(m);marker.addTo(plantLayer);
 });};
if(map.hasLayer(plantLayer))drawPlants();

const routeLayer=L.layerGroup().addTo(map),priorLayer=L.layerGroup().addTo(map),hubs=L.layerGroup().addTo(map);
const animated=[];let chosenBattle=null,chosenClass='',chosenSide='',queryRange=null;
const sideLabel=s=>s==='axis'?'מדינות הציר':s==='allied'?'בעלות הברית':'צד לא מאומת';
const icon=e=>L.divIcon({className:'ww2-battle-emoji',html:esc(e),iconSize:[24,24],iconAnchor:[12,12]});
function clearScene(){routeLayer.clearLayers();priorLayer.clearLayers();
 for(const a of animated)map.removeLayer(a.marker);animated.length=0;}
function addAnimated(line,points,emoji,phase){if(reduced||points.length<2)return;
 const marker=L.marker(points[0],{icon:icon(emoji),interactive:false,keyboard:false,zIndexOffset:1000}).addTo(map);
 animated.push({line,points,marker,phase});}
function cargoFilter(s){return (!chosenSide||s.recipient_side===chosenSide)&&
 (!chosenClass||categoryToCargo[s.category]===chosenClass||s.category===chosenClass);}
function hubCategories(b){return (b.missing_categories||[]).filter(c=>!chosenClass||
  c===chosenClass||categoryToCargo[c]===chosenClass);}
function drawHub(b){const h=b.origin_hub;if(!h||chosenSide&&h.recipient_side!==chosenSide)return;
 const pts=(h.coords||[h.coord,b.coord]).map(p=>[p[1],p[0]]);
 const routeKnown=!!h.recipient_side&&(h.method==='terrain_road_model'||h.method==='confirmed_period_rail_model');
 const line=L.polyline(pts,{color:h.recipient_side?'#07818a':'#888',weight:2.5,opacity:.78,dashArray:'3,8',
  className:'ww2-route-flow'});
 line.bindPopup(`<b>🧭 ${esc(h.name)} → ${esc(b.name)}</b>`+
  `<br>${h.route_km!=null?'~'+fmt(h.route_km)+' ק״מ במסלול שטח/דרכים מודלי':
   '~'+fmt(h.straight_km)+' ק״מ בקו אווירי; מרחק מסלול אינו ידוע'}`+
  `<br>${esc(h.basis)}`+
  `<br><b>${h.recipient_side?'צד משוער: '+sideLabel(h.recipient_side):'שיוך הצד אינו ידוע; לא מוצגת תנועת אספקה.'}</b>`+
  `<br>לא תועד מעבר המטען הזה; זוהי נקודת מוצא/מעבר מועמדת בלבד.`).addTo(routeLayer);
 L.marker(pts[0],{icon:icon(h.kind==='port'?'⚓':h.kind==='rail_facility'||h.kind==='station'?'🚂':'🧭'),
  title:h.name}).bindPopup(`<b>${esc(h.name)}</b><br>עוגן גאוגרפי מועמד, לא מקור ייצור או משלוח מוכח.`).addTo(routeLayer);
 const categories=hubCategories(b).slice(0,4);
 if(routeKnown)for(const [i,c] of categories.entries())addAnimated(line,pts,`${supplyCategoryEmoji[c]||'◇'}?`,(i+.4)/(categories.length+1));}
function drawSupply(b){clearScene();
 const sources=b.sources.filter(cargoFilter);
 for(const s of sources){if(s.via==='blocked_by_control_model')continue;
  const color=s.recipient_side==='axis'?'#a63c2e':'#2b6ca3';
  const pts=s.via==='rail_corridor_model'&&s.coords?.length>1?s.coords.map(p=>[p[1],p[0]]):
    [[s.plant_coord[1],s.plant_coord[0]],[b.coord[1],b.coord[0]]];
  const railCandidate=s.via==='rail_corridor_model';
  const controlSupported=railCandidate&&s.control_check?.own>0&&s.control_check?.opposite===0;
  const line=L.polyline(pts,{color:railCandidate?color:'#9d927f',weight:railCandidate?3.2:1.5,
    opacity:railCandidate?.85:.45,dashArray:railCandidate?'7,10':'2,10',
    className:controlSupported&&!s.plant_source?'ww2-route-flow':''});
  line.bindPopup(`<b>${esc(s.emoji)} ${esc(s.plant)} → ${esc(b.name)}</b>`+
   `<br>${esc(s.category_he)} · ${esc(sideLabel(s.recipient_side))} · ~${fmt(s.distance_km)} ק״מ בקו אווירי`+
   `<br><b>${railCandidate?'מסדרון מסילה מודלי':'אין תוואי מסילה מחובר'}</b>`+
   `<br>${s.plant_source?'ענף המפעל במרשם ומיקום ברמת עיר; סוג המטען מותאם בקירוב':'ענף ומוצרים משויכים בגרף'}. עצם המשלוח לקרב לא מתועד. `+
   `${controlSupported?'בדיקת שליטה חלקית בלבד':'שליטה במסלול אינה ידועה; לא מוצגת תנועת מטען'}. שמישות המסילה לא אומתה.`+
   (railCandidate?`<br>חיבורי צמתים במודל עד ${fmt(s.max_junction_gap_km||0)} ק״מ.`:''));
  line.addTo(routeLayer);
  if(controlSupported&&!s.plant_source){addAnimated(line,pts,s.emoji,.2);addAnimated(line,pts,s.emoji,.65);}
  L.marker([s.plant_coord[1],s.plant_coord[0]],{icon:icon(factoryEmoji[s.industry]||s.emoji),
    title:s.plant}).bindPopup(`<b>${esc(s.plant)}</b><br>${esc(s.category_he)}<br>קשר לקרב: מועמד, לא משלוח מאומת.`).addTo(routeLayer);
 }
 drawHub(b);
 for(const p of b.previous_battles){if(!p.shared_sides?.length||chosenSide&&!p.shared_sides.includes(chosenSide)||
  !chosenSide&&p.shared_sides.length!==1)continue;
  const pts=p.coords?.length>1?p.coords.map(c=>[c[1],c[0]]):
  [[p.coord[1],p.coord[0]],[b.coord[1],b.coord[0]]];
  L.polyline(pts,{color:'#71549a',weight:1.8,opacity:.62,dashArray:'2,7'})
   .bindPopup(`<b>⚔ ${esc(p.name)}</b> → ${esc(b.name)}`+
    `<br>${p.route_km!=null?'~'+fmt(p.route_km)+' ק״מ בתוואי מסילה מודלי':'תוואי מעבר אינו ידוע'}`+
    `<br>צד משתתף משותף: ${esc(p.shared_sides.map(sideLabel).join(', '))}. אין ראיה שאותם חיילים או ציוד נעו ביניהם.`)
   .addTo(priorLayer);
  if(p.via==='rail_movement_candidate')addAnimated(null,pts,'🪖?',.45);
  L.marker(pts[0],{icon:icon('⚔️'),title:p.name}).bindPopup(`<b>${esc(p.name)}</b><br>${dayDate(p.day)}<br>קרב קודם, לא מקור אספקה מוכח.`).addTo(priorLayer);}
 const seaCandidates=D.sea.routes.map(r=>{const code=r.n.split(' — ')[0],fact=G.routes[code];
  if(!fact||b.day_from<fact.day_from||b.day_from>fact.day_to)return null;
  const near=Math.min(...r.c.map(p=>distanceKm(p,b.coord)));
  return {code,near,classes:fact.cargo_classes||[]};}).filter(x=>x&&x.near<600)
  .sort((a,b)=>a.near-b.near).slice(0,2);
 return {sources,seaCandidates};}
function distanceKm(a,b){const p=(b[1]-a[1])*Math.PI/180,q=(b[0]-a[0])*Math.PI/180;
 const h=Math.sin(p/2)**2+Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(q/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));}

// The 100 records are a saved data index, not a permanent 100-battle window.
// A single existing Leaflet popup is enriched only when its battle is selected.
const details=document.createElement('div');
const battleMarkers=new Map(BAT.filter(({b})=>byId.has(b.id)).map(({b,m})=>[b.id,m]));
const basePopups=new Map([...battleMarkers].map(([id,m])=>[id,m.getPopup()?.getContent()||'']));
const contextPopup=L.popup({maxWidth:460,maxHeight:380,autoPan:true});
function presentContext(point=map.getCenter()){
 contextPopup.setLatLng(point).setContent(`<div class="ww2-supply-context">${details.innerHTML}</div>`).openOn(map);}
function presentBattle(b){const marker=battleMarkers.get(b.id);if(!marker){presentContext([b.coord[1],b.coord[0]]);return;}
 const popup=marker.getPopup();popup.options.maxWidth=460;popup.options.maxHeight=380;
 marker.setPopupContent(`<div class="ww2-supply-context" data-supply-battle="${esc(b.id)}">${details.innerHTML}`+
  `<details class="ww2-base-facts"><summary>נתוני הקרב המקוריים, כוח ואבדות</summary>${basePopups.get(b.id)}</details></div>`);
 marker.openPopup();loadSavedAnswer(b.id);}
async function loadSavedAnswer(id){try{const response=await fetch('./ww2_battle_answers.json?ts='+Date.now(),{cache:'no-store'});
 if(!response.ok)return;const data=await response.json();if(data.version!==1)return;
 const answer=data.answers?.[id];if(!answer||chosenBattle?.id!==id)return;
 const marker=battleMarkers.get(id),popup=marker?.getPopup();if(!popup?.isOpen())return;
 const sources=(answer.passages||[]).slice(0,5).map(p=>`<div class="supply-note">📖 ${esc(p.source_title||p.source_id||'מקור')} · ${esc(p.passage_id||'')}<br>${esc(p.excerpt||'')}</div>`).join('');
 const box=`<div class="supply-item"><b>${answer.status==='researched'?'🧠 ניתוח צ׳אט שמור':'⚠️ פער ראיות שנבדק בצ׳אט'}</b><br>${esc(answer.summary)}`+
  `<br><span class="supply-note">${esc(answer.uncertainty||'מקטעים לא מוכחים נשארים אומדן.')} · נשמר ${esc(answer.saved_at||'')}</span>${sources}</div>`;
 marker.setPopupContent(`<div class="ww2-supply-context" data-supply-battle="${esc(id)}">${box}${details.innerHTML}`+
  `<details class="ww2-base-facts"><summary>נתוני הקרב המקוריים, כוח ואבדות</summary>${basePopups.get(id)}</details></div>`);
 }catch{ /* Baseline data remains available without a saved chat answer. */ }}
function showBattle(id,{focus=true}={}){const b=byId.get(id);if(!b)return false;
 chosenBattle=b;
 if(+slider.value<b.day_from||+slider.value>b.day_to){slider.value=b.day_from;paintTrack();tick(b.day_from);}
 const {sources,seaCandidates}=drawSupply(b);
 let html=`<h3>${esc(b.name)}</h3><div>${dayDate(b.day_from)}${b.day_to!==b.day_from?' – '+dayDate(b.day_to):''}`+
  `${b.front?' · '+esc(b.front):''}</div>`+
  `<div class="supply-note">נתוני בסיס שמורים מראש מן הגרף וממודל תוואי; ניתוח צ׳אט שמור יתווסף כאן אם קיים. דירוג #${b.rank} לפי אומדן גודל, לא דירוג היסטורי מוסכם.</div>`;
 if(queryRange&&(queryRange.from||queryRange.to))html+=`<div class="supply-note">בקשת צ׳אט: ${esc(queryRange.from||'תחילת הקרב')}–${esc(queryRange.to||'סוף הקרב')}.
 טווח הבקשה מסנן הקשר בלבד; אין תיעוד יומי של כל משלוח.</div>`;
 html+=`<div class="supply-note">צדדים מזוהים בקרב: ${b.recipient_sides?.length?b.recipient_sides.map(sideLabel).join(' · '):'לא אומתו'}. שיוך לפי יחידות משתתפות/רשימת לוחמים; אינו הוכחת משלוח.</div>`;
 html+=`<h3>שרשרת ייצור → מעבר → קרב — לפי צד</h3>`;
 if(!sources.length)html+=`<div class="supply-gap">אין מפעל מועמד המשויך לצד ולסוג שנבחרו. לא יוצג מסלול מצד אחר.</div>`;
 for(const side of ['allied','axis']){const grouped=sources.filter(s=>s.recipient_side===side);
  if(!grouped.length)continue;html+=`<h3>${side==='allied'?'🔵':'🔴'} ${sideLabel(side)}</h3>`;
 for(const s of grouped){const rail=s.via==='rail_corridor_model',blocked=s.via==='blocked_by_control_model';
  html+=`<div class="supply-item"><b>${esc(s.emoji)} ${esc(s.category_he)}</b> · ${esc(s.plant)}`+
   `<br><span class="supply-note">${esc(s.country)} · ${esc(sideLabel(s.recipient_side))}`+
   ` · ${fmt(s.distance_km)} ק״מ בקו אווירי${s.route_km!=null?' · ~'+fmt(s.route_km)+' ק״מ בתוואי מסילה מודלי':''}</span>`+
   `<br><span class="${rail&&s.control_check?.own>0?'supply-fact':'supply-gap'}">${blocked?'נפסל: בדגימות התוואי נמצאה שליטה של הצד הנגדי; אין קו או אנימציה':rail?`מסילה מתוארכת → קישור תחנות מודלי → קרב; ${s.control_check?.own>0?'בדיקת שליטה חלקית':'שליטה במסלול לא ידועה — ללא אנימציית מטען'}`:'פער: לא נמצא תוואי מסילה מחובר'}</span>`+
   `<br><span class="supply-note">${s.product_types.length?'מוצרים בגרף: '+s.product_types.map(esc).join(' · '):'המוצר המדויק אינו מפורט'}`+
   `${s.plant_source?'. סיווג הענף הוא ממרשם המפעלים; הנקודה היא מרכז עיר, לא כתובת המפעל':''}`+
   `. משלוח ספציפי לקרב ושמישות המסילה אינם מתועדים. ${s.control_check?.unknown||0} דגימות שליטה לא ידועות.</span></div>`;}}
 const hub=b.origin_hub,missing=hubCategories(b);
 if(hub&&(!chosenSide||hub.recipient_side===chosenSide))html+=`<h3>🧭 עוגן אזורי ללא קישור משלוח ישיר</h3>`+
  `<div class="supply-item"><b>${hub.kind==='port'?'⚓':hub.kind==='rail_facility'||hub.kind==='station'?'🚂':'🧭'} ${esc(hub.name)}</b>`+
  `<br>${hub.route_km!=null?'~'+fmt(hub.route_km)+' ק״מ במסלול שטח/דרכים מחושב':
   '~'+fmt(hub.straight_km)+' ק״מ בקו אווירי; מרחק המסלול אינו ידוע'}`+
  `<br><span class="supply-note">${esc(hub.basis)}. ${hub.recipient_side?'שיוך צד משוער: '+sideLabel(hub.recipient_side):'שיוך הצד אינו ידוע; אין אנימציית מטען.'}</span>`+
  (missing.length?`<br><span class="supply-gap">סוגי אספקה לבדיקה: ${missing.map(c=>`${supplyCategoryEmoji[c]} ${supplyCategoryLabel[c]}`).join(' · ')}. אין ראיה שהם עברו כאן.</span>`:'')+
  `<br><span class="supply-note">נקודת מעבר אפשרית בלבד; אין בכך הוכחה למקור הייצור, לצד המחזיק או למשלוח לקרב.</span></div>`;
 const food=seaCandidates.filter(x=>x.classes.includes('food'));
 html+=`<div class="supply-item"><b>🍞 מזון</b><br>${food.length?
  `מסדרון ימי סמוך עם מחלקת מזון: ${food.map(x=>esc(x.code)).join(' · ')}`:
  hub?.recipient_side&&(!chosenSide||hub.recipient_side===chosenSide)?`נקודת מעבר אזורית של ${esc(sideLabel(hub.recipient_side))}: ${esc(hub.name)}; אין ראיה שמזון עבר בה.`:
  'לא נמצא מקור מזון ממוקם או מסדרון מזון סמוך שמקושר לקרב.'}`+
  `<br><span class="supply-note">אין בגרף שרשרת מפעל מזון → קרב. אומדן קרבה אינו הוכחת הגעה.</span></div>`;
 if(seaCandidates.length)html+=`<h3>מסדרונות ימיים סמוכים</h3>`+seaCandidates.map(x=>
  `<div>${esc(x.code)} · ~${fmt(x.near)} ק״מ · ${x.classes.map(cargo=>`${cargoEmoji[cargo]||'◇'} ${esc(cargoLabel[cargo]||cargo)}`).join(' · ')}`+
  `<br><span class="supply-note">סוגי מטען המשויכים למסדרון; לא שיירה מסוימת ולא אספקה שהגיעה לקרב.</span></div>`).join('');
 const priorSameSide=b.previous_battles.filter(p=>p.shared_sides?.length&&
  (chosenSide?p.shared_sides.includes(chosenSide):p.shared_sides.length===1));
 if(priorSameSide.length)html+=`<h3>קרבות קודמים עם צד משתתף משותף</h3>`+
  priorSameSide.map(p=>byId.has(p.id)?
   `<button type="button" data-battle="${esc(p.id)}">⚔️ ${esc(p.name)} · ${dayDate(p.day)}${p.route_km!=null?' · ~'+fmt(p.route_km)+' ק״מ במסילה מודלית':''}</button>`:
   `<div>⚔️ ${esc(p.name)} · ${dayDate(p.day)}${p.route_km!=null?' · ~'+fmt(p.route_km)+' ק״מ במסילה מודלית':''}</div>`).join('')+
  `<div class="supply-note">רצף קרבות הוא הקשר זמן ומקום, לא ראיה להעברת אספקה ביניהם.</div>`;
 html+=`<div class="supply-note" style="margin-top:8px;border-top:1px solid #ddd;padding-top:5px">`+
  `${b.graph_strength_observations} תצפיות כוח אדם · ${b.graph_loss_observations} תצפיות אבדות בגרף.`+
  ` נתיבי האספקה המוצגים הם מועמדים ולא שרשראות משלוח מאומתות.</div>`;
 details.innerHTML=html;
 if(focus)map.flyTo([b.coord[1],b.coord[0]],Math.max(5,Math.min(7,map.getZoom())),{duration:.55});
 presentBattle(b);
 return true;}
function showFactory(id){const p=D.plants.find(x=>x.id===id)||
 window.WW2_FACTORY_CATALOG?.plants?.find(x=>x.id===id);if(!p)return false;
 const k=K?.plants?.[id],from=dayOf(queryRange?.from),to=dayOf(queryRange?.to);
 const relevant=S.battles.map(b=>({b,links:b.sources.filter(x=>x.plant_id===id&&
  x.via!=='blocked_by_control_model'&&(!chosenSide||x.recipient_side===chosenSide))}))
  .filter(x=>x.links.length&&(from==null||x.b.day_to>=from)&&(to==null||x.b.day_from<=to)).slice(0,12);
 chosenBattle=null;clearScene();
 const sourced=p.source?`<div class="supply-note">מקור: ${esc(p.source)}${p.locator?' · '+esc(p.locator):''}. `+
  `מיקום ${p.geo_precision==='metro'?'מרכז מטרופולין משוער':'מרכז עיר'}, לא כתובת המפעל. `+
  `תיארוך פעילות ברמת שנה: ${p.year_from}–${p.year_to}.`+
  (p.evacuated?' הרשומה מסומנת כמפעל שפונה; מיקום העבודה בכל תאריך אינו מאומת.':'')+
  (p.coverage_note?' '+esc(p.coverage_note):'')+`</div>`:'';
 const measured=p.output?`<div class="supply-fact">תפוקה בסקר 1941–1945: `+
  [p.output.merchant_grt!=null?`${fmt(p.output.merchant_grt)} טונות ברוטו של אוניות סוחר`:null,
   p.output.naval_displacement_t!=null?`${fmt(p.output.naval_displacement_t)} טונות הדחק של כלי שיט צבאיים`:null]
   .filter(Boolean).join(' · ')+`. היחידות אינן ניתנות לחיבור זו לזו.</div>`:'';
 details.innerHTML=`<h3>${factoryEmoji[p.ind]||'🏭'} ${esc(p.n)}</h3>`+
  `<div>${esc(p.c||'')} · ${esc(p.ind||'')}</div>`+
  sourced+measured+
  `<div class="supply-note">${p.source?'ענף מקור: '+esc(p.source_industry||p.ind):'מוצרים בגרף: '+((k?.products||G.plants[id]?.products||[]).map(esc).join(' · ')||'לא פורטו מוצרים')}. ${p.output?'כמויות אחרות אינן ידועות.':'כמות הייצור/היצוא אינה ידועה.'}</div>`+
  `<h3>🚢 נמלי יציאה אפשריים לפי מודל ישן</h3>`+
  ((k?.candidate_ports||[]).length?(k.candidate_ports||[]).map(q=>`<div class="supply-item">⚓ ${esc(q.name)} · ${(q.model_share*100).toFixed(1)}% משקל במודל<br><span class="supply-note">לא תועד יצוא מן המפעל דרך נמל זה; האחוז אינו נתח משלוחים שנמדד.</span></div>`).join(''):
   '<div class="supply-gap">לא קיים נמל יציאה מועמד שמור למפעל הזה.</div>')+
  `<h3>⚔️ קרבות עם נתיב מועמד מהמפעל</h3>`+
  (relevant.length?relevant.map(({b,links})=>`<button type="button" data-battle="${esc(b.id)}">⚔️ ${esc(b.name)} · ${links[0].emoji}</button>`).join(''):
   '<div class="supply-gap">לא נמצא קשר מועמד בקרב ממאה הקרבות.</div>')+
  `<div class="supply-note">התאמות מוצר־צד־מרחק־מסילה בלבד. אין הוכחה שהמפעל סיפק את הקרבות האלה. שיוך הצד של נמל יציאה מועמד לא אומת.</div>`;
 const bounds=[[p.y,p.x]];
 for(const q of (k?.candidate_ports||[]).slice(0,5)){const pts=[[p.y,p.x],[q.coord[1],q.coord[0]]];
  L.polyline(pts,{color:'#16808b',weight:2,opacity:.72,dashArray:'3,8'}).bindPopup(
   `${esc(p.n)} → ${esc(q.name)}<br>נמל יציאה מועמד בלבד; יצוא בפועל לא אומת.`).addTo(routeLayer);bounds.push(pts[1]);}
 for(const {b,links} of relevant){const s=links[0],pts=s.coords?.length>1?s.coords.map(c=>[c[1],c[0]]):[[p.y,p.x],[b.coord[1],b.coord[0]]];
  L.polyline(pts,{color:'#9a6831',weight:2,opacity:.58,dashArray:'4,9'}).bindPopup(
   `${esc(p.n)} → ${esc(b.name)}<br>מסדרון מועמד; לא תועד משלוח.`).addTo(routeLayer);bounds.push([b.coord[1],b.coord[0]]);}
 if(p.source)map.flyTo([p.y,p.x],Math.max(6,Math.min(8,map.getZoom())),{duration:.55});
 else if(bounds.length>1)map.fitBounds(L.latLngBounds(bounds),{padding:[80,80],maxZoom:5});
 else map.flyTo([p.y,p.x],Math.max(6,map.getZoom()),{duration:.55});
 presentContext([p.y,p.x]);return true;}
function findPort(term){const t=String(term||'').trim().toLowerCase();return Object.values(K?.ports||{}).find(p=>p.id===term||p.name.toLowerCase()===t)||
 Object.values(K?.ports||{}).find(p=>p.name.toLowerCase().includes(t)&&t.length>=3);}
function showPort(term){const p=findPort(term);clearScene();chosenBattle=null;
 if(!p){details.innerHTML=`<div class="supply-gap">לא נמצא נמל בשם ${esc(term)} במאגר.</div>`;presentContext();return 0;}
 const from=dayOf(queryRange?.from),to=dayOf(queryRange?.to);
 const routes=p.routes.filter(r=>(from==null||r.day_to==null||r.day_to>=from)&&
  (to==null||r.day_from==null||r.day_from<=to)&&(!chosenClass||r.cargo_classes.includes(chosenClass)));
 const observations=p.actual_logistics_observations.filter(o=>(!queryRange?.from||!o.year||o.year>=Number(queryRange.from.slice(0,4)))&&
  (!queryRange?.to||!o.year||o.year<=Number(queryRange.to.slice(0,4))));
 details.innerHTML=`<h3>⚓ ${esc(p.name)}</h3><div class="supply-note">נתיבי ים מחוברים בגרף: ${routes.length}. שיוך הצד והשליטה בנמל בתקופה לא אומתו; מסדרונות הים מוצגים כהקשר לא משויך, ולא כאספקה לצד שנבחר. סוג מטען במסדרון אינו הוכחה שפרק/הוטען בנמל ביום מסוים.</div>`+
  routes.map(r=>`<div class="supply-item"><b>🌊 ${esc(r.code)}</b> · ${r.cargo_classes.map(c=>`${cargoEmoji[c]||'◇'} ${esc(cargoLabel[c]||c)}`).join(' · ')||'מטען לא מסווג'}<br><span class="supply-note">${r.convoy_count} שיירות מקושרות במסדרון; לא הוכח שכולן פקדו את הנמל.</span></div>`).join('')+
  `<h3>תצפיות לוגיסטיות בפועל במיקום</h3>`+
  (observations.length?observations.map(o=>`<div class="supply-item">${esc(o.year||'?')}${o.month?'-'+String(o.month).padStart(2,'0'):''} · ${esc(o.metric)} · ${o.min!=null?fmt(o.min):'?'}${o.max!=null&&o.max!==o.min?'–'+fmt(o.max):''} ${esc(o.unit||'')}<br><span class="supply-note">${esc(o.source_title||o.source_id||'מקור בגרף')} · ${esc(o.subject_basis||'')}</span></div>`).join(''):
   '<div class="supply-gap">אין תצפית פריקה/הובלה מאומתת לטווח הזה; אין להסיק שלא הייתה פעילות.</div>');
 const bounds=[[p.coord[1],p.coord[0]]];L.marker(bounds[0],{icon:icon('⚓'),title:p.name}).addTo(routeLayer);
 for(const r of routes.slice(0,12)){const sea=D.sea.routes.find(x=>x.n.split(' — ')[0]===r.code);if(!sea)continue;
  const pts=sea.c.map(c=>[c[1],c[0]]);const line=L.polyline(pts,{color:'#c77a20',weight:3,opacity:.8,dashArray:'7,10'})
   .bindPopup(`${esc(r.code)}<br>מסדרון בגרף; מטען בנמל זה אינו מאומת.`).addTo(routeLayer);
  bounds.push(...pts);}
 if(bounds.length>1)map.fitBounds(L.latLngBounds(bounds),{padding:[70,70],maxZoom:5});
 else map.flyTo(bounds[0],6,{duration:.55});presentContext(bounds[0]);return routes.length;}
function showBattleMovement(fromTerm,toTerm){const match=term=>S.battles.find(b=>b.id===term||b.name===term)||
  S.battles.find(b=>String(term||'').length>2&&(b.name.includes(term)||b.english?.toLowerCase().includes(String(term).toLowerCase())));
 const a=match(fromTerm),b=match(toTerm);clearScene();chosenBattle=null;
 if(!a||!b){details.innerHTML='<div class="supply-gap">אחד הקרבות אינו נמצא במאגר הקרבות השמור.</div>';presentContext();return 0;}
 const saved=b.previous_battles.find(p=>p.id===a.id),reverse=a.previous_battles.find(p=>p.id===b.id);
 const candidate=saved||reverse,shared=candidate?.shared_sides||a.recipient_sides.filter(s=>b.recipient_sides.includes(s));
 if(!shared.length||chosenSide&&!shared.includes(chosenSide)){
  details.innerHTML=`<h3>🪖 ${esc(a.name)} → ${esc(b.name)}</h3><div class="supply-gap">לא אומת צד משתתף משותף${chosenSide?' עבור '+esc(sideLabel(chosenSide)):''}; אין להציג מסלול תנועת חיילים בין הקרבות.</div>`;
  presentContext([b.coord[1],b.coord[0]]);return 0;}
 if(!chosenSide&&shared.length>1){details.innerHTML=`<h3>🪖 ${esc(a.name)} → ${esc(b.name)}</h3>`+
  `<div class="supply-gap">שני הצדדים השתתפו בקרבות. בחר צד מסוים לפני הצגת מסלול תנועה משוער; אין לייחס קו אחד לשניהם.</div>`;
  presentContext([b.coord[1],b.coord[0]]);return 0;}
 const pts=candidate?.coords?.length>1?candidate.coords.map(c=>[c[1],c[0]]):
  [[a.coord[1],a.coord[0]],[b.coord[1],b.coord[0]]];
 L.polyline(pts,{color:'#71549a',weight:3,opacity:.8,dashArray:candidate?.coords?.length>1?'7,10':'2,10'})
  .bindPopup(`${esc(a.name)} → ${esc(b.name)}<br>${candidate?.route_km!=null?'תוואי מסילה מודלי':'קו הקשר גאוגרפי בלבד'}; אין תיעוד שאותם חיילים או ציוד נעו בין הקרבות.`).addTo(routeLayer);
 for(const battle of [a,b])L.marker([battle.coord[1],battle.coord[0]],{icon:icon('⚔️'),title:battle.name}).addTo(routeLayer);
 details.innerHTML=`<h3>🪖 ${esc(a.name)} → ${esc(b.name)}</h3><div class="supply-item">${candidate?.route_km!=null?'~'+fmt(candidate.route_km)+' ק״מ בתוואי מסילה מודלי':'אין תוואי מעבר מחובר שמור; הקו הישר הוא הקשר גאוגרפי בלבד.'}</div>`+
  `<div class="supply-note">צד משותף: ${esc(shared.map(sideLabel).join(', '))}. אין ראיה שאותה יחידה או אותו ציוד השתתפו בשניהם, או שהמסילה הייתה שמישה ובשליטה מתאימה. מסלול זה אומדן בלבד.</div>`;
 map.fitBounds(L.latLngBounds(pts),{padding:[80,80],maxZoom:6});presentContext(pts.at(-1));return 1;}
function showQuery(query={}){queryRange={from:query.from||'',to:query.to||''};
 chosenSide=['allied','axis'].includes(query.side)?query.side:'';
 const from=dayOf(query.from),to=dayOf(query.to);
 const term=String(query.commodity||'').trim().toLowerCase();
 const c=Object.entries({food:['food','מזון'],pol:['pol','fuel','דלק'],vehicles:['vehicles','tank','טנק','vehicle','רכב'],
  ordnance_weapons:['ordnance_weapons','ammo','ammunition','תחמושת','חימוש'],aircraft:['aircraft','plane','מטוס'],
  raw_material:['raw_material','rail','רכבת','מסילה'],chem:['chem','chemical','כימיה']}).find(([,aliases])=>aliases.some(x=>term===x))?.[0]||'';
 chosenClass=c;
 if(query.plant){const candidates=[...Object.values(K?.plants||{}),...(window.WW2_FACTORY_CATALOG?.plants||[])];
  const p=candidates.find(x=>(x.id===query.plant||x.name===query.plant||x.n===query.plant))||
   candidates.find(x=>String(query.plant).length>2&&String(x.name||x.n||'').toLowerCase().includes(String(query.plant).toLowerCase()));
  if(!p){clearScene();details.innerHTML=`<div class="supply-gap">המפעל ${esc(query.plant)} אינו במאגר.</div>`;presentContext();return 0;}
  return showFactory(p.id);}
 if(query.port)return showPort(query.port);
 if(query.from_battle&&query.to_battle)return showBattleMovement(query.from_battle,query.to_battle);
 const battle=S.battles.find(b=>b.id===query.battle||b.name.includes(query.battle||'\u0000')||
  (b.english&&b.english.toLowerCase().includes(String(query.battle||'\u0000').toLowerCase())));
 if(battle){if((from!=null&&battle.day_to<from)||(to!=null&&battle.day_from>to)){
  clearScene();chosenBattle=null;
  details.innerHTML=`<div class="supply-gap">${esc(battle.name)} אינו חופף לטווח התאריכים שבבקשה. לא מוצגים נתיבי אספקה מחוץ לתקופת הקרב.</div>`;
  presentContext([battle.coord[1],battle.coord[0]]);return 0;}
  return showBattle(battle.id);}
 if(query.battle){clearScene();details.innerHTML=`<div class="supply-gap">הקרב ${esc(query.battle)} אינו באינדקס הקרבות השמור.</div>`;presentContext();return 0;}
 clearScene();chosenBattle=null;
 const routes=D.sea.routes.filter(r=>{const code=r.n.split(' — ')[0],g=G.routes[code];
  if(!g)return false;if(c&&!g.cargo_classes?.includes(c))return false;
  if(from!=null&&g.day_to<from)return false;
  if(to!=null&&g.day_from>to)return false;
  if(query.origin&&!r.n.toLowerCase().includes(String(query.origin).toLowerCase())&&!code.toLowerCase().includes(String(query.origin).toLowerCase()))return false;
  if(query.destination&&!r.n.toLowerCase().includes(String(query.destination).toLowerCase()))return false;
  return true;}).slice(0,11);
 details.innerHTML=`<h3>🌊 מסדרונות אספקה${c?' · '+cargoEmoji[c]:''}</h3>`+
  `<div class="supply-note">מחלקת המטען משויכת למסדרון בגרף; הצד, כמות ותאריך משלוח מסוימים אינם ידועים. המסדרונות אינם נחשבים אספקה לצד שנבחר.</div>`+
  (routes.length?'':`<div class="supply-gap">לא נמצא מסדרון תואם למטען, למקום ולטווח התאריכים שבבקשה. אין להסיק מכך שלא הועברה אספקה.</div>`)+
  routes.map(r=>{const code=r.n.split(' — ')[0],g=G.routes[code];
   return `<div class="supply-item"><b>${esc(code)}</b> · ${esc(r.n)}<br>`+
    g.cargo_classes.map(x=>`${cargoEmoji[x]||'◇'} ${esc(cargoLabel[x]||x)}`).join(' · ')+'</div>';}).join('');
 const allPoints=[];
 for(const r of routes){const code=r.n.split(' — ')[0],g=G.routes[code];
  const pts=r.c.map(p=>[p[1],p[0]]);const line=L.polyline(pts,{color:'#c77a20',weight:4,opacity:.85,
   dashArray:'7,10',className:'ww2-route-flow'}).bindPopup(`<b>${esc(r.n)}</b><br>מסדרון תקופתי; מטען מסוים ביום מסוים אינו מתועד.`).addTo(routeLayer);
  allPoints.push(...pts);
  /* No cargo animation without a verified faction assignment to this corridor. */}
 if(allPoints.length)map.fitBounds(L.latLngBounds(allPoints),{padding:[85,85],maxZoom:5});
 presentContext(allPoints[0]||map.getCenter());
 return routes.length;}

for(const {b,m} of BAT)if(byId.has(b.id))m.on('click',()=>{
 queryRange=null;chosenSide='';chosenClass='';showBattle(b.id,{focus:false});});
document.addEventListener('click',e=>{const id=e.target.closest?.('.ww2-supply-context [data-battle]')?.dataset.battle;
 if(id){queryRange=null;chosenSide='';chosenClass='';showBattle(id);}});
slider.addEventListener('input',()=>{if(chosenBattle&&(+slider.value<chosenBattle.day_from-30||+slider.value>chosenBattle.day_to+30)){
 clearScene();map.closePopup();chosenBattle=null;}});
window.WW2BattleSupply={showBattle,showFactory,showQuery,
 closeContext(){clearScene();chosenBattle=null;queryRange=null;},
 stats:S.stats,availableBattles:S.battles.map(b=>({id:b.id,name:b.name,rank:b.rank}))};

// A local, validated request file lets Codex/Local Task Bridge make the map
// respond to chat questions without remote code execution or arbitrary HTML.
const loadedAt=Date.now();let seenRequest=null;
async function poll(){if(!['localhost','127.0.0.1'].includes(location.hostname))return;
 try{const response=await fetch('./ww2_supply_request.json?ts='+Date.now(),{cache:'no-store'});
  if(!response.ok)return;const req=await response.json();
  if(req.version!==1||typeof req.nonce!=='string')return;
  // A stale request left on disk must not reopen a battle on every reload.
  if(seenRequest===null){seenRequest=req.nonce;
   const sentAt=Number(req.nonce.match(/^(?:route|req)_(\d{13})_/)?.[1]||0);
   if(sentAt<loadedAt)return;}
  if(req.nonce===seenRequest)return;
  seenRequest=req.nonce;
  if(req.action==='battle'&&typeof req.battle==='string')showBattle(req.battle);
  else if(req.action==='query'&&typeof req.query==='object')showQuery(req.query);
 }catch{ /* optional channel absent; the manual map stays functional */ }}
setInterval(poll,4000);poll();
if(!reduced){let last=performance.now();const frame=now=>{const dt=Math.min(.08,(now-last)/1000);last=now;
 for(const a of animated){a.phase=(a.phase+dt*.12)%1;
  const t=a.phase*(a.points.length-1),i=Math.min(a.points.length-2,Math.floor(t)),f=t-i;
  a.marker.setLatLng([a.points[i][0]+(a.points[i+1][0]-a.points[i][0])*f,
    a.points[i][1]+(a.points[i+1][1]-a.points[i][1])*f]);}
 requestAnimationFrame(frame);};requestAnimationFrame(frame);}
})();
