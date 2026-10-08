/**
 * ‏פירוט ישות לכרטיס: מי היה בקרב, כמה כוח היה לו, ומה חסר.
 *
 * ‏המודול טהור — הוא מקבל את תשובת השרת ומחזיר שדות. אין בו fetch ואין בו
 * ‏‏DOM, כדי שאפשר יהיה לבדוק את הכלל החשוב בלי דפדפן: מספר שאינו בגרף
 * ‏מוצג כ״לא נרשם״ ולעולם לא כאפס.
 */

export const NO_FIGURE = 'לא נרשם';

const BRANCH_HE = {
  armor: 'שריון', artillery: 'ארטילריה', infantry: 'חי"ר',
  mechanized_infantry: 'חי"ר מכני', motorized_infantry: 'חי"ר ממונע',
  anti_tank: 'נ"ט', air_defense: 'הגנה אווירית', airborne: 'מוטס',
  cavalry: 'פרשים', mountain_infantry: 'חי"ר הררי', engineers: 'הנדסה',
  marines: 'נחתים',
};

export function quantityText(low, high) {
  if (low == null && high == null) return NO_FIGURE;
  const fmt = (n) => Number(n).toLocaleString('he-IL');
  if (low == null) return `עד ${fmt(high)}`;
  if (high == null || high === low) return fmt(low);
  return `${fmt(low)}–${fmt(high)}`;
}

export function branchText(branch, basis) {
  if (!branch || !BRANCH_HE[branch]) return null;
  return BRANCH_HE[branch] + (basis === 'name_pattern' ? ' (זוהה מהשם)' : '');
}

/** שורת משתתף אחת, כפי שהיא נקראת בכרטיס. */
export function participantLine(unit) {
  const bits = [unit.name];
  if (unit.echelon) bits.push(unit.echelon);
  const branch = branchText(unit.branch, unit.branch_basis);
  if (branch) bits.push(branch);
  const strength = unit.strength
    ? quantityText(unit.strength.min, unit.strength.max)
    : NO_FIGURE;
  return { text: bits.join(' · '), strength, nation: unit.nation || null };
}

/**
 * ‏שדות לכרטיס. ‏detail עשוי להיות null (הבקשה נכשלה או טרם חזרה), ואז
 * ‏מוחזר מערך ריק במקום שדות ריקים שנראים כמו נתונים.
 */
export function detailFields(detail) {
  if (!detail) return [];
  if (detail.kind === 'battle') return battleFields(detail);
  if (detail.kind === 'unit') return unitFields(detail);
  return (detail.notes || []).map((note) => ({ label: 'הערה', value: note }));
}

function battleFields(detail) {
  const fields = [];
  const units = detail.participants || [];
  fields.push({
    label: 'יחידות שהשתתפו',
    value: units.length ? String(units.length) : 'לא נרשמו יחידות',
  });
  const withStrength = units.filter((u) => u.strength);
  if (withStrength.length) {
    const min = withStrength.reduce((sum, u) => sum + (u.strength.min ?? u.strength.max ?? 0), 0);
    const max = withStrength.reduce((sum, u) => sum + (u.strength.max ?? u.strength.min ?? 0), 0);
    fields.push({
      label: 'כוח אדם מדווח',
      value: quantityText(min, max),
      derivation: 'source',
      note: `סכום של ${withStrength.length} מתוך ${units.length} היחידות — `
        + 'לשאר אין תצפית כוח אדם בגרף',
    });
  }
  for (const unit of units.slice(0, 24)) {
    const line = participantLine(unit);
    fields.push({
      label: line.nation || 'יחידה',
      value: line.text,
      note: line.strength === NO_FIGURE ? null : `כוח: ${line.strength}`,
    });
  }
  if (units.length > 24) {
    fields.push({ label: '…', value: `ועוד ${units.length - 24} יחידות` });
  }
  for (const note of detail.notes || []) fields.push({ label: 'שקיפות', value: note });
  return fields;
}

function unitFields(detail) {
  if (detail.found === false) {
    return [{ label: 'שקיפות', value: 'היחידה אינה בגרף' }];
  }
  const fields = [];
  if (detail.nation) fields.push({ label: 'אומה', value: detail.nation });
  if (detail.echelon) fields.push({ label: 'דרג', value: detail.echelon });
  const branch = branchText(detail.branch, detail.branch_basis);
  if (branch) {
    fields.push({
      label: 'ענף', value: branch,
      derivation: detail.branch_basis === 'name_pattern' ? 'algorithmic' : 'source',
      note: detail.branch_basis === 'name_pattern'
        ? 'הענף זוהה מתבנית בשם היחידה, לא ממקור' : null,
    });
  }
  for (const observation of detail.manpower || []) {
    fields.push({
      label: `כוח אדם${observation.observed_on ? ` · ${observation.observed_on}` : ''}`,
      value: quantityText(observation.min, observation.max),
      derivation: 'source',
    });
  }
  for (const item of (detail.equipment || []).slice(0, 20)) {
    fields.push({
      label: `ציוד${item.observed_on ? ` · ${item.observed_on}` : ''}`,
      value: `${item.name}: ${quantityText(item.min, item.max)}`,
      derivation: 'source',
    });
  }
  const battles = detail.battles || [];
  if (battles.length) {
    fields.push({ label: 'קרבות', value: String(battles.length) });
    for (const battle of battles.slice(0, 12)) {
      fields.push({
        label: battle.from || 'קרב',
        value: battle.name,
      });
    }
  }
  for (const note of detail.notes || []) fields.push({ label: 'שקיפות', value: note });
  return fields;
}

/** סיכום בחירת מצולע, כשורות קריאות. */
export function selectionFields(selection) {
  if (!selection) return [];
  if (!selection.count) {
    return [{ label: 'בבחירה', value: 'אין פריטים ממוקמים בתוך המצולע' }];
  }
  const fields = [{ label: 'פריטים בבחירה', value: String(selection.count) }];
  const named = (map, label) => {
    const parts = Object.entries(map || {}).map(([k, n]) => `${k}: ${n}`);
    if (parts.length) fields.push({ label, value: parts.join(' · ') });
  };
  named(selection.by_kind, 'לפי סוג');
  named(selection.by_side, 'לפי צד');
  named(selection.by_quality, 'לפי סוג טענה');
  if (selection.strength) {
    fields.push({
      label: 'כוח אדם מדווח',
      value: quantityText(selection.strength.min, selection.strength.max),
      derivation: 'source',
      note: `מ-${selection.strength.units} יחידות שיש להן תצפית כוח אדם`,
    });
  }
  fields.push({ label: 'מקורות', value: String(selection.sources) });
  if (selection.reconstructed) {
    fields.push({
      label: 'שחזור',
      value: `${selection.reconstructed} מתוך ${selection.count}`,
      derivation: 'algorithmic',
      note: 'מיקום משוחזר או מוערך, לא מתועד',
    });
  }
  for (const note of selection.notes || []) fields.push({ label: 'שקיפות', value: note });
  return fields;
}
