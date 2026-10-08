/**
 * בדיקת זהות בין המנרמל בפייתון למנרמל ב-JavaScript.
 *
 * זו הבדיקה היחידה בפרויקט שחוצה שפות, והיא קיימת כי הכשל שהיא מונעת
 * שקט לחלוטין: אם ה-ETL מנרמל "Lwów" לצורה אחת והדפדפן מנרמל אותו
 * לצורה אחרת, החיפוש פשוט לא ימצא — בלי שגיאה, בלי אזהרה, בלי כלום.
 *
 *     node tools/test-normalizer-parity.mjs
 *
 * דורש python3 בנתיב ואת תיקיית etl לצד תיקיית web.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeToken } from '../src/core/search-index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ETL = join(ROOT, '..', 'etl');

const CASES = [
  'Lwów',
  'Lviv',
  'Lemberg',
  'למברג',
  'Львів',
  'Ελλάδα',
  'Sankt Pölten',
  'Kraków-Płaszów',
  'Auschwitz II — Birkenau',
  "Ma'ale",
  'Frankfurt an der Oder',
  'ORAN / وهران',
  'St. Nazaire',
  '  ריבוי   רווחים  ',
  'MiXeD CaSe 123',
  'Ćwiklice',
  'Târgu Mureș',
  'Þingvellir',
];

const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(ETL)})
import re, unicodedata

def normalize(text):
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\\w\\s]", " ", s, flags=re.UNICODE)
    return " ".join(s.split())

cases = json.loads(sys.argv[1])
print(json.dumps([normalize(c) for c in cases], ensure_ascii=False))
`;

if (!existsSync(ETL)) {
  console.error(`✗ לא נמצא ${ETL} — הבדיקה דורשת ששני הפרויקטים יהיו זה לצד זה`);
  process.exit(1);
}

let pyOut;
try {
  pyOut = execFileSync('python3', ['-c', py, JSON.stringify(CASES)], {
    encoding: 'utf8',
  });
} catch (e) {
  console.error(`✗ הרצת פייתון נכשלה: ${e.message}`);
  process.exit(1);
}

const fromPython = JSON.parse(pyOut);
let failures = 0;

console.log('\nזהות מנרמלים — פייתון מול JavaScript\n');
CASES.forEach((input, i) => {
  const js = normalizeToken(input);
  const py = fromPython[i];
  if (js === py) {
    console.log(`  ✓ ${JSON.stringify(input)} → ${JSON.stringify(js)}`);
  } else {
    failures++;
    console.error(`  ✗ ${JSON.stringify(input)}`);
    console.error(`      python: ${JSON.stringify(py)}`);
    console.error(`      js:     ${JSON.stringify(js)}`);
  }
});

console.log(
  failures === 0
    ? `\n${CASES.length} מקרים — זהות מלאה\n`
    : `\n${failures} מתוך ${CASES.length} נכשלו — האינדקס יישבר בשקט\n`
);
process.exit(failures === 0 ? 0 : 1);
