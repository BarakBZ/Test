# פלטפורמת ניסוי — 4 שלבים + Google Sheets

## הוראות הפעלה מקומית
1. התקן/י Node.js 18+.
2. חלץ/י את הקובץ.
3. בתיקיה `experiment-platform` הרץ/הריצי:
```bash
npm install
npm run dev
```
פתח/י את הכתובת שמודפסת במסוף.

## חיבור ל-Google Sheets
- פתח/י גיליון חדש ב-Google Sheets.
- כלים > עורך סקריפטים > הדבק/י את הקוד:
```js
const SHEET_NAME = 'Responses';
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const data = JSON.parse(e.postData.contents);
  const flatten = (obj, prefix='') => Object.entries(obj).reduce((acc,[k,v])=>{
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') acc = {...acc, ...flatten(v, key)};
    else acc[key] = v;
    return acc;
  },{});
  const flat = flatten(data);
  const keys = Object.keys(flat);
  const header = sh.getRange(1,1,1,sh.getLastColumn()||keys.length).getValues()[0];
  const known = new Set(header.filter(Boolean));
  let allKeys = [...header.filter(Boolean)];
  keys.forEach(k=>{ if(!known.has(k)) allKeys.push(k); });
  if (allKeys.length > header.filter(Boolean).length) {
    sh.getRange(1,1,1,allKeys.length).setValues([allKeys]);
  }
  const mapIdx = new Map(allKeys.map((k,i)=>[k,i]));
  const row = Array(allKeys.length).fill('');
  for (const [k,v] of Object.entries(flat)) row[mapIdx.get(k)] = typeof v === 'object' ? JSON.stringify(v) : v;
  sh.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
```
- פרסם/י כ-Web App (Deploy) עם הרשאה "Anyone with the link".
- העתיק/י את ה-URL ושימי ב-`src/App.jsx` בשדה `CONFIG.GAS_ENDPOINT`.

## מוזיקה (שלב 3)
עדכני את קישורי ה-YouTube Embed ב-`CONFIG.MUSIC`.

## נתונים לניתוח
האפליקציה כותבת עבור כל משתתף: מזהה, דמוגרפיה כללית, ביצועי שלב 2, משוב אקראי (95/60), סוג מוזיקה (קלאסית/מטאל) ותוצאות שאלון המוטיבציה. זה מתאים ל-ANOVA דו-כיווני (Feedback × Music + אינטראקציה). אם אין חיבור ל-Sheets מופעלת הורדה מקומית (JSON/CSV).


## פריסה ל-Vercel + דומיין
1. דחפו את התיקייה ל-GitHub.
2. Vercel → New Project → Import → Framework: Vite → Build: `npm run build` → Output: `dist`.
3. בהגדרות הפרויקט ב-Vercel: Environment Variables → הוסיפו `VITE_GAS_ENDPOINT` עם URL של ה-Apps Script.
4. לאחר הפריסה: Project → Domains → הוסיפו דומיין שרכשתם והצביעו DNS לפי ההנחיות של Vercel.
5. קובץ `vercel.json` כבר כלול כדי להבטיח SPA fallback.
