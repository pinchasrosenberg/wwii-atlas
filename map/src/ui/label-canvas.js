/**
 * ‏שכבת תוויות על קנבס דו-ממדי.
 *
 * ⚠️ **למה לא deck.gl**
 * ‏‏`TextLayer` בונה אטלס גופנים, ובאטלס הזה **עברית פשוט אינה מצוירת**
 * ‏— גם עם `characterSet` מפורש. שמות המדינות נבנו (27 פריטים הגיעו
 * ‏לשכבה) ולא הופיע דבר. זו מפה עברית שכל תוויות המפה שלה היו בלתי
 * ‏נראות. ‏`fillText` של קנבס רגיל מצייר עברית נכון, וזה בדיוק מה
 * ‏שהמפה האחרת בפרויקט עושה.
 *
 * ‏בונוס שמגיע עם זה: הילה אמיתית, קו מוביל מהנקודה אל השם, ומדידת
 * ‏רוחב אמיתית — כלומר גם הפריסה מדויקת ולא משוערת.
 */
import { layoutLabels, measureText } from '../layers/map-labels.js?v=map-channel-19';

const FONT = '"Heebo", -apple-system, "Segoe UI", Arial, sans-serif';

export function createLabelCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas-label-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', zIndex: '3', pointerEvents: 'none',
  });
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height };
  }

  let size = resize();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { size = resize(); }).observe(container);
  }

  /** ‏טקסט עם הילה — קריא מעל שטח צבוע ומעל הקרקע כאחד. */
  function stroked(text, x, y, fill, halo, lineWidth) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  return {
    canvas,
    /**
     * ‏`candidates` כבר מדורגים לפי חשיבות. הפריסה מוותרת רק על מה
     * ‏שאין לו מקום, ולכן הראשון בתור הוא זה ששורד.
     */
    draw(candidates) {
      ctx.clearRect(0, 0, size.width + 2, size.height + 2);
      if (!candidates.length) return 0;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      const measured = candidates.map((item) => {
        ctx.font = `${item.weight || 700} ${item.size}px ${FONT}`;
        return { ...item, width: ctx.measureText(item.text).width };
      });
      const placed = layoutLabels(measured, {
        width: size.width, height: size.height, measure: measureText,
      });

      for (const label of placed) {
        ctx.font = `${label.weight || 700} ${label.size}px ${FONT}`;
        ctx.globalAlpha = label.alpha ?? 1;
        if (label.leader) {
          // ‏קו מוביל דק: בלעדיו התווית מרחפת בלי קשר לנקודה שלה
          ctx.strokeStyle = 'rgba(70,86,97,.45)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(label.anchor[0] + 3, label.anchor[1]);
          ctx.lineTo(label.position[0] - 1, label.position[1]);
          ctx.stroke();
        }
        stroked(label.text, label.position[0], label.position[1],
          label.color, label.halo || 'rgba(250,247,239,.92)',
          label.haloWidth || label.size * 0.3);
        ctx.globalAlpha = 1;
      }
      return placed.length;
    },
    clear() { ctx.clearRect(0, 0, size.width + 2, size.height + 2); },
  };
}
