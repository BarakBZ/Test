import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * מחקר רב-שלבי (4 שלבים) עם תיעוד תשובות ל-Google Sheets
 * --------------------------------------------------------
 * איך מחברים ל-Google Sheets (בקצרה):
 * 1) בגוגל דרייב > חדש > Google Sheets (יצירת גיליון חדש).
 * 2) כלים > עורך סקריפטים. צרו פרויקט Apps Script חדש עם הקוד הבא ושמרו כ-"Web App":
 *
 *    const SHEET_NAME = 'Responses';
 *    function doPost(e) {
 *      const ss = SpreadsheetApp.getActiveSpreadsheet();
 *      let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
 *      const data = JSON.parse(e.postData.contents);
 *      // צור שורה שטוחה (מפתח=ערך) לשמירה, מעבד אובייקטים/מערכים לטקסט JSON
 *      const flatten = (obj, prefix='') => Object.entries(obj).reduce((acc,[k,v])=>{
 *        const key = prefix ? `${prefix}.${k}` : k;
 *        if (v && typeof v === 'object') acc = {...acc, ...flatten(v, key)};
 *        else acc[key] = v;
 *        return acc;
 *      },{});
 *      const flat = flatten(data);
 *      // דאגו לכותרות עמודות קבועות ע"פ כל המפתחות שנראו עד כה
 *      const keys = Object.keys(flat);
 *      const header = sh.getRange(1,1,1,sh.getLastColumn()||keys.length).getValues()[0];
 *      const known = new Set(header.filter(Boolean));
 *      let allKeys = [...header.filter(Boolean)];
 *      keys.forEach(k=>{ if(!known.has(k)) allKeys.push(k); });
 *      if (allKeys.length > header.filter(Boolean).length) {
 *        sh.getRange(1,1,1,allKeys.length).setValues([allKeys]);
 *      }
 *      const mapIdx = new Map(allKeys.map((k,i)=>[k,i]));
 *      const row = Array(allKeys.length).fill('');
 *      for (const [k,v] of Object.entries(flat)) row[mapIdx.get(k)] = typeof v === 'object' ? JSON.stringify(v) : v;
 *      sh.appendRow(row);
 *      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
 *    }
 *
 * 3) פרסם > פריסת אפליקציית אינטרנט (Deploy as web app) > גישה: כל אחד עם הקישור (או לפי הצורך בארגון).
 * 4) העתיקו את ה-URL ושרשרו אותו ל-GAS_ENDPOINT למטה.
 *
 * הערה: אם לא תגדירו GAS_ENDPOINT, האפליקציה תאפשר הורדת קובץ CSV/JSON כגיבוי מקומי.
 */

/**********************
 * הגדרות מנהל (ADMIN)
 **********************/
const CONFIG = {
  GAS_ENDPOINT: (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GAS_ENDPOINT) || "", // אפשר גם לקבוע ב-Vercel כ-VITE_GAS_ENDPOINT
  // קישורי מוזיקה לשלב ההסחה (שלב 3). אפשר לעדכן לאחר קבלת הקישורים הסופיים.
  MUSIC: {
    CLASSICAL: "https://www.youtube.com/embed/CX8Oui6yCSs?autoplay=1",
    METAL: "https://www.youtube.com/embed/9sTQ0QdkN3Q?autoplay=1"
  },
  // זמן לכל שלב/מטלה:
  PHASE2_TOTAL_SECONDS: 180, // מגבלת זמן כוללת לשלב 2 — 180ש' ~ 3 דק' ליצירת לחץ מתון
  PHASE2_BREAK_AFTER: 15,    // לאחר כמה שאלות לעצור להפסקה
  PHASE2_BREAK_SECONDS: 25,  // אורך הפסקה
  DISTRACTION_SECONDS: 60    // אורך מטלת ההסחה בשניות
};

/*****************
 * כלי עזר כלליים
 *****************/
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const shuffle = (arr) => arr.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(([,v])=>v);
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

