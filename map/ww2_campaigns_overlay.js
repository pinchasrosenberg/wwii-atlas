/* Long campaigns and multi-year bombing series, kept apart from single battles (review 2026-09-24).
   Data: D.cmpg (moved out of D.bat by tools/map_fixes.py). Off by default; toggle in 'זרימות ואומדנים'. */
(()=>{'use strict';
if(!window.L||typeof map==='undefined'||typeof D==='undefined'||!Array.isArray(D.cmpg)||!D.cmpg.length)return;
const layer=L.layerGroup();let on=false;
const heDate=d=>new Date(Date.UTC(1937,0,1)+d*864e5).toLocaleDateString('he-IL',{year:'numeric',month:'short',day:'numeric'});
const fmt=n=>Number(n).toLocaleString('he-IL');
function draw(day){layer.clearLayers();if(!on)return;
 for(const b of D.cmpg){if(b.f==null)continue;const e=b.e??b.f;if(day<b.f||day>e)continue;
  const m=L.circleMarker([b.y,b.x],{radius:13,color:'#7b241c',weight:1.6,dashArray:'4,4',fill:false});
  m.bindTooltip(`מערכה: ${b.n}`,{direction:'top'});
  m.bindPopup(`<b>🗺️ ${b.n}</b><br><span style="color:#5a6b64">${b.en||''}</span>`+
   `<br>מערכה או סדרת פעולות — לא קרב יחיד`+
   `<br>${heDate(b.f)} – ${heDate(e)}${b.prec==='year'?' <span style="color:#8a7050">(התחלה: שנה בלבד)</span>':''}`+
   (b.cas?`<br>נפגעים לפי הגרף: ${fmt(b.cas)}`:''));
  m.addTo(layer);}}
const box=document.getElementById('ww2Enrich');
if(box){const label=document.createElement('label');label.style.display='block';
 label.innerHTML=`<input type="checkbox" id="ww2CampaignToggle"> 🗺️ מערכות ומבצעים מתמשכים (${D.cmpg.length}) — עיגול מקווקו`;
 box.append(label);
 label.querySelector('input').onchange=e=>{on=e.target.checked;if(on)layer.addTo(map);else map.removeLayer(layer);draw(+slider.value);};}
const prev=tick;tick=function(day){prev(day);if(on)draw(day);};
window.WW2Campaigns={layer,draw,count:D.cmpg.length};
})();
