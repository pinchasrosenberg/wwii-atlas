# ww2-atlas-etl

צינור ה-ETL של אטלס מלחמת העולם השנייה.

**עיקרון מנחה:** כל העיבוד דטרמיניסטי ומבוסס קוד. **אפס קריאות למודלי שפה בצינור.**
הרצה חוזרת על אותם קלטים חייבת לייצר בדיוק אותו פלט — אחרת בדיקות רגרסיה חסרות משמעות.

## למה זה בנוי ככה

PostGIS הוא **מסד המחקר הקנוני** ואינו נגיש למשתמש. רק רשומות שעברו את
שערי האיכות והזכויות מועתקות לטבלת serving מצומצמת ב־D1. ה־Worker חושף
API קריאה בלבד לפי bbox, זום, זמן ושכבה; אין כתיבה ציבורית למסד.

כל שלב **קורא מהמסד וכותב למסד** ולא מעביר נתונים בזיכרון בין שלבים. זה מאפשר
להריץ שלב בודד מחדש בלי להריץ את כל הצינור — קריטי כשבנייה מלאה לוקחת ~90 דקות.

## התקנה

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# tippecanoe (לייצור אריחים) — לא זמין ב-pip
#   macOS:  brew install tippecanoe
#   Linux:  git clone https://github.com/felt/tippecanoe && cd tippecanoe && make -j && sudo make install
```

## הרצה

### בדיקת מרשם המקורות

```bash
python3 -m quality.audit_sources --json
```

הבדיקה מאמתת שכל שכבה מצביעה למקור מוכר, שלכל מקור יש סטטוס מדעי וזכויות,
ושמקור חסום מתעד את החסם. המרשם המחקרי נמצא ב־`config/source_audit.yaml`.

### בניית שלבים 1–8 ללא תלות חיצונית

```bash
python3 -m export.stage_payloads --stage all
```

הבנאי קורא את `data/raw/cshapes/cshapes_2_gw.topojson.xz` ואת קובצי
`data/seed`, ומפיק:

- `../web/data/stage1/historical-borders.geojson`
- `../web/data/stage2/convoy-routes.json`
- `../web/data/stage2/naval-losses.json`
- `../web/data/stage2/battles.json`
- `../web/data/stage2/manifest.json`
- `../web/data/stage3-8/atlas.json`
- `../web/data/stage3-8/manifest.json`
- `../web/data/search/lexical.json`

הוא מפיל את הבנייה אם לישות חסר מקור, אם תאריך אינו בתחום, אם גאומטריה
פגומה או אם רשומת אובדן אינה תואמת למקור המוצהר.

### הצינור המלא העתידי

```bash
# פיתוח מהיר — SQLite, בלי אריחים
python pipeline.py --db sqlite --skip tiles

# בנייה מלאה — PostGIS
docker compose up -d postgis
python pipeline.py --db postgis --all

# שלב בודד
python pipeline.py --stage crossref
python pipeline.py --stage ingest --source cshapes
```

### יצירת dataset למסד הקריאה

```bash
python3 -m export.d1_serving --input data/out/published.geojson
```

הכלי מסרב לייצא רשומה שאינה `published`, שציונה נמוך מ־70, שחסרים לה
מקורות או טווח זום. הוא יוצר SQL מקומי לבדיקה; רק dataset עם
`dataset_version` נחשב מוכן על ידי ה־API.

## מבנה

| תיקייה | תפקיד |
|---|---|
| `config/` | הגדרות + `sources.yaml` — מרשם כל מקורות הנתונים עם רישיון |
| `db/` | מודלי SQLAlchemy, DDL ל-PostGIS ול-SQLite, ניהול חיבור |
| `ingest/` | הורדה מחזורית ל-`raw/`, עם checksum ומטמון |
| `normalize/` | יחידות מידה, תאריכים, שמות מקומות |
| `graphs/` | בניית 3 גרפי NetworkX + ניתוב |
| `crossref/` | הצלבות אלגוריתמיות: דמוגרפיה, supply_context, טרנספורטים |
| `validate/` | כללי הוולידציה — build נכשל על הפרה |
| `quality/` | ציון איכות, MAD/IQR, יישוב טווחים ובדיקת מרשם מקורות |
| `export/` | PMTiles לפי זום, Parquet, מניפסט |
| `data/raw/` | קלט מקור מקומי עם checksum מתועד |
| `data/seed/` | רשומות פתוחות ומסדרונות מייצגים לשלבים הנוכחיים |

## סדר השלבים

```
ingest → normalize → load → geocode → graphs → crossref → validate → export
```

## כללי ברזל

1. **אין ישות בלי `source_ids`.** ולידציה מפילה את ה-build.
2. **אין מספר נפגעים בודד** — תמיד `_min` ו-`_max`.
3. **אין ניחוש.** התאמה מתחת לסף הביטחון נכנסת ל-`review_queue`, לא לפלט.
4. **אין קו אווירי.** טרנספורט שלא נותב על גרף המסילות לא מוצג.
5. **כל חישוב נושא `derivation`** — `source` או `algorithmic`. שקיפות היא דרישה.
6. **אמינות אינה רישיון.** איכות גבוהה אינה עוקפת מגבלת פרסום, ורישיון פתוח
   אינו עוקף בדיקת איכות.

ראו פרק 7 ונספח ד׳ במסמך האפיון.
