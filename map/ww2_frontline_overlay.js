/* Source-located front observations. The dated line is not an invented
   control polygon and is not extrapolated across long gaps. */
(()=>{'use strict';
const evidence=window.WW2_FRONT_REFRESH?.observed_lines;
if(!Array.isArray(evidence)||!evidence.length)return;
const dayOf=s=>Math.round((Date.parse(s+'T00:00:00Z')-Date.UTC(1937,0,1))/864e5);
const rows=evidence.map(x=>({...x,day:dayOf(x.date)})).sort((a,b)=>a.day-b.day);
const pairs=(window.WW2_FRONT_REFRESH?.interpolated_lines||[])
 .map(x=>({...x,fromDay:dayOf(x.from),toDay:dayOf(x.to)}));
const layer=L.layerGroup().addTo(map);
let enabled=true,shown=null;
const container=document.getElementById('ww2Enrich');
let status=null;
if(container){const label=document.createElement('label');label.style.display='block';
 label.innerHTML=`<input type="checkbox" id="ww2ObservedFrontToggle" checked> 📍 קווי חזית ממפות מקור (${rows.length} מועדים) + תנועה יומית מבוקרת`;
 container.append(label);
 label.querySelector('input').onchange=e=>{enabled=e.target.checked;update(+slider.value);};
 const note=document.createElement('div');note.style.cssText='font-size:10px;color:#786a55;line-height:1.35';
 note.textContent='קו כהה = תצפית; קו כתום = אומדן יומי בין שתי תצפיות סמוכות. אין להסיק מקו זה שליטה מלאה; מילוי השטח הוא מודל קרבות וגבולות חודשיים.';
 container.append(note);
 status=document.createElement('div');status.id='ww2ObservedFrontStatus';
 status.style.cssText='font-size:10px;color:#304c69;line-height:1.35';container.append(status);}
function draw(coords,style,popup){L.polyline(coords.map(p=>[p[1],p[0]]),style).bindPopup(popup).addTo(layer);}
function update(day){layer.clearLayers();shown=null;
 if(status)status.textContent=enabled?'אין קו חזית מתועד סמוך לתאריך הנוכחי.':'קווי חזית מתועדים מוסתרים.';
 if(!enabled)return;
 const exact=rows.find(x=>x.day===day);
 const pair=exact?null:pairs.find(x=>x.fromDay<day&&day<x.toDay);
 if(pair){const fraction=(day-pair.fromDay)/(pair.toDay-pair.fromDay);
  const coords=pair.from_coords.map((p,i)=>p.map((v,j)=>v+(pair.to_coords[i][j]-v)*fraction));
  const date=new Date(Date.UTC(1937,0,1)+day*864e5).toISOString().slice(0,10);
  shown={date,kind:'interpolated'};
  if(status)status.textContent=`אומדן קו חזית ל־${date} · בין ${pair.from} ל־${pair.to} · שגיאת מקור ≥${pair.error_km} ק״מ`;
  draw(coords,{color:'#d46b18',weight:3,opacity:.88,dashArray:'5,7',className:'ww2-interpolated-front'},
   `<b>🟠 אומדן התקדמות יומי — ${date}</b><br>חושב בין שתי מפות מקור: ${pair.from}, ${pair.to}`+
   `<br>הזזת הצורה המרבית בין התצפיות: ${pair.max_shift_km} ק״מ`+
   `<br>שגיאת מיקום של מפות המקור: לפחות ${pair.error_km} ק״מ; אי־ודאות האומדן גדולה יותר.`+
   `<br>אין לראות בקו הזה תיעוד יומי או גבול שליטה מדויק.`);return;}
 let latest=exact; if(!latest)for(const row of rows){if(row.day>day)break;latest=row;}
 if(!latest||day-latest.day>3)return;
 shown={date:latest.date,kind:day===latest.day?'observed':'carried_observation'};
 if(status)status.textContent=`קו חזית מתועד: ${latest.date}${day>latest.day?' (תצפית קודמת)':''} · שגיאת מיקום ~${latest.error_km||'?'} ק״מ`;
 draw(latest.coords,{color:'#192f50',weight:3.6,opacity:.94,
  dashArray:'10,5',className:'ww2-observed-front'},
  `<b>📍 קו חזית כפי שדווח ב־${latest.date}</b>`+
   `<br>מקור: ${(latest.source_ids||[]).join(' · ')||'לא צוין'}`+
   `<br>שגיאת מיקום מוערכת: כ־${latest.error_km||'?'} ק״מ`+
   `<br>מוצג ${day-latest.day} ימים אחרי התצפית. אין להסיק ממנו שליטה מלאה בכל תא.`);}
const previousTick=tick;
tick=function(day){previousTick(day);update(day);};
update(+slider.value);
window.WW2ObservedFront={get shown(){return shown;},count:rows.length,interpolatedPairs:pairs.length};
})();