/**
 * מחולל תרגילי חשבון עם גיוון וקושי עולה:
 * 1-10 קל: חיבור/חיסור חד-ספרתי
 * 11-20 בינוני: חיבור/חיסור דו-ספרתי קל, כפל חד-ספרתי
 * 21-30 קשה: כפל/חילוק דו-ספרתי/חד-ספרתי, חיסור עם השאלה
 */
function generateProblems(n=30){
  const problems = [];
  for (let i=1;i<=n;i++){
    let p;
    if (i<=10){
      const a = rand(2,9), b = rand(1,9);
      const op = Math.random()<0.6?'+':'-';
      p = makeProblem(a,b,op);
    } else if (i<=20){
      const opPick = Math.random();
      if (opPick<0.5){
        const a = rand(11,99), b = rand(2,30);
        const op = Math.random()<0.5?'+':'-';
        p = makeProblem(a,b,op);
      } else {
        const a = rand(3,9), b = rand(3,9);
        p = makeProblem(a,b,'×');
      }
    } else {
      const opPick = Math.random();
      if (opPick<0.5){
        // כפל/חילוק
        if (Math.random()<0.5){
          const a = rand(12,19), b = rand(3,9);
          p = makeProblem(a,b,'×');
        } else {
          const b = rand(3,9);
          const a = b * rand(4,12); // ודא חלוקה שלמה
          p = makeProblem(a,b,'÷');
        }
      } else {
        // חיסור מאתגר
        const a = rand(50,199), b = rand(20,49);
        p = makeProblem(a,b,'-');
      }
    }
    problems.push({...p, index:i});
  }
  return problems;
}

function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function makeProblem(a,b,op){
  let correct;
  switch(op){
    case '+': correct=a+b; break;
    case '-': correct=a-b; break;
    case '×': correct=a*b; break;
    case '÷': correct=a/b; break;
    default: correct=0;
  }
  return { a,b,op, correct };
}

/*****************
 * רכיבי UI בסיסיים
 *****************/
