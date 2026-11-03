/* Battle-linked military presence and visibly estimated between-battle motion. */
(() => {
 'use strict';
 if (!window.L || !window.WW2_MILITARY_DATA || typeof map === 'undefined') return;
 const data=window.WW2_MILITARY_DATA;
 const battleData=window.WW2_BATTLE_UNITS||{units:[],counts:{}};
 const epoch=Date.UTC(1937,0,1),ms=864e5;
 const toDay=date=>Math.round((Date.parse(date+'T00:00:00Z')-epoch)/ms);
 const fromDay=day=>new Date(epoch+day*ms).toISOString().slice(0,10);
 const esc=text=>String(text).replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const countryHe={
  'United States':'ארצות הברית','Germany':'גרמניה','Soviet Union':'ברית המועצות',
  'United Kingdom':'בריטניה','Japan':'יפן','France':'צרפת','Italy':'איטליה',
  'Finland':'פינלנד','Poland':'פולין','Australia':'אוסטרליה',
  'New Zealand':'ניו זילנד','Greece':'יוון','China':'סין','Canada':'קנדה',
  'Romania':'רומניה','Hungary':'הונגריה','Bulgaria':'בולגריה',
  'Yugoslavia':'יוגוסלביה','Slovakia':'סלובקיה','Netherlands':'הולנד',
 'Belgium':'בלגיה','Norway':'נורווגיה','South Africa':'דרום אפריקה',
 'India':'הודו'
 };
 const countryShortHe={
  'United States':'ארה״ב','Germany':'גרמניה','Soviet Union':'בריה״מ',
  'United Kingdom':'בריטניה','Japan':'יפן','France':'צרפת','Italy':'איטליה',
  'Finland':'פינלנד','Poland':'פולין','Australia':'אוסטרליה',
  'New Zealand':'ניו זילנד','Greece':'יוון','China':'סין','Canada':'קנדה',
  'Romania':'רומניה','Hungary':'הונגריה','Bulgaria':'בולגריה',
  'Yugoslavia':'יוגוסלביה','Slovakia':'סלובקיה','Netherlands':'הולנד',
  'Belgium':'בלגיה','Norway':'נורווגיה','South Africa':'ד׳ אפריקה','India':'הודו'
 };
 const axisNations=new Set(['Germany','Italy','Japan','Romania','Hungary',
  'Bulgaria','Slovakia','Finland']);
 const countryEnByHe=Object.fromEntries(Object.entries(countryHe).map(([en,he])=>[he,en]));
 function completeBattleCoverage(){
  const covered=new Set(battleData.units.map(unit=>unit.b));
  for(const battle of window.WW2_TIMELINE_BATTLES||[]){
   const battleName=battle.en||battle.n;
   if(!battleName||covered.has(battle.n)||covered.has(battle.en)||
      battle.x==null||battle.y==null||battle.f==null)continue;
   const belligerents=(battle.bl||[]).map(name=>countryEnByHe[name]||name);
   const known=belligerents.filter(name=>countryHe[name]);
   const sides=known.length>=2?known.slice(0,2):[null,null];
   sides.forEach((nation,index)=>battleData.units.push({
    id:'timeline-force:'+String(battle.id||battleName)+'|'+(index+1),b:battleName,
    x:battle.x,y:battle.y,d0:battle.f,d1:battle.e||battle.f,s:index+1,
    u:nation?nation+' field force':'Side '+(index+1)+' representative force',
    e:'representative_force',n:nation,sb:'timeline_belligerent_estimate',
    c:(battle.bl||[]).join(', '),src:'timeline_battle_graph',loc:battle.id,
    geo:'graph_battle_anchor',db:'graph_battle_anchor',t:battle.frt||'timeline',est:true
   }));
   covered.add(battleName);
  }
  battleData.counts=battleData.counts||{};
  battleData.counts.battles=covered.size;
  battleData.counts.units=battleData.units.length;
 }
 completeBattleCoverage();
 const palette={
  'United States':'#276a9a','Germany':'#9b4932','Soviet Union':'#a63a48',
  'United Kingdom':'#655e9b','Japan':'#a97124','France':'#537c9b',
  'Italy':'#987641','Finland':'#42817d','Poland':'#8c628c',
  'New Zealand':'#3e7d63','Greece':'#5b779d'
 };
 const color=n=>palette[n]||'#63717a';
 const iconRoot='./assets/military-icons/';
 const iconFile={
  armor:'armor.png',infantry:'infantry.png',artillery:'artillery.png',
  airborne:'airborne.png',transport:'transport.png',air:'air.png',naval:'naval.png',
  base:'base.png',engineer:'engineer.png',recon:'recon.png',cavalry:'cavalry.png',
  signals:'signals.png'
 };
 const flagSpec={
  'Germany':['DE','linear-gradient(#202020 0 33%,#b83338 33% 66%,#d4ad3b 66%)'],
  'Soviet Union':['SU','linear-gradient(#aa2635 0 100%)'],
  'United States':['US','linear-gradient(#294f79 0 45%,#f1ede4 45% 62%,#b83b45 62%)'],
  'United Kingdom':['UK','linear-gradient(135deg,#294f79 0 42%,#f1ede4 42% 56%,#b83b45 56% 68%,#294f79 68%)'],
  'Japan':['JP','linear-gradient(90deg,#f4f0e7 0 35%,#bc3341 35% 65%,#f4f0e7 65%)'],
  'Italy':['IT','linear-gradient(90deg,#347654 0 33%,#f4f0e7 33% 66%,#b83b45 66%)'],
  'France':['FR','linear-gradient(90deg,#315c8d 0 33%,#f4f0e7 33% 66%,#b83b45 66%)'],
  'Poland':['PL','linear-gradient(#f4f0e7 0 50%,#bc3d4d 50%)'],
  'Finland':['FI','linear-gradient(90deg,#f4f0e7 0 35%,#386399 35% 55%,#f4f0e7 55%)'],
  'China':['CN','linear-gradient(#ba343e 0 100%)'],
  'Australia':['AU','linear-gradient(#315a82 0 100%)'],
  'Canada':['CA','linear-gradient(90deg,#bd3542 0 28%,#f4f0e7 28% 72%,#bd3542 72%)'],
  'New Zealand':['NZ','linear-gradient(#2e557b 0 100%)'],
  'Romania':['RO','linear-gradient(90deg,#315b91 0 33%,#e4c849 33% 66%,#b93c45 66%)'],
  'Hungary':['HU','linear-gradient(#b43c42 0 33%,#f4efe5 33% 66%,#39764f 66%)'],
  'Greece':['GR','linear-gradient(#3c6d9d 0 42%,#f4f0e7 42% 58%,#3c6d9d 58%)'],
  'Bulgaria':['BG','linear-gradient(#f4efe5 0 33%,#39764f 33% 66%,#b43c42 66%)'],
  'Yugoslavia':['YU','linear-gradient(#315b91 0 33%,#f4efe5 33% 66%,#b43c42 66%)']
 };
 const names={
  AIR_BASE:'בסיס אווירי',NAVAL_BASE:'בסיס ימי',TRAINING_CAMP:'מחנה אימונים',
  LOGISTICS_DEPOT:'מחסן אספקה',AMMUNITION_DEPOT:'מחסן תחמושת',
  ORDNANCE_FACILITY:'מתקן חימוש',FUEL_DEPOT:'מחסן דלק',
  SIGNALS_STATION:'תחנת קשר'
 };
 const baseIcon={AIR_BASE:'air',NAVAL_BASE:'naval',TRAINING_CAMP:'base',
  LOGISTICS_DEPOT:'transport',AMMUNITION_DEPOT:'artillery',
  ORDNANCE_FACILITY:'engineer',FUEL_DEPOT:'transport',SIGNALS_STATION:'signals'};
 // בסיסי מפתח בזירה היו חסרים לחלוטין ממאגר מתקני הצי האמריקני.
 // הנקודות להלן הן עוגני עיר/נמל מתועדים, לא כתובות מדויקות של מתקן.
 const middleEastBases=[
  {name:'Alexandria naval base',place:'Alexandria',role:'NAVAL_BASE',lat:31.20,lon:29.92,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Mediterranean and Middle East'},
  {name:'Suez logistics base',place:'Suez',role:'LOGISTICS_DEPOT',lat:29.97,lon:32.55,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Mediterranean and Middle East'},
  {name:'Heliopolis air base',place:'Cairo',role:'AIR_BASE',lat:30.12,lon:31.34,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Mediterranean and Middle East'},
  {name:'Haifa naval and logistics base',place:'Haifa',role:'NAVAL_BASE',lat:32.82,lon:34.99,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Mediterranean and Middle East'},
  {name:'RAF Habbaniya',place:'Habbaniya',role:'AIR_BASE',lat:33.37,lon:43.57,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Iraq campaign'},
  {name:'RAF Shaibah',place:'Basra',role:'AIR_BASE',lat:30.42,lon:47.64,nation:'United Kingdom',dates:'1939–1945',source:'British official history, Iraq campaign'},
  {name:'Basra logistics base',place:'Basra',role:'LOGISTICS_DEPOT',lat:30.51,lon:47.81,nation:'United Kingdom',dates:'1941–1945',source:'British official history, Persia and Iraq Force'},
  {name:'Aden naval base',place:'Aden',role:'NAVAL_BASE',lat:12.79,lon:45.03,nation:'United Kingdom',dates:'1939–1945',source:'British official history, East Africa campaign'},
  {name:'Tobruk fortress and port',place:'Tobruk',role:'LOGISTICS_DEPOT',lat:32.08,lon:23.96,nation:'United Kingdom',dates:'1941–1942',source:'Australian and British official histories, Tobruk'},
  {name:'Tripoli naval base',place:'Tripoli',role:'NAVAL_BASE',lat:32.89,lon:13.19,nation:'Italy',dates:'1939–1943',source:'British official history, Mediterranean and Middle East'},
  {name:'Benghazi logistics base',place:'Benghazi',role:'LOGISTICS_DEPOT',lat:32.12,lon:20.07,nation:'Italy',dates:'1939–1943',source:'British official history, Mediterranean and Middle East'},
  {name:'Massawa naval base',place:'Massawa',role:'NAVAL_BASE',lat:15.61,lon:39.45,nation:'Italy',dates:'1939–1941',source:'British official history, East Africa campaign'},
  {name:'Asmara air base',place:'Asmara',role:'AIR_BASE',lat:15.34,lon:38.93,nation:'Italy',dates:'1939–1941',source:'British official history, East Africa campaign'},
  {name:'Algiers Allied headquarters',place:'Algiers',role:'SIGNALS_STATION',lat:36.75,lon:3.06,nation:'United States',dates:'1942–1943',source:'US Army CMH, Northwest Africa'},
  {name:'Oran logistics base',place:'Oran',role:'LOGISTICS_DEPOT',lat:35.70,lon:-0.64,nation:'United States',dates:'1942–1943',source:'US Army CMH, Northwest Africa'}
 ];
 const allBases=[...(data.bases||[]),...middleEastBases];
 const unitLayer=L.layerGroup().addTo(map);
 const battleUnitLayer=L.layerGroup().addTo(map);
 const movementLayer=L.layerGroup().addTo(map);
 const baseLayer=L.layerGroup().addTo(map);
 const fortLayer=L.layerGroup().addTo(map);
 const state={country:'all',units:true,battleUnits:true,movements:true,
  syncAdvance:true,bases:true,forts:true,day:+document.querySelector('#slider').value};
 const panel=document.createElement('section');
 panel.id='militaryPanel';
 panel.className='panel';
 panel.setAttribute('aria-label','כוחות, בסיסים ועמדות לפי מדינה');
 const css=document.createElement('style');
 css.textContent=
  '#militaryPanel{top:56px;right:14px;z-index:1199;width:min(290px,80vw);'+
  'font-size:12px;line-height:1.5;max-height:45vh;overflow:auto}'+
  'body:not([data-ui-panel="military"]) #militaryPanel{display:none!important}'+
  '#militaryPanel h2{font-size:13px;margin:0 0 8px}'+
  '#militaryPanel select{width:100%;font:inherit;padding:4px;margin-bottom:7px}'+
  '#militaryPanel label{display:block;margin:3px 0;cursor:pointer}'+
  '#militaryPanel .note{color:#6c6561;font-size:10px;margin:8px 0 0}'+
  '#militaryPanel .count{color:#514b48;font-size:10px;margin-top:7px}'+
  '.ww2-nat{position:relative;width:48px;height:30px;display:flex;align-items:center;'+
  'justify-content:center;box-sizing:border-box;font-family:Arial,sans-serif;text-shadow:none;'+
  'filter:drop-shadow(0 2px 2px #10182080);transition:transform .16s ease,filter .16s ease}'+
  '.leaflet-marker-icon:hover .ww2-nat,.leaflet-marker-icon:focus .ww2-nat{'+
  'transform:translateY(-2px) scale(1.1);filter:drop-shadow(0 4px 3px #10182096)}'+
  '@media (prefers-reduced-motion:reduce){.ww2-nat{transition:none!important}}'+
  '.ww2-unit-flag{position:absolute;left:0;top:4px;width:34px;height:22px;box-sizing:border-box;'+
  'overflow:hidden;border:1px solid #30343a;border-radius:2px;background:#737b82;'+
  'color:#fff;font:800 8px/20px Arial;text-align:center;text-shadow:0 1px 1px #0009;'+
  'box-shadow:0 1px 2px #10182080}'+
  '.ww2-unit-flag.f-DE{background:#bd1f2d;color:transparent;font-size:0}'+
  '.ww2-unit-flag.f-DE:before{content:"";position:absolute;left:8px;top:2px;width:16px;height:16px;'+
  'border-radius:50%;background:#f5f1e9}'+
  '.ww2-unit-flag.f-DE:after{content:"卐";position:absolute;left:9px;top:1px;color:#111;'+
  'font:900 15px/18px Arial;transform:rotate(-45deg);text-shadow:none}'+
  '.ww2-unit-flag.f-SU{background:#aa2635;color:#f0cf45;font-size:0}'+
  '.ww2-unit-flag.f-SU:after{content:"☭";position:absolute;left:3px;top:-1px;font:700 12px/16px serif}'+
  '.ww2-unit-flag.f-US{background:repeating-linear-gradient(#b53642 0 2px,#f2eee5 2px 4px)}'+
  '.ww2-unit-flag.f-US:after{content:"";position:absolute;left:0;top:0;width:14px;height:11px;background:#294f79}'+
  '.ww2-unit-flag.f-UK{background:linear-gradient(33deg,transparent 42%,#f1ede4 42% 49%,#b83b45 49% 55%,#f1ede4 55% 62%,transparent 62%),linear-gradient(147deg,transparent 42%,#f1ede4 42% 49%,#b83b45 49% 55%,#f1ede4 55% 62%,transparent 62%),linear-gradient(90deg,transparent 38%,#f1ede4 38% 45%,#b83b45 45% 56%,#f1ede4 56% 63%,transparent 63%),linear-gradient(transparent 34%,#f1ede4 34% 43%,#b83b45 43% 57%,#f1ede4 57% 66%,transparent 66%),#294f79}'+
  '.ww2-unit-flag.f-JP{background:radial-gradient(circle at 50% 50%,#bc3341 0 34%,transparent 36%),#f4f0e7}'+
  '.ww2-unit-flag.f-IT{background:linear-gradient(90deg,#347654 0 33%,#f4f0e7 33% 66%,#b83b45 66%)}'+
  '.ww2-unit-flag.f-FR{background:linear-gradient(90deg,#315c8d 0 33%,#f4f0e7 33% 66%,#b83b45 66%)}'+
  '.ww2-unit-flag.f-PL{background:linear-gradient(#f4f0e7 0 50%,#bc3d4d 50%)}'+
  '.ww2-unit-flag.f-FI{background:linear-gradient(90deg,#f4f0e7 0 29%,#386399 29% 45%,#f4f0e7 45%),linear-gradient(#f4f0e7 0 40%,#386399 40% 62%,#f4f0e7 62%)}'+
  '.ww2-unit-flag.f-CN{background:#ba343e}.ww2-unit-flag.f-AU,.ww2-unit-flag.f-NZ{background:#315a82}'+
  '.ww2-unit-flag.f-CA{background:linear-gradient(90deg,#bd3542 0 28%,#f4f0e7 28% 72%,#bd3542 72%)}'+
  '.ww2-unit-flag.f-RO{background:linear-gradient(90deg,#315b91 0 33%,#e4c849 33% 66%,#b93c45 66%)}'+
  '.ww2-unit-flag.f-HU{background:linear-gradient(#b43c42 0 33%,#f4efe5 33% 66%,#39764f 66%)}'+
  '.ww2-unit-flag.f-GR{background:repeating-linear-gradient(#3c6d9d 0 3px,#f4f0e7 3px 5px)}'+
  '.ww2-unit-flag.f-BG{background:linear-gradient(#f4efe5 0 33%,#39764f 33% 66%,#b43c42 66%)}'+
  '.ww2-unit-flag.f-YU{background:linear-gradient(#315b91 0 33%,#f4efe5 33% 66%,#b43c42 66%)}'+
  '.ww2-unit-role{position:absolute;right:-1px;top:7px;z-index:2;display:block;'+
  'width:17px;height:17px;object-fit:contain;image-rendering:auto;'+
  'filter:drop-shadow(0 1px 1px #101820a0)}'+
  '.ww2-nat-base .ww2-unit-role{width:18px;height:18px}'+
  '.ww2-nat-cluster .ww2-unit-role{opacity:.92}'+
  '.ww2-unit-count{position:absolute;right:-6px;top:-5px;z-index:3;min-width:17px;height:15px;'+
  'padding:0 3px;border:1px solid #3c352d;border-radius:4px;background:#f4c95d;'+
  'color:#26231d;font:800 9px/14px Arial;text-align:center;text-shadow:none}'+
  '.ww2-nat-label{position:absolute;top:34px;left:50%;transform:translateX(-50%);'+
  'white-space:nowrap;padding:0 2px;background:#fffdfadb;font:600 10px Arial}'+
  '.ww2-nat-moving{filter:drop-shadow(0 2px 3px #101820a8)}'+
  '.ww2-unit-overview{position:relative;width:43px;height:31px;display:block;'+
  'filter:drop-shadow(0 2px 2px #10182080);transition:transform .16s ease}'+
  '.leaflet-marker-icon:hover .ww2-unit-overview,.leaflet-marker-icon:focus .ww2-unit-overview{'+
  'transform:translateY(-2px) scale(1.08)}'+
  '.ww2-unit-overview img{position:absolute;left:0;top:2px;width:27px;height:27px;'+
  'object-fit:contain;filter:drop-shadow(0 1px 1px #101820a0)}'+
  '.ww2-unit-overview-count{position:absolute;right:0;top:5px;min-width:20px;height:20px;'+
  'box-sizing:border-box;padding:0 4px;border:1px solid #2b2d30;border-radius:4px;'+
  'background:var(--side);color:#fff;font:800 11px/18px Arial;text-align:center;'+
  'text-shadow:0 1px 1px #0009}'+
  '@media (prefers-reduced-motion:reduce){.ww2-unit-overview{transition:none!important}}'+
  '#militaryPanel .sync-status{margin-top:6px;font-size:10px;color:#514b48}'+
  '#militaryPanel .sync-status.hold{color:#8c3b2f;font-weight:700}';
 document.head.appendChild(css);
 const title=document.createElement('h2');title.textContent='כוחות, בסיסים ועמדות';
 panel.appendChild(title);
 const select=document.createElement('select');
 select.setAttribute('aria-label','סנן לפי מדינה');
 const all=document.createElement('option');all.value='all';all.textContent='כל המדינות';
 select.appendChild(all);
 const countries=[...new Set([...data.units,...allBases,...data.fortifications,
  ...battleData.units.map(x=>({nation:x.n}))].map(x=>x.nation).filter(Boolean))].sort(
  (a,b)=>(countryHe[a]||a).localeCompare(countryHe[b]||b,'he'));
 countries.forEach(n=>{const option=document.createElement('option');
  option.value=n;option.textContent=countryHe[n]||n;select.appendChild(option);});
 panel.appendChild(select);
 const checks={};
 for(const [key,label] of [['battleUnits','יחידות סביב קרבות'],['movements','תנועת יחידות בין קרבות'],
  ['units','תצפיות מיקום מדויקות'],['bases','בסיסים ומתקנים'],
  ['forts','קווי ביצורים']]){
  const row=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.checked=true;checks[key]=input;
  row.appendChild(input);row.appendChild(document.createTextNode(' '+label));
 panel.appendChild(row);
 }
 const syncRow=document.createElement('label'),syncInput=document.createElement('input');
 syncInput.type='checkbox';syncInput.checked=true;checks.syncAdvance=syncInput;
 syncRow.appendChild(syncInput);
 syncRow.appendChild(document.createTextNode(' סנכרן כיבוש לתנועת יחידות'));
 panel.appendChild(syncRow);
 const count=document.createElement('div');count.className='count';panel.appendChild(count);
 const syncStatus=document.createElement('div');syncStatus.className='sync-status';
 syncStatus.setAttribute('aria-live','polite');panel.appendChild(syncStatus);
 const note=document.createElement('p');note.className='note';
 note.textContent='בזום הרחוק מוצג לכל קבוצה רק סמל סוג היחידה ומספר; בהתקרבות הקבוצה נפתחת בהדרגה. '+
  'יחידות סביב קרב: דגל המדינה הוא הסימן הראשי בתצוגה המפורטת; הסמליל הקטן מציג רגלים, שריון, צנחנים, תותחנים, אוויר או ים. '+
  'הצד נשמר מהאינפובוקס או מהתאמה חד־משמעית בין לאום היחידה לאחד מצדדי הקרב. הפיזור סכמטי ואינו מיקום טקטי. '+
  'בקרב שלא פורטו בו יחידות מוצג כוח מייצג משוער לכל צד. '+
  'בתנועה בין קרבות, רק העוגנים והזהות עשויים להיות מתועדים; הנתיב ביניהם מסומן כמשוער. '+
  'תצפיות מיקום: תצפיות בלבד, לא מסלול; העיגול מסמן אי־ודאות. '+
  'בסיסים: מאגר אמריקני ועוגני מפתח מההיסטוריות הרשמיות של המזרח התיכון; המיקום הוא עיר/נמל ולא כתובת המתקן. '+
  'ביצורים: המדינה שבנתה, לא בהכרח המדינה שהחזיקה בהם ביום המוצג.';
 panel.appendChild(note);
 const credit=document.createElement('a');credit.href='https://icons8.com';
 credit.target='_blank';credit.rel='noopener';credit.textContent='Illustrated icons by Icons8';
 credit.style.cssText='display:inline-block;margin-top:5px;font-size:10px;color:#514b48';
 panel.appendChild(credit);
 document.body.appendChild(panel);
 const menu=document.querySelector('#mapToolsMenu');
 if(menu){
  const button=document.createElement('button');
  button.type='button';button.dataset.panel='military';button.textContent='כוחות ובסיסים';
  menu.insertBefore(button,menu.querySelector('[data-panel="none"]'));
 }else{
  const button=document.createElement('button');
  button.type='button';button.textContent='כוחות ובסיסים';
  button.style.cssText='position:absolute;z-index:1200;top:14px;right:14px';
  document.body.appendChild(button);
  button.onclick=()=>{document.body.dataset.uiPanel=
   document.body.dataset.uiPanel==='military'?'none':'military';};
 }
 const picked=n=>state.country==='all'||state.country===n;
 function popup(lines){
  const box=document.createElement('div');
  for(const [label,value] of lines){if(value==null||value==='')continue;
   const row=document.createElement('div');
   if(label){const strong=document.createElement('b');strong.textContent=label+' ';row.appendChild(strong);}
   row.appendChild(document.createTextNode(String(value)));box.appendChild(row);}
  return box;
 }
 function nationalIcon(nation,kind,unitKind,label,more,sideColor){
  const flag=flagSpec[nation]||[(nation||'--').slice(0,2).toUpperCase(),'#66747d'];
  const asset=iconRoot+(iconFile[unitKind]||iconFile.infantry);
  const border=sideColor||color(nation);
  const country=countryHe[nation]||nation||'לא ידוע';
  const flagClass=/^[A-Z]{2}$/.test(flag[0])?' f-'+flag[0]:'';
  const flagText=flagClass?'':esc(flag[0]);
  return L.divIcon({className:'',iconSize:[50,32],iconAnchor:[25,16],html:
   '<div class="ww2-nat ww2-nat-'+kind+'" style="--side:'+border+'">'+
   '<span class="ww2-unit-flag'+flagClass+'" title="'+esc(country)+'">'+flagText+'</span>'+
   '<img class="ww2-unit-role" src="'+asset+'" alt="">'+
   (more?'<span class="ww2-unit-count">+'+esc(more)+'</span>':'')+
   (label?'<span class="ww2-nat-label" style="color:'+border+'">'+esc(label)+'</span>':'')+
   '</div>'});
 }
 function overviewIcon(nation,unitKind,total,sideColor){
  const asset=iconRoot+(iconFile[unitKind]||iconFile.infantry);
  const border=sideColor||color(nation);
  return L.divIcon({className:'',iconSize:[45,32],iconAnchor:[22,16],html:
   '<div class="ww2-unit-overview" style="--side:'+border+'">'+
   '<img src="'+asset+'" alt="">'+
   '<span class="ww2-unit-overview-count">'+esc(total)+'</span></div>'});
 }
 function marker(lat,lon,nation,kind,unitKind,lines,layer,titleText){
  const icon=nationalIcon(nation,kind,unitKind,'',0);
  L.marker([lat,lon],{icon,title:titleText||countryHe[nation]||nation||''})
   .bindPopup(popup(lines)).addTo(layer);
 }
 function clusters(items,kind){
  const zoom=map.getZoom(),bins=new Map(),cell=zoom>=10?0:zoom===9?36:
   zoom===8?50:zoom===7?62:zoom===6?76:zoom===5?90:108;
  for(const item of items){
   const point=map.latLngToContainerPoint([item.lat,item.lon]);
   const key=cell?kind+'|'+item.nation+'|'+Math.floor(point.x/cell)+'|'+Math.floor(point.y/cell):
    item.id||item.name+'|'+item.lat+'|'+item.lon;
   const bin=bins.get(key)||[];bin.push(item);bins.set(key,bin);
  }
  return [...bins.values()];
 }
 function renderUnits(){
  unitLayer.clearLayers();
  if(!state.units)return 0;
  const bounds=map.getBounds().pad(.15),active=data.units.filter(u=>{
   const age=state.day-toDay(u.date);
   return age>=0&&age<=7&&picked(u.nation)&&bounds.contains([u.lat,u.lon]);
  });
  const zoom=map.getZoom();
  for(const group of clusters(active,'unit').slice(0,180)){
   const u=group[0],age=state.day-toDay(u.date);
   if(zoom<=8){
    const kind=unitKind({u:group.map(x=>x.name).join(' '),
     e:group.map(x=>x.role).join(' ')});
    L.marker([u.lat,u.lon],{icon:overviewIcon(u.nation,kind,group.length),
     title:group.length+' תצפיות יחידה'}).bindPopup(popup([
      ['תצפיות יחידה',group.length],['מדינה',countryHe[u.nation]||u.nation],
      ['דוגמאות',group.slice(0,8).map(x=>x.name).join(' · ')],
      ['הצגה','בזום הרחוק מוצג סמל יחידה ומספר בלבד; התקרבות פותחת את הסמנים']
     ])).addTo(unitLayer);
    continue;
   }
   if(group.length>1){
     marker(u.lat,u.lon,u.nation,'cluster','infantry',[
     ['תצפיות יחידה',group.length],['מדינה',countryHe[u.nation]||u.nation],
     ['דוגמה',group.slice(0,5).map(x=>x.name).join(' · ')],
     ['הבהרה','קיבוץ תצפיות סמוכות; לא מיקום מדויק של כל יחידה']
    ],unitLayer,group.length+' תצפיות יחידה');
   }else{
    if(map.getZoom()>=8){
     const uncertain=Math.max(15000,Number(u.precision_m)||15000);
     L.circle([u.lat,u.lon],{radius:uncertain,color:color(u.nation),
      weight:1,dashArray:'3,5',fillOpacity:.035,interactive:false}).addTo(unitLayer);
    }
    marker(u.lat,u.lon,u.nation,'unit',u.role==='headquarters'?'signals':'infantry',[
     ['יחידה',u.name||'יחידה מזוהה'],['מדינה',countryHe[u.nation]||u.nation],
     ['דווחה',u.date+(age?' · לפני '+age+' ימים':'')],
     ['אי־ודאות','לפחות '+Math.round(Math.max(15000,u.precision_m)/1000)+' ק״מ'],
     ['מעמד','מיקום נגזר ממפת מקור/שם מקום; לא כתובת או נתיב תנועה'],
     ['מקור',(u.sources||[]).join(', ')]
    ],unitLayer,u.name);
   }
  }
  return active.length;
 }
 function unitKind(unit){
  const text=((unit.u||'')+' '+(unit.e||'')).toLowerCase();
  if(/airborne|parachut|fallschirm/.test(text))return 'airborne';
  if(/panzer|armor|tank/.test(text))return 'armor';
  if(/artillery|artillerie|howitzer|gun brigade/.test(text))return 'artillery';
  if(/engineer|pioneer|sapper/.test(text))return 'engineer';
  if(/reconnaissance|recon|scout/.test(text))return 'recon';
  if(/marine|naval|fleet|flotilla/.test(text))return 'naval';
  if(/air force|air division|aviation|fighter|bomber/.test(text))return 'air';
  if(/cavalry|mounted/.test(text))return 'cavalry';
  if(/transport|motor|truck|logistic|supply/.test(text))return 'transport';
  return 'infantry';
 }
 const echelonHe={
  army_group:'קבוצת ארמיות',army:'ארמייה',corps:'קורפוס',division:'דיוויזיה',
  brigade:'חטיבה',regiment:'רגימנט',battalion:'גדוד',company:'פלוגה',
  representative_force:'כוח מייצג משוער'
 };
 const kindHe={armor:'שריון',infantry:'חי״ר',artillery:'ארטילריה',airborne:'צנחנים',
  engineer:'הנדסה',recon:'סיור',naval:'כוח ימי',air:'כוח אווירי',cavalry:'פרשים',
  transport:'תובלה ולוגיסטיקה',signals:'קשר'};
 const kindPurpose={armor:'כוח תמרון ופריצה ממוכן',infantry:'כוח הלחימה הקרקעי העיקרי',
  artillery:'סיוע אש ארטילרי לכוח',airborne:'כוח מוטס או מוצנח',
  engineer:'פריצת מכשולים, גשרים וסיוע הנדסי',recon:'איסוף מודיעין קרבי וסיור',
  naval:'לחימה ותובלה ימית',air:'סיוע אווירי ובקרת המרחב האווירי',
  cavalry:'סיור ותמרון רכוב',transport:'תובלת חיילים, ציוד ואספקה',signals:'קשר ושליטה'};
 function affiliationOf(unit){
  const nation=nationOfUnit(unit);
  return nation?(axisNations.has(nation)?'מדינות הציר':'בעלות הברית'):'שיוך לא ידוע';
 }
 function roleOf(unit){
  if(unit.est)return echelonHe.representative_force;
  const kind=unitKind(unit),echelon=echelonHe[unit.e]||unit.e||'יחידה';
  return echelon+' · '+(kindHe[kind]||kindHe.infantry);
 }
 function purposeOf(unit){
  if(unit.est)return 'ייצוג קרטוגרפי של צד הלוחמים; המקור לא פירט יחידה שמית';
  const kind=unitKind(unit);
  return (kindPurpose[kind]||kindPurpose.infantry)+' · תפקיד מבני לפי סוג היחידה';
 }
 function periodOf(unit){
  const raw=String(unit.dr||'').replace(/<br\s*\/?>/gi,' ').replace(/&nbsp;/gi,' ')
   .replace(/<ref\b[^>]*\/>/gi,'').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi,'')
   .replace(/\{\{[^{}]*\}\}/g,'').replace(/\(\s*\)/g,'').replace(/\s+/g,' ').trim();
  return raw?raw+' · כפי שמופיע במקור':fromDay(unit.d0)+' – '+fromDay(unit.d1);
 }
 function coordinateLabel(unit){
  if(unit.pl)return unit.pl+' · עוגן הקרב';
  const ns=unit.y>=0?'צ׳':'ד׳',ew=unit.x>=0?'מז׳':'מע׳';
  return Math.abs(unit.y).toFixed(3)+'° '+ns+', '+Math.abs(unit.x).toFixed(3)+'° '+ew+' · עוגן הקרב';
 }
 function commanderOf(unit){
  const exact=(unit.ucmd||[]).filter(Boolean);
  if(exact.length)return exact.join(' · ')+' · מפקד היחידה';
  const side=(unit.cmd||[]).filter(Boolean);
  const shown=side.slice(0,3).join(' · ')+(side.length>3?' · ועוד '+(side.length-3):'');
  return side.length?shown+' · מפקדי צד הקרב; לא אומתו כמפקדי היחידה':'לא ידוע במקור';
 }
 function nationOfUnit(unit){
  if(unit.n)return unit.n;
  if(unit.est)return null;
  const forces=(unit.c||'').split(',').map(x=>x.trim()).filter(x=>countryHe[x]);
  return forces.length===1?forces[0]:null;
 }
 function normUnit(text){return String(text||'').toLowerCase()
  .replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff]+/g,' ')
  .replace(/\b(the|field|force|estimated)\b/g,' ').replace(/\s+/g,' ').trim();}
 function distanceKm(a,b){
  const r=Math.PI/180,dLat=(b.y-a.y)*r,dLon=(b.x-a.x)*r;
  const q=Math.sin(dLat/2)**2+Math.cos(a.y*r)*Math.cos(b.y*r)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
 }
 function movementRegion(unit){
  if(unit.x>60||unit.t==='pacific')return 'pacific';
  if(unit.y<38&&unit.x>-20&&unit.x<65)return 'mediterranean_middle_east';
  if(unit.x>=20&&unit.y>=38)return 'eastern_europe';
  return 'western_europe';
 }
 function buildMovementTracks(){
  const tracks=[],seen=new Set(),named=new Map();
  for(const unit of battleData.units){
   const nation=nationOfUnit(unit),key=normUnit(unit.u);
   if(!nation||!key||unit.est)continue;
   const groupKey=movementRegion(unit)+'|'+nation+'|'+key;
   if(!named.has(groupKey))named.set(groupKey,[]);
   named.get(groupKey).push(unit);
  }
  const add=(a,b,exact)=>{
   if(b.d0<=a.d0||a.x===b.x&&a.y===b.y)return;
   const days=Math.max(1,b.d0-Math.max(a.d0,a.d1||a.d0));
   const km=distanceKm(a,b);
   if(days>540||km/days>(exact?280:170))return;
   const nation=nationOfUnit(a)||nationOfUnit(b);if(!nation)return;
   const signature=[movementRegion(a),nation,a.b,b.b,exact?'exact':'representative'].join('|');
   if(seen.has(signature))return;seen.add(signature);
   const fromDay=Math.max(a.d0,a.d1||a.d0),toDay=Math.max(fromDay+1,b.d0);
   tracks.push({a,b,nation,d0:fromDay,d1:toDay,exact,
    sea:unitKind(a)==='naval',km});
  };
  for(const group of named.values()){
   group.sort((a,b)=>a.d0-b.d0||a.b.localeCompare(b.b));
   const anchors=group.filter((u,i)=>!i||u.b!==group[i-1].b||u.d0!==group[i-1].d0);
   for(let i=1;i<anchors.length;i++)add(anchors[i-1],anchors[i],true);
  }
  // Coverage fallback: consecutive battle anchors for the same nation and
  // theatre. This is a representative movement, never a claim that the same
  // formation travelled between them. Nation equality prevents side mixing.
  const national=new Map();
  for(const unit of battleData.units){
   const nation=nationOfUnit(unit);if(!nation)continue;
   const key=movementRegion(unit)+'|'+nation+'|'+unit.b;
   const prev=national.get(key);
   if(!prev||(!unit.est&&prev.est))national.set(key,unit);
  }
  const byNation=new Map();
  for(const unit of national.values()){
   const key=movementRegion(unit)+'|'+nationOfUnit(unit);
   if(!byNation.has(key))byNation.set(key,[]);byNation.get(key).push(unit);
  }
  for(const group of byNation.values()){
   group.sort((a,b)=>a.d0-b.d0||a.b.localeCompare(b.b));
   for(let i=1;i<group.length;i++)add(group[i-1],group[i],false);
  }
  // מסלולי מבצעים סובייטיים מתועדים. היחידה והמבצע מבוססים על סדר
  // הכוחות; הקו בין נקודות הציון הוא שחזור קרטוגרפי ואינו GPS טקטי.
  const sovietOperations=[
   {u:'5th Tank Army',k:'armor',op:'Operation Uranus',src:'US Army CMH, Moscow to Stalingrad, ch. 22',p:[
    ['1942-11-19',49.58,42.74,'Serafimovich'],['1942-11-23',48.69,43.53,'Kalach']]},
   {u:'4th Mechanized Corps',k:'armor',op:'Operation Uranus',src:'US Army CMH, Moscow to Stalingrad, ch. 22',p:[
    ['1942-11-20',47.63,44.25,'south of Stalingrad'],['1942-11-23',48.69,43.53,'Kalach']]},
   {u:'1st Guards Army',k:'infantry',op:'Operation Little Saturn',src:'US Army CMH, Stalingrad to Berlin, ch. 4',p:[
    ['1942-12-16',50.15,40.95,'Novaya Kalitva'],['1942-12-30',48.92,40.40,'Millerovo']]},
   {u:'13th Army',k:'infantry',op:'Orel offensive',src:'USMA, The War in Eastern Europe, map 16a',p:[
    ['1943-07-12',51.73,36.19,'Kursk'],['1943-08-05',52.97,36.07,'Orel']]},
   {u:'5th Guards Tank Army',k:'armor',op:'Belgorod–Kharkov offensive',src:'USMA, The War in Eastern Europe, map 16a',p:[
    ['1943-07-12',51.04,36.73,'Prokhorovka'],['1943-08-05',50.60,36.60,'Belgorod'],['1943-08-23',49.99,36.23,'Kharkov']]},
   {u:'3rd Guards Tank Army',k:'armor',op:'Battle for the Dnieper',src:'US Army CMH, Stalingrad to Berlin, ch. 9',p:[
    ['1943-10-03',50.91,34.80,'Sumy sector'],['1943-11-06',50.45,30.52,'Kiev'],['1943-11-07',50.08,29.92,'Fastov']]},
   {u:'5th Guards Tank Army',k:'armor',op:'Lower Dnieper offensive',src:'US Army CMH, Stalingrad to Berlin, ch. 9',p:[
    ['1943-10-15',49.07,33.42,'Kremenchug'],['1943-10-18',48.41,33.70,'Pyatikhatka'],['1943-10-23',47.91,33.39,'Krivoi Rog approaches']]},
   {u:'6th Guards Army',k:'infantry',op:'Operation Bagration',src:'US Army CMH, Stalingrad to Berlin, ch. 15',p:[
    ['1944-06-22',55.19,30.20,'Vitebsk'],['1944-07-04',55.49,28.80,'Polotsk']]},
   {u:'5th Guards Tank Army',k:'armor',op:'Operation Bagration',src:'US Army CMH, Stalingrad to Berlin, ch. 15',p:[
    ['1944-06-25',54.51,30.42,'Orsha'],['1944-07-03',53.90,27.56,'Minsk'],['1944-07-13',54.69,25.28,'Vilnius']]},
   {u:'65th Army',k:'infantry',op:'Operation Bagration',src:'US Army CMH, Stalingrad to Berlin, ch. 15',p:[
    ['1944-06-24',53.14,29.22,'Bobruisk'],['1944-06-30',53.03,27.56,'Slutsk'],['1944-07-08',53.13,26.01,'Baranovichi']]},
   {u:'2nd Guards Tank Army',k:'armor',op:'Lublin–Brest offensive',src:'US Army CMH, Stalingrad to Berlin, ch. 15',p:[
    ['1944-07-18',51.22,24.71,'Kovel'],['1944-07-22',51.25,22.57,'Lublin'],['1944-08-01',52.23,21.01,'Warsaw approaches']]},
   {u:'1st Guards Tank Army',k:'armor',op:'Lviv–Sandomierz offensive',src:'US Army CMH, Stalingrad to Berlin, ch. 15',p:[
    ['1944-07-13',50.09,25.15,'Brody'],['1944-07-27',49.84,24.03,'Lviv'],['1944-08-03',50.68,21.75,'Sandomierz']]},
   {u:'5th Guards Tank Army',k:'armor',op:'Baltic offensive',src:'USMA, The War in Eastern Europe, map 21b',p:[
    ['1944-09-14',55.93,23.32,'Siauliai'],['1944-09-22',56.65,23.71,'Jelgava'],['1944-10-10',55.70,21.14,'Memel']]},
   {u:'6th Tank Army',k:'armor',op:'Jassy–Kishinev offensive',src:'USMA, The War in Eastern Europe, map 21a',p:[
    ['1944-08-20',47.16,27.59,'Iasi'],['1944-08-24',47.01,28.86,'Kishinev'],['1944-08-31',44.43,26.10,'Bucharest']]},
   {u:'1st Guards Tank Army',k:'armor',op:'Vistula–Oder offensive',src:'US Army CMH, Stalingrad to Berlin, ch. 19',p:[
    ['1945-01-14',51.76,21.38,'Magnuszew'],['1945-01-19',51.76,19.46,'Lodz'],['1945-01-23',52.41,16.93,'Poznan'],['1945-01-31',52.59,14.65,'Kustrin']]},
   {u:'3rd Guards Tank Army',k:'armor',op:'Vistula–Oder offensive',src:'US Army CMH, Stalingrad to Berlin, ch. 19',p:[
    ['1945-01-12',50.50,21.54,'Baranow bridgehead'],['1945-01-15',50.87,20.63,'Kielce'],['1945-02-06',51.11,17.03,'Breslau']]},
   {u:'11th Guards Army',k:'infantry',op:'East Prussian offensive',src:'USMA, The War in Eastern Europe, map 22',p:[
    ['1945-01-13',54.59,22.20,'Gumbinnen'],['1945-01-22',54.63,21.81,'Insterburg']]},
   {u:'11th Guards Army',k:'infantry',op:'Battle of Konigsberg',src:'USMA, The War in Eastern Europe, map 22',p:[
    ['1945-04-06',54.67,20.62,'Konigsberg perimeter'],['1945-04-09',54.71,20.51,'Konigsberg']]},
   {u:'8th Guards Army',k:'infantry',op:'Battle of Berlin',src:'US Army CMH, Stalingrad to Berlin, ch. 21',p:[
    ['1945-04-16',52.57,14.63,'Kustrin'],['1945-04-19',52.53,14.38,'Seelow'],['1945-05-02',52.52,13.405,'Berlin']]},
   {u:'3rd Guards Tank Army',k:'armor',op:'Battle of Berlin',src:'US Army CMH, Stalingrad to Berlin, ch. 21',p:[
    ['1945-04-16',51.74,14.64,'Neisse'],['1945-04-21',51.57,14.38,'Spremberg'],['1945-04-25',52.40,13.40,'south Berlin']]}
  ];
  // צירי המבצעים המרכזיים שהיו חסרים במזרח התיכון. נקודות הציון
  // מתועדות בהיסטוריות הרשמיות; הקו ביניהן הוא שחזור קרטוגרפי.
  const middleEastOperations=[
   {n:'United Kingdom',u:'7th Armoured Division',k:'armor',op:'Operation Compass',src:'British official history, Mediterranean and Middle East, Vol. I',p:[
    ['1940-12-09',31.31,28.88,'Sidi Barrani'],['1941-01-03',31.76,25.09,'Bardia'],['1941-01-22',32.08,23.96,'Tobruk'],['1941-02-04',32.18,22.28,'Mechili'],['1941-02-07',31.24,20.31,'Beda Fomm']]},
   {n:'Australia',u:'7th Australian Division',k:'infantry',op:'Operation Exporter',src:'Australian and British official histories, Syria-Lebanon campaign',p:[
    ['1941-06-08',33.05,35.10,'Palestine frontier'],['1941-06-13',33.56,35.37,'Sidon'],['1941-07-06',33.73,35.46,'Damour'],['1941-07-12',33.89,35.50,'Beirut']]},
   {n:'India',u:'5th Indian Infantry Brigade',k:'infantry',op:'Operation Exporter',src:'British official history, Mediterranean and Middle East, Vol. II',p:[
    ['1941-06-08',32.62,36.10,'Deraa'],['1941-06-15',33.13,36.28,'Kiswe'],['1941-06-21',33.51,36.29,'Damascus']]},
   {n:'United Kingdom',u:'Habforce',k:'armor',op:'Operation Exporter',src:'British official history, Mediterranean and Middle East, Vol. II',p:[
    ['1941-06-14',32.13,36.10,'Transjordan'],['1941-06-21',34.56,38.27,'Palmyra']]},
   {n:'India',u:'10th Indian Division',k:'infantry',op:'Syria campaign from Iraq',src:'British official history, Mediterranean and Middle East, Vol. II',p:[
    ['1941-06-27',33.31,44.37,'Baghdad'],['1941-07-03',35.34,40.14,'Deir ez-Zor'],['1941-07-08',36.20,37.16,'Aleppo approaches']]},
   {n:'Soviet Union',u:'53rd Army',k:'infantry',op:'Anglo-Soviet invasion of Iran',src:'Soviet and British campaign histories, August 1941',p:[
    ['1941-08-25',38.46,48.88,'Astara'],['1941-08-28',38.08,46.29,'Tabriz'],['1941-09-01',36.27,50.00,'Qazvin']]},
   {n:'United Kingdom',u:'Eighth Army',k:'armor',op:'Western Desert advance',src:'British official history, Mediterranean and Middle East, Vol. IV',p:[
    ['1942-10-23',30.84,28.95,'El Alamein'],['1942-11-13',32.08,23.96,'Tobruk'],['1942-12-18',30.27,19.20,'El Agheila'],['1943-01-23',32.89,13.19,'Tripoli'],['1943-03-20',33.62,10.28,'Mareth'],['1943-05-13',36.81,10.18,'Tunis']]},
   {n:'India',u:'4th Indian Division',k:'infantry',op:'East African campaign',src:'British official history, East Africa campaign',p:[
    ['1941-01-19',15.45,36.40,'Kassala'],['1941-01-31',15.55,37.89,'Agordat'],['1941-03-27',15.78,38.45,'Keren'],['1941-04-01',15.34,38.93,'Asmara']]},
   {n:'Germany',u:'15th Panzer Division',k:'armor',op:'Afrika Korps advance',src:'British official history, Mediterranean and Middle East, Vol. II',p:[
    ['1941-03-24',30.27,19.20,'El Agheila'],['1941-04-04',32.12,20.07,'Benghazi'],['1941-04-10',32.08,23.96,'Tobruk perimeter']]}
  ];
  for(const op of sovietOperations.concat(middleEastOperations)){
   for(let i=1;i<op.p.length;i++){
    const pa=op.p[i-1],pb=op.p[i];
    const nation=op.n||'Soviet Union';
    const a={d0:toDay(pa[0]),d1:toDay(pa[0]),y:pa[1],x:pa[2],b:pa[3],u:op.u,e:op.k,n:nation};
    const b={d0:toDay(pb[0]),d1:toDay(pb[0]),y:pb[1],x:pb[2],b:pb[3],u:op.u,e:op.k,n:nation};
    tracks.push({a,b,nation:nation,d0:a.d0,d1:b.d0,exact:true,
     historic:true,priority:3,sea:false,km:distanceKm(a,b),operation:op.op,source:op.src});
   }
  }
  return tracks.sort((a,b)=>(b.priority||0)-(a.priority||0)||
   Number(b.exact)-Number(a.exact)||a.d0-b.d0);
 }
 const movementTracks=buildMovementTracks();
 function pointOnTrack(track,day){
  const p=Math.max(0,Math.min(1,(day-track.d0)/(track.d1-track.d0)));
  return {lat:track.a.y+(track.b.y-track.a.y)*p,
   lon:track.a.x+(track.b.x-track.a.x)*p,p};
 }
 const surfaceSegmentCache=new WeakMap();
 function surfaceAt(lat,lon,track){
  if(typeof window.WW2IsLand==='function')return window.WW2IsLand(lat,lon)?'land':'sea';
  return track.sea?'sea':'land';
 }
 function transferForSurface(unit,surface){
  // חוק תצוגה קשיח: בים תמיד כלי שיט; ביבשה לעולם לא כלי שיט.
  if(surface==='sea')return 'naval';
  const kind=unitKind(unit);
  return kind==='naval'?'transport':kind;
 }
 function surfaceSegments(track){
  if(surfaceSegmentCache.has(track))return surfaceSegmentCache.get(track);
  const steps=Math.max(4,Math.min(90,Math.ceil((track.km||distanceKm(track.a,track.b))/35)));
  const segments=[];
  for(let i=0;i<steps;i++){
   const p0=i/steps,p1=(i+1)/steps,pm=(p0+p1)/2;
   const a=[track.a.y+(track.b.y-track.a.y)*p0,track.a.x+(track.b.x-track.a.x)*p0];
   const b=[track.a.y+(track.b.y-track.a.y)*p1,track.a.x+(track.b.x-track.a.x)*p1];
   const mode=surfaceAt(track.a.y+(track.b.y-track.a.y)*pm,
    track.a.x+(track.b.x-track.a.x)*pm,track);
   const last=segments[segments.length-1];
   if(last&&last.mode===mode)last.points.push(b);else segments.push({mode,points:[a,b]});
  }
  surfaceSegmentCache.set(track,segments);return segments;
 }
 function surfaceAudit(){
  let samples=0,mismatches=0;
  for(const track of movementTracks)for(const segment of surfaceSegments(track)){
   const icon=transferForSurface(track.exact?track.a:track.b,segment.mode);
   samples+=segment.points.length;
   if((segment.mode==='sea')!==(icon==='naval'))mismatches++;}
  return {tracks:movementTracks.length,samples,mismatches};
 }
 let lastRenderSurfaceAudit={day:state.day,tracks:0,segments:0,icons:0,
  seaIcons:0,landIcons:0,mismatches:0};
 function publishRenderSurfaceAudit(audit){
  lastRenderSurfaceAudit=audit;
  document.documentElement.dataset.ww2SurfaceAudit=JSON.stringify(audit);
  document.documentElement.dataset.ww2SurfaceInvariant=
   audit.mismatches===0?'ok':'failed';
 }
 function trackTouches(track,bounds,day){
  if(!bounds)return true;
  const p=pointOnTrack(track,day);
  return bounds.pad(.15).contains([p.lat,p.lon])||
   bounds.contains([track.a.y,track.a.x])||bounds.contains([track.b.y,track.b.x]);
 }
 function activeMovementTracks(day,bounds,applyFilter=false){
  return movementTracks.filter(track=>day>=track.d0&&day<=track.d1&&
   (!applyFilter||picked(track.nation))&&trackTouches(track,bounds,day));
 }
 function hasActiveMovement(day,bounds){
  return activeMovementTracks(Number(day),bounds||map.getBounds(),false).length>0;
 }
 let effectiveFrontDay=state.day;
 function supportedFrontDay(day){
  day=Number(day);
  effectiveFrontDay=day;
  return day;
 }
 function renderMovements(){
  movementLayer.clearLayers();
  if(!state.movements){
   publishRenderSurfaceAudit({day:state.day,tracks:0,segments:0,icons:0,
    seaIcons:0,landIcons:0,mismatches:0});
   return 0;
  }
  const active=activeMovementTracks(state.day,map.getBounds(),true);
  const zoom=map.getZoom(),compact=zoom<=8;
  const cap=zoom<=4?24:zoom===5?36:zoom===6?48:zoom===7?60:80,compactMarkers=[];
  const audit={day:state.day,tracks:0,segments:0,icons:0,
   seaIcons:0,landIcons:0,mismatches:0};
  for(const track of active.slice(0,cap)){
   const p=pointOnTrack(track,state.day),unit=track.exact?track.a:track.b;
   let surface=surfaceAt(p.lat,p.lon,track);
   let placed=surface==='land'?(window.WW2FrontPlaceOnSide?.(p.lat,p.lon,state.day,
    axisNations.has(track.nation))||p):p;
   // תיקון-צד אינו רשאי לדחוף כלי יבשתי אל הים.
   if(surface==='land'&&surfaceAt(placed.lat,placed.lon,track)==='sea')placed=p;
   surface=surfaceAt(placed.lat,placed.lon,track);
   const transfer=transferForSurface(unit,surface);
   for(const segment of surfaceSegments(track)){
    audit.segments++;
    L.polyline(segment.points,{
     color:segment.mode==='sea'?'#17698a':color(track.nation),
     weight:track.historic?2.4:track.exact?1.5:1.1,
     opacity:track.historic?.78:track.exact?.55:.38,
     dashArray:segment.mode==='sea'?'3,5':track.historic?'7,4':track.exact?'5,5':'2,7',
     interactive:false}).addTo(movementLayer);
   }
   audit.tracks++;
   if((surface==='sea')!==(transfer==='naval')){
    audit.mismatches++;publishRenderSurfaceAudit(audit);
    throw new Error('surface/icon invariant failed');
   }
   const lines=[
     ['יחידה',track.exact?unit.u:'כוח מייצג משוער'],
     ['מדינה',countryHe[track.nation]||track.nation],
     ['מבצע',track.operation||'—'],
     ['מקרב',track.a.b],['אל קרב',track.b.b],
     ['תקופה',fromDay(track.d0)+' – '+fromDay(track.d1)],
     ['מעמד',track.historic?
      'יחידה ומבצע מתועדים; התנועה בין נקודות הציון היא שחזור קרטוגרפי':track.exact?
      'זהות היחידה משותפת בשני עוגני קרב; הנתיב ביניהם משוער':'תנועה מייצגת משוערת בין קרבות של אותה מדינה; לא הוכח שזו אותה יחידה'],
     ['אופן',surface==='sea'?'מקטע ימי — מוצג ככלי שיט':'מקטע יבשתי — מוצג ככלי/יחידה יבשתית'],
     ['בקרת תוואי','סווג ים/יבשה נבדק בכל נקודה מול מסכת CShapes'],
     ['תיקון צד',placed.corrected?'הסמל הוסט לתא הקרוב שבשליטת הצד שלו באותו יום':'לא נדרש'],
     ['מקור',track.source||'נתוני הקרבות בגרף']
    ];
   if(compact){compactMarkers.push({placed,track,unit,surface,transfer});}
   else{
    audit.icons++;if(surface==='sea')audit.seaIcons++;else audit.landIcons++;
    L.marker([placed.lat,placed.lon],{icon:nationalIcon(track.nation,'moving',transfer,'',0,
     color(track.nation)),title:(track.exact?unit.u:'כוח מייצג משוער')})
     .bindPopup(popup(lines)).addTo(movementLayer);
   }
  }
  if(compact){
   const bins=new Map(),cell=68;
   for(const item of compactMarkers){
    const point=map.latLngToContainerPoint([item.placed.lat,item.placed.lon]);
    const key=item.track.nation+'|'+item.transfer+'|'+Math.floor(point.x/cell)+'|'+
     Math.floor(point.y/cell);
    if(!bins.has(key))bins.set(key,[]);bins.get(key).push(item);
   }
   for(const group of bins.values()){
    const first=group[0],lat=group.reduce((n,x)=>n+x.placed.lat,0)/group.length;
    const lon=group.reduce((n,x)=>n+x.placed.lon,0)/group.length;
    audit.icons++;if(first.surface==='sea')audit.seaIcons++;else audit.landIcons++;
    L.marker([lat,lon],{icon:overviewIcon(first.track.nation,first.transfer,group.length,
     color(first.track.nation)),title:group.length+' תנועות יחידה'}).bindPopup(popup([
      ['תנועות פעילות',group.length],
      ['מדינה',countryHe[first.track.nation]||first.track.nation],
      ['אופן',first.surface==='sea'?'מקטעים ימיים':'מקטעים יבשתיים'],
      ['מסלולים',group.slice(0,8).map(x=>x.track.a.b+' ← '+x.track.b.b).join(' · ')],
      ['הצגה','בזום הרחוק מוצג סמל יחידה ומספר בלבד; התקרבות פותחת כל תנועה']
     ])).addTo(movementLayer);
   }
  }
  publishRenderSurfaceAudit(audit);
  return active.length;
 }
 function fanPoint(unit,index,count){
  const zoom=map.getZoom(),origin=map.project([unit.y,unit.x],zoom);
  const perColumn=zoom>=7?7:5,column=Math.floor(index/perColumn);
  const rows=Math.min(count-column*perColumn,perColumn);
  const row=index%perColumn-(rows-1)/2;
  const nation=nationOfUnit(unit),wantsAxis=axisNations.has(nation);
  const vector=window.WW2FrontFriendlyVector?.(unit.y,unit.x,state.day,wantsAxis);
  let dx=unit.s===1?1:-1,dy=0;
  if(vector){const target=map.project([unit.y+vector.lat,unit.x+vector.lon],zoom);
   const length=Math.hypot(target.x-origin.x,target.y-origin.y);
   if(length>1){dx=(target.x-origin.x)/length;dy=(target.y-origin.y)/length;}}
  const along=43+column*(zoom>=7?47:42),across=row*(zoom>=7?34:30)+(column%2?15:0);
  const x=origin.x+dx*along-dy*across;
  const y=origin.y+dy*along+dx*across;
  return map.unproject([x,y],zoom);
 }
 function battleUnitIcon(unit,more){
  const sideColor=color(nationOfUnit(unit));
  // Country name is the dominant mark; the small illustration shows the role.
  // Full formation names stay in the popup; permanent labels turned every
  // dense campaign corridor into an unreadable wall of white tabs.
  const label='';
  return nationalIcon(nationOfUnit(unit),more?'cluster':'unit',
   more?'infantry':unitKind(unit),label,more,sideColor);
 }
 function renderBattleUnits(){
  battleUnitLayer.clearLayers();
  if(!state.battleUnits||!battleData.units.length)return 0;
  const bounds=map.getBounds().pad(.25),groups=new Map(),selected=[];
  const historicalLatest=new Map(),zoom=map.getZoom();
  for(const unit of battleData.units){
   if(state.country!=='all'&&nationOfUnit(unit)!==state.country)continue;
   if(!bounds.contains([unit.y,unit.x]))continue;
   const active=state.day>=unit.d0-3&&state.day<=unit.d1+21;
   if(active){selected.push(unit);continue;}
   if(state.day<unit.d0||!window.WW2IsMiddleEast?.(unit.y,unit.x))continue;
   // היסטוריית הזירה נשארת נגישה: לכל יחידה שמית מוצג העוגן
   // המאוחר הידוע לפני היום הנבחר. כוח משוער מוצג רק בזום מקומי.
   if(unit.est&&zoom<9)continue;
   const key=unit.est?'estimate|'+unit.b+'|'+unit.s+'|'+(nationOfUnit(unit)||'unknown'):
    'named|'+(nationOfUnit(unit)||'unknown')+'|'+normUnit(unit.u);
   const old=historicalLatest.get(key);
   if(!old||unit.d0>old.d0)historicalLatest.set(key,{...unit,_historical:true});
  }
  selected.push(...historicalLatest.values());
  for(const unit of selected){
   const key=unit.b+'|'+unit.x+'|'+unit.y;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(unit);
  }
  if(zoom<=8){
   const bins=new Map(),cell=zoom<=4?112:zoom===5?94:zoom===6?76:
    zoom===7?58:44;
   for(const unit of selected){
    const nation=nationOfUnit(unit);
    const camp=axisNations.has(nation)?'axis':nation?'allies':
     'unknown|'+unit.b+'|'+unit.s;
    const point=map.latLngToContainerPoint([unit.y,unit.x]);
    const key=camp+'|'+Math.floor(point.x/cell)+'|'+Math.floor(point.y/cell);
    if(!bins.has(key))bins.set(key,[]);bins.get(key).push(unit);
   }
   for(const same of bins.values()){
    const sample=same.find(unit=>nationOfUnit(unit))||same[0];
    const nation=nationOfUnit(sample),wantsAxis=axisNations.has(nation);
    const kinds=new Map();
    for(const unit of same){const kind=unitKind(unit);
     kinds.set(kind,(kinds.get(kind)||0)+1);}
    const dominant=[...kinds].sort((a,b)=>b[1]-a[1])[0]?.[0]||'infantry';
    const lat=same.reduce((n,unit)=>n+unit.y,0)/same.length;
    const lon=same.reduce((n,unit)=>n+unit.x,0)/same.length;
    const placed=nation?(window.WW2FrontPlaceOnSide?.(lat,lon,state.day,wantsAxis)||
     {lat,lon}):{lat,lon};
    const sideColor=nation?(wantsAxis?'#a63c2e':'#2b6ca3'):color(nation);
    L.marker([placed.lat,placed.lon],{icon:overviewIcon(nation,dominant,same.length,
     sideColor),title:same.length+' יחידות באזור'}).bindPopup(popup([
      ['יחידות באזור',same.length],
      ['מחנה',nation?(wantsAxis?'מדינות הציר':'בעלות הברית'):'צד לא מזוהה'],
      ['מדינות',[...new Set(same.map(nationOfUnit).filter(Boolean))]
       .map(n=>countryHe[n]||n).join(' · ')||'לא ידוע'],
      ['קרבות',[...new Set(same.map(unit=>unit.b))].slice(0,8).join(' · ')],
      ['הצגה','קיבוץ אזורי עד זום 8; מזום 9 היחידות נפתחות בהדרגה']
     ])).addTo(battleUnitLayer);
   }
   return bins.size;
  }
  const perSide=zoom===9?2:zoom===10?4:zoom===11?8:zoom===12?16:28;
  let rendered=0;
  for(const units of groups.values()){
   const battle=[units[0].y,units[0].x];
   for(const side of [1,2]){
    const same=units.filter(unit=>unit.s===side).sort((a,b)=>a.u.localeCompare(b.u));
    if(!same.length)continue;
    const current=same.filter(unit=>!unit._historical).slice(0,perSide);
    const history=same.filter(unit=>unit._historical);
    const historyCap=zoom===9?1:zoom===10?2:zoom===11?3:zoom===12?5:8;
    const visible=current.concat(history.slice(0,Math.max(0,historyCap-current.length)));
    visible.forEach((unit,index)=>{
     const pos=fanPoint(unit,index,visible.length);
     L.polyline([battle,pos],{color:color(nationOfUnit(unit)),weight:.7,
      opacity:unit._historical?0.13:0.24,interactive:false}).addTo(battleUnitLayer);
     L.marker(pos,{icon:battleUnitIcon(unit,0),title:unit.u,
      opacity:unit._historical?0.78:1}).bindPopup(popup([
     ['יחידה',unit.u],['קרב',unit.b],['צד בקרב','צד '+unit.s],
      ['תקופה',periodOf(unit)],['מיקום',coordinateLabel(unit)],
      ['שיוך',affiliationOf(unit)],
      ['דגל',(flagSpec[nationOfUnit(unit)]||['--'])[0]],
      ['מדינה',countryHe[nationOfUnit(unit)]||nationOfUnit(unit)||'לא ידוע'],
      ['תפקיד',roleOf(unit)],['תפקיד בכוח',purposeOf(unit)],
      ['יחידת־אם',unit.p||'לא ידוע במקור'],
      ['דרג יחידת־האם',unit.pe?echelonHe[unit.pe]||unit.pe:null],
      ['תאריך שיוך',unit.pd],['מפקד',commanderOf(unit)],
      ['מעמד',unit._historical?'עוגן היסטורי — היחידה לחמה כאן; אין טענה שזה מיקומה ביום הנבחר':unit.est?'כוח מייצג משוער — המקור מזהה את צד הלוחמים אך לא פירט יחידה':'יחידה שמית ממקור הקרב'],
      ['בסיס שיוך הצד',unit.sb==='infobox_column'?'עמודת היחידות במקור':unit.sb==='combatant_column_estimate'?'עמודת הצדדים במקור':unit.sb==='timeline_belligerent_estimate'?'צדדי הקרב ברשומת הגרף':'לאום היחידה מתאים לצד אחד בלבד'],
      ['דיוק מיקום','פיזור סכמטי ליד נקודת הקרב; לא קואורדינטת יחידה'],
      ['עוגן הקרב',unit.geo==='graph_battle_anchor'?'קואורדינטת הקרב מהגרף':'קואורדינטת הקרב מהערך'],
      ['מקור יחידת־האם',unit.ps],['מקור',unit.loc||unit.src]
     ])).addTo(battleUnitLayer);rendered++;
    });
    const hidden=same.length-visible.length;
    if(hidden>0&&visible.length){
     const sample={...visible[0],u:'יחידות נוספות'};
     const pos=fanPoint(sample,visible.length,visible.length+1);
     L.marker(pos,{icon:battleUnitIcon(sample,hidden)}).bindPopup(popup([
      ['קרב',sample.b],['צד בקרב','צד '+side],['יחידות נוספות',hidden],
      ['יחידות',same.filter(unit=>!visible.includes(unit)).slice(0,18)
       .map(unit=>unit.u).join(' · ')],
      ['הצגה','קיבוץ למניעת חפיפה; הפרטים נשמרים כאן ומתרחבים בזום']
     ])).addTo(battleUnitLayer);
    }
   }
  }
  return rendered;
 }
 function renderBases(){
  baseLayer.clearLayers();
  if(!state.bases)return 0;
  const bounds=map.getBounds().pad(.15),shown=allBases.filter(b=>
   picked(b.nation)&&bounds.contains([b.lat,b.lon]));
  for(const group of clusters(shown,'base').slice(0,180)){
   const b=group[0];
   if(group.length>1)marker(b.lat,b.lon,b.nation,'cluster','base',[
    ['מתקנים באזור',group.length],['מדינה',countryHe[b.nation]||b.nation],
    ['דוגמאות',group.slice(0,5).map(x=>x.name).join(' · ')],
    ['דיוק','מקובצים סביב מיקום עיר; לא מיקום מתקן מדויק']
   ],baseLayer,group.length+' מתקנים');
   else marker(b.lat,b.lon,b.nation,'base',baseIcon[b.role]||'base',[
    ['מתקן',b.name],['סוג',names[b.role]||b.role],
    ['מדינה',countryHe[b.nation]||b.nation],['מקום',b.place],
    ['תקופה',b.dates||'תקופת מלחמת העולם השנייה; תאריכי פעילות לא ידועים'],
    ['דיוק','מיקום העיר/האזור, לא כתובת המתקן'],['מקור',b.source]
   ],baseLayer,b.name);
  }
  return shown.length;
 }
 function renderForts(){
  fortLayer.clearLayers();
  if(!state.forts)return 0;
  let n=0;
  for(const f of data.fortifications){
   if(!picked(f.nation))continue;
   const coords=f.points.map(p=>[p[1],p[0]]);
   if(!coords.some(p=>map.getBounds().pad(.2).contains(p)))continue;
   L.polyline(coords,{color:color(f.nation),weight:2,opacity:.55,
    dashArray:'5,5'}).bindPopup(popup([
    ['קו ביצורים',f.name],['נבנה בידי',countryHe[f.nation]||f.nation],
    ['שנות הקמה',f.construction_years],
    ['דיוק','תוואי מקורב; אינו מציין מי שלט בו ביום המוצג'],
    ['מקור',(f.sources||[]).join(', ')]
   ])).addTo(fortLayer);n++;
  }
  return n;
 }
 let staticKey='',unitKey='',baseCount=0,fortCount=0,unitCount=0,battleUnitCount=0,
  movementCount=0;
 function render(force=false){
  const view=[state.country,map.getZoom(),map.getBounds().toBBoxString()].join('|');
  const nextStatic=[view,state.bases,state.forts].join('|');
  const nextUnit=[view,state.units,state.battleUnits,state.movements,state.day].join('|');
  if(force||nextStatic!==staticKey){
   staticKey=nextStatic;
   baseCount=renderBases();fortCount=renderForts();
  }
  if(force||nextUnit!==unitKey){
   unitKey=nextUnit;unitCount=renderUnits();battleUnitCount=renderBattleUnits();
   movementCount=renderMovements();
  }
  count.textContent='בתצוגה: '+battleUnitCount+' יחידות סביב קרבות · '+
   movementCount+' תנועות פעילות · '+unitCount+' תצפיות מיקום · '+
   baseCount+' מתקנים · '+fortCount+' קווי ביצורים';
  const active=hasActiveMovement(state.day,map.getBounds());
  syncStatus.classList.toggle('hold',state.syncAdvance&&!active);
  syncStatus.textContent=!state.syncAdvance?'מצב קודם: החזית עצמאית מהיחידות':active?
   'סנכרון חזותי פעיל: יחידות נעות עם החזית':'אין מסלול יחידה תומך באזור; תאריך החזית נשאר היסטורי';
 }
 select.onchange=()=>{state.country=select.value;render(true);};
 for(const key of Object.keys(checks))checks[key].onchange=()=>{
  state[key]=checks[key].checked;render(true);
  if(key==='syncAdvance')document.dispatchEvent(new CustomEvent('ww2:frontsyncchange'));
 };
 document.addEventListener('ww2:daychange',event=>{
  state.day=Number(event.detail?.day);
  if(Number.isFinite(state.day))render();});
 map.on('moveend zoomend',()=>{render();
  if(state.syncAdvance)document.dispatchEvent(new CustomEvent('ww2:frontsyncchange'));});
 render(true);
 document.dispatchEvent(new CustomEvent('ww2:frontsyncchange'));
 window.WW2Military={data,battleData,state,render,movementTracks,
  hasActiveMovement,supportedFrontDay,surfaceAudit,
  surfaceRenderAudit:()=>({...lastRenderSurfaceAudit})};
})();