function Button({children, disabled, onClick, type="button"}){
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-2xl shadow transition active:scale-[.98] border
                  ${disabled? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}
                 `}
    >{children}</button>
  );
}
function Card({children}){
  return (
    <div className="bg-white/90 backdrop-blur rounded-2xl shadow p-5 border max-w-3xl w-full">
      {children}
    </div>
  );
}
function ProgressBar({value,max}){
  const pct = clamp((value/max)*100,0,100);
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full bg-gray-600" style={{width:`${pct}%`}}/>
    </div>
  );
}

/*************
 * אפליקציה
 *************/
export default function App(){
  const [stage, setStage] = useState(1); // 1..4
  const [participantId] = useState(uid());
  const [gasOk, setGasOk] = useState(Boolean(CONFIG.GAS_ENDPOINT));

  // שלב 1 — דמוגרפיה (ללא פרטים מזהים)
  const [demo, setDemo] = useState({
    ageRange: "",
    gender: "",
    education: "",
    mathComfort: "",
    priorTimedTasks: ""
  });
  const demoValid = demo.ageRange && demo.gender && demo.education && demo.mathComfort && demo.priorTimedTasks;

  // שלב 2 — מטלה קוגניטיבית
  const [problems] = useState(()=>generateProblems(30));
  const [answers,setAnswers] = useState([]); // {index, userAnswer, correct, isCorrect, rtMs}
  const [qIdx,setQIdx] = useState(0); // 0..29
  const [phase2StartedAt,setPhase2StartedAt] = useState(null);
  const [remaining,setRemaining] = useState(CONFIG.PHASE2_TOTAL_SECONDS);
  const [inBreak,setInBreak] = useState(false);
  const [breakLeft,setBreakLeft] = useState(CONFIG.PHASE2_BREAK_SECONDS);

  // שלב 2 — פידבק (רנדומלי בלבד)
  const [feedbackAssigned,setFeedbackAssigned] = useState(null); // 'Positive95' | 'Negative60'

  // שלב 3 — מטלת הסחה + מוזיקה (רנדומלי בתוך כל משתתף)
  const [musicAssigned,setMusicAssigned] = useState(null); // 'Classical' | 'Metal'
  const [distractionLeft,setDistractionLeft] = useState(CONFIG.DISTRACTION_SECONDS);

  // שלב 4 — שאלון מוטיבציה (Likert 1-7)
  const motivationItems = [
    {key:'mot_return', text:'מהי המוטיבציה שלך לחזור ולבצע שוב את מטלת החשבון? (1=נמוכה מאוד, 7=גבוהה מאוד)'},
    {key:'mot_effort', text:'כמה מאמץ תהיה/י מוכן/ה להשקיע בניסיון הבא?'},
    {key:'mot_interest', text:'עד כמה מעניינת/מאתגרת הייתה המטלה עבורך?'},
    {key:'mot_confidence', text:'עד כמה את/ה בטוח/ה שתוכל/י לשפר את ביצועיך בסבב נוסף?'}
  ];
  const [motivation,setMotivation] = useState({mot_return:0, mot_effort:0, mot_interest:0, mot_confidence:0, open:""});
  const motivationValid = motivationItems.every(i=> motivation[i.key] >= 1 && motivation[i.key] <= 7);

  // מדדי ביצוע שלב 2
  const perf = useMemo(()=>{
    const total = answers.length;
    const correct = answers.filter(a=>a.isCorrect).length;
    const acc = total? (correct/total):0;
    const avgRt = total? Math.round(answers.reduce((s,a)=>s+a.rtMs,0)/total):0;
    return {total, correct, acc, avgRt};
  },[answers]);

  // טיימר שלב 2
  useEffect(()=>{
    if (stage!==2 || inBreak) return;
    if (remaining<=0) return;
    const t = setInterval(()=> setRemaining(x=> x-1), 1000);
    return ()=> clearInterval(t);
  },[stage, remaining, inBreak]);

  // טיימר הפסקה
  useEffect(()=>{
    if (stage!==2 || !inBreak) return;
    if (breakLeft<=0) return;
    const t = setInterval(()=> setBreakLeft(x=> x-1), 1000);
    return ()=> clearInterval(t);
  },[stage, inBreak, breakLeft]);

  // טיימר הסחה (שלב 3)
  useEffect(()=>{
    if (stage!==3) return;
    if (distractionLeft<=0) return;
    const t = setInterval(()=> setDistractionLeft(x=> x-1), 1000);
    return ()=> clearInterval(t);
  },[stage, distractionLeft]);

  /*********************
   * שליחת נתונים ל-GAS
   *********************/
  async function postToSheets(payload){
    if (!CONFIG.GAS_ENDPOINT){
      setGasOk(false);
      return { ok:false, local:true };
    }
    try{
      const res = await fetch(CONFIG.GAS_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      const j = await res.json();
      return j;
    }catch(e){
      console.error(e);
      setGasOk(false);
      return { ok:false, error: String(e) };
    }
  }

  function download(filename, text){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type:'text/plain'}));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function logStage(stageName, extra={}){
    const base = {
      participantId,
      timestamp: new Date().toISOString(),
      stage: stageName,
      demo,
      phase2: {
        total: perf.total,
        correct: perf.correct,
        accuracy: Number((perf.acc*100).toFixed(1)),
        avgRtMs: perf.avgRt
      },
      feedbackAssigned,
      musicAssigned,
      motivation
    };
    const payload = {...base, ...extra};
    const res = await postToSheets(payload);
    if (!res?.ok){
      // גיבוי מקומי
      const filename = `participant_${participantId}_${stageName}.json`;
      download(filename, JSON.stringify(payload, null, 2));
    }
  }

  /***************
   * לוגיקת שלבים
   ***************/
  async function startPhase2(){
    setPhase2StartedAt(Date.now());
    setRemaining(CONFIG.PHASE2_TOTAL_SECONDS);
    await logStage('phase1_complete');
    setStage(2);
  }

  async function submitAnswer(userAnswer){
    if (stage!==2 || inBreak) return;
    const p = problems[qIdx];
    const rt = Date.now() - (phase2StartedAt || Date.now());
    const isCorrect = Number(userAnswer) === p.correct;
    const entry = { index:p.index, userAnswer: Number(userAnswer), correct: p.correct, isCorrect, rtMs: rt };
    setAnswers(prev=>[...prev, entry]);

    const nextIdx = qIdx+1;
    if (nextIdx === CONFIG.PHASE2_BREAK_AFTER && !inBreak){
      setInBreak(true);
      setBreakLeft(CONFIG.PHASE2_BREAK_SECONDS);
      // עצירת ספירה לאחור של הזמן הכולל בשלב ההפסקה נעשית ע"י inBreak
    }

    if (nextIdx < problems.length){
      setQIdx(nextIdx);
    } else {
      // סיום שלב 2 (או אם הזמן נגמר, ר' להלן)
    }
  }

  function resumeAfterBreak(){
    setInBreak(false);
  }

  // אם הזמן הכולל נגמר — נעצור וניתן לעבור לפידבק
  useEffect(()=>{
    if (stage===2 && remaining<=0){
      // הזמן הסתיים; ממשיכים למסך סיכום השלב ולפידבק
    }
  },[stage, remaining]);

  function phase2IsOver(){
    return answers.length>=problems.length || remaining<=0;
  }

  async function proceedToFeedback(){
    if (!phase2IsOver()) return;
    // פידבק רנדומלי בלבד, לא תלוי בביצועים
    const fb = Math.random()<0.5 ? 'Positive95' : 'Negative60';
    setFeedbackAssigned(fb);
    await logStage('phase2_complete', { rawAnswers: answers, problems });
    setStage(21); // 21=מסך פידבק
  }

  async function proceedToPhase3(){
    if (!feedbackAssigned) return;
    // חלוקה רנדומלית למוזיקה (בתוך כל משתתף — 50/50)
    const music = Math.random()<0.5 ? 'Classical' : 'Metal';
    setMusicAssigned(music);
    setDistractionLeft(CONFIG.DISTRACTION_SECONDS);
    await logStage('feedback_shown');
    setStage(3);
  }

  async function finishPhase3(){
    if (distractionLeft>0) return;
    await logStage('phase3_complete');
    setStage(4);
  }

  async function finishExperiment(){
    if (!motivationValid) return;
    const motAvg = Math.round((motivationItems.reduce((s,i)=> s + (motivation[i.key]||0), 0) / motivationItems.length) * 100) / 100;
    await logStage('phase4_complete', {motivationAvg: motAvg});
    alert('תודה! השתתפותך הושלמה. ניתן לסגור את החלון.');
  }

  /***************
   * תצוגות/מסכים
   ***************/
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-200 text-gray-900 flex items-start justify-center p-6">
      <div className="w-full flex flex-col items-center gap-4">
        <header className="max-w-3xl w-full">
          <h1 className="text-2xl font-bold">מחקר קוגניטיבי — פלטפורמת ניסוי</h1>
          <p className="text-sm text-gray-600">מזהה משתתף: <span className="font-mono">{participantId}</span></p>
          {!gasOk && (
            <p className="text-xs text-red-600 mt-1">אזהרה: אין חיבור פעיל ל-Google Sheets. הנתונים יישמרו להורדה מקומית (JSON/CSV).
            עדכנו את CONFIG.GAS_ENDPOINT כדי לאפשר תיעוד אוטומטי לגיליון.</p>
          )}
        </header>

        {stage===1 && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">שלב 1: פרטים דמוגרפיים (כלליים בלבד)</h2>
            <p className="text-sm text-gray-600 mb-4">אנא מלא/י את הפרטים הכלליים. איננו אוספים שם, דוא"ל, כתובת או כל פרט מזהה.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="טווח גיל" value={demo.ageRange} onChange={v=>setDemo({...demo, ageRange:v})}
                      options={["18-24","25-34","35-44","45-54","55+"]}/>
              <Select label="מגדר" value={demo.gender} onChange={v=>setDemo({...demo, gender:v})}
                      options={["אישה","גבר","אחר","מעדיפ/ה לא לומר"]}/>
              <Select label="השכלה" value={demo.education} onChange={v=>setDemo({...demo, education:v})}
                      options={["תיכון","תואר ראשון","תואר שני","דוקטורט","אחר"]}/>
              <Select label="נוחות במתמטיקה" value={demo.mathComfort} onChange={v=>setDemo({...demo, mathComfort:v})}
                      options={["נמוכה","בינונית","גבוהה"]}/>
              <Select label="ניסיון במטלות עם שעון" value={demo.priorTimedTasks} onChange={v=>setDemo({...demo, priorTimedTasks:v})}
                      options={["אין","מעט","הרבה"]}/>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <Button disabled={!demoValid} onClick={startPhase2}>המשך לשלב 2</Button>
            </div>
          </Card>
        )}

        {stage===2 && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">שלב 2: מטלת חשבון תחת זמן</h2>
            <p className="text-sm text-gray-600 mb-4">יש לך זמן כולל של {CONFIG.PHASE2_TOTAL_SECONDS} שניות. באמצע תהיה הפסקה של {CONFIG.PHASE2_BREAK_SECONDS} שניות.</p>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-sm">זמן שנותר: <span className="font-mono">{remaining}s</span></div>
              <div className="text-sm">שאלה: {qIdx+1} / {problems.length}</div>
              <div className="flex-1"><ProgressBar value={qIdx} max={problems.length}/></div>
            </div>

            {inBreak ? (
              <div className="text-center py-8">
                <p className="text-lg font-medium mb-2">הפסקה קצרה</p>
                <p className="text-sm mb-4">נותרו {breakLeft} שניות</p>
                <Button disabled={breakLeft>0} onClick={resumeAfterBreak}>המשך</Button>
              </div>
            ) : phase2IsOver() ? (
              <div>
                <Summary perf={perf} />
                <div className="mt-4">
                  <Button onClick={proceedToFeedback}>קבל/י משוב והמשך לשלב 3</Button>
                </div>
              </div>
            ) : (
              <ProblemView problem={problems[qIdx]} onSubmit={submitAnswer} />
            )}
          </Card>
        )}

        {stage===21 && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">משוב ביצוע (רנדומלי)</h2>
            {feedbackAssigned && (
              <div className="rounded-xl bg-gray-50 border p-4">
                {feedbackAssigned==='Positive95' ? (
                  <p>הציון שלך: <span className="font-bold">95</span>. ביצוע מצוין!</p>
                ) : (
                  <p>הציון שלך: <span className="font-bold">60</span>. יש מקום לשיפור.</p>
                )}
                <p className="text-xs text-gray-500 mt-2">הערה מתודולוגית: המשוב נקבע באקראי ואינו משקף את נכונות התשובות.</p>
              </div>
            )}
            <div className="mt-4">
              <Button onClick={proceedToPhase3}>המשך לשלב 3</Button>
            </div>
          </Card>
        )}

        {stage===3 && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">שלב 3: מטלת הסחה + מוזיקה</h2>
            <p className="text-sm text-gray-600 mb-2">האזן/י למוזיקה עד לסיום הספירה. לאחר מכן נמשיך לשאלון קצר.</p>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-sm">זמן שנותר: <span className="font-mono">{distractionLeft}s</span></div>
              <div className="text-sm">מוזיקה: {musicAssigned==='Classical'?'קלאסית רגועה':'מטאל רועשת'}</div>
            </div>
            <iframe
              className="w-full aspect-video rounded-xl border"
              src={musicAssigned==='Classical' ? CONFIG.MUSIC.CLASSICAL : CONFIG.MUSIC.METAL}
              title="Music"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <div className="mt-4">
              <Button disabled={distractionLeft>0} onClick={finishPhase3}>המשך לשלב 4</Button>
            </div>
          </Card>
        )}

        {stage===4 && (
          <Card>
            <h2 className="text-xl font-semibold mb-2">שלב 4: שאלון מוטיבציה</h2>
            <div className="space-y-4">
              {motivationItems.map(item=> (
                <Likert key={item.key} label={item.text} value={motivation[item.key]}
                        onChange={(v)=> setMotivation({...motivation, [item.key]: v})} />
              ))}
              <div>
                <Label>הערות חופשיות (אופציונלי)</Label>
                <textarea className="w-full border rounded-xl p-3" rows={3}
                          value={motivation.open}
                          onChange={e=>setMotivation({...motivation, open:e.target.value})}
                          placeholder="כתיבה חופשית..."/>
              </div>
              <div className="flex items-center gap-2">
                <Button disabled={!motivationValid} onClick={finishExperiment}>סיום ושליחה</Button>
                {!gasOk && (
                  <Button onClick={()=> download(`participant_${participantId}_ALL.json`, JSON.stringify(
                    {participantId, demo, answers, problems, feedbackAssigned, musicAssigned, motivation}, null, 2
                  ))}>הורדת נתונים (JSON)</Button>
                )}
                {!gasOk && (
                  <Button onClick={()=> download(`participant_${participantId}_answers.csv`, toCSV(answers))}>הורדת תשובות (CSV)</Button>
                )}
              </div>
            </div>
          </Card>
        )}

        <footer className="text-xs text-gray-500 max-w-3xl w-full">
          <p>שמירה על אתיקה: אין איסוף פרטים מזהים. המשוב בשלב 2 נקבע באקראי ולא משקף ביצועים בפועל. המעבר בין שלבים מותנה בהשלמת השלב הנוכחי.</p>
        </footer>
      </div>
    </div>
  );
}

/*****************
 * תתי-רכיבים
 *****************/
function Select({label, value, onChange, options}){
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <select className="border rounded-xl px-3 py-2" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">בחר/י...</option>
        {options.map(o=> <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ProblemView({problem, onSubmit}){
  const [ans,setAns] = useState("");
  const inputRef = useRef(null);
  useEffect(()=>{ setAns(""); inputRef.current?.focus(); }, [problem?.index]);
  if (!problem) return null;
  const {a,b,op} = problem;
  return (
    <div>
      <div className="text-center py-6">
        <div className="text-5xl font-bold tracking-wide">
          {a} {op} {b} = ?
        </div>
      </div>
      <form className="flex items-center justify-center gap-3" onSubmit={(e)=>{e.preventDefault(); if(ans!=="") onSubmit(ans);}}>
        <input ref={inputRef} type="number" className="border rounded-xl px-4 py-2 w-40 text-center text-lg"
               value={ans} onChange={e=>setAns(e.target.value)} placeholder="תשובה"/>
        <Button type="submit" disabled={ans===""}>שלח</Button>
      </form>
    </div>
  );
}

function Summary({perf}){
  return (
    <div className="rounded-xl border p-4 bg-gray-50">
      <p className="font-medium">סיכום שלב 2</p>
      <ul className="list-disc ms-5 text-sm mt-2">
        <li>תשובות: {perf.total}</li>
        <li>נכונות: {perf.correct}</li>
        <li>דיוק: {(perf.acc*100).toFixed(1)}%</li>
        <li>זמן תגובה ממוצע: {perf.avgRt} מ"ש</li>
      </ul>
    </div>
  );
}

function Likert({label, value, onChange}){
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2 mt-1 flex-wrap">
        {Array.from({length:7},(_,i)=>i+1).map(v=>(
          <label key={v} className={`px-3 py-2 rounded-xl border cursor-pointer select-none ${value===v? 'bg-gray-800 text-white':'bg-white'}`}>
            <input className="hidden" type="radio" checked={value===v} onChange={()=>onChange(v)}/>
            {v}
          </label>
        ))}
      </div>
    </div>
  );
}

function Label({children}){ return <div className="text-sm font-medium">{children}</div>; }

/****************
 * יצוא ל-CSV
 ****************/
function toCSV(rows){
  if (!rows?.length) return "index,userAnswer,correct,isCorrect,rtMs\n";
  const header = Object.keys(rows[0]);
  const escape = (v)=> String(v).replaceAll('\"','\"\"');
  const data = [header.join(',')].concat(rows.map(r=> header.map(h=>`\"${escape(r[h])}\"`).join(',')));
  return data.join('\n');
}
