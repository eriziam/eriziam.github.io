import { useState, useRef, useEffect, useCallback, useReducer } from "react";

// ── Fonts ─────────────────────────────────────────────────────────────────────
const FL = document.createElement("link"); FL.rel = "stylesheet";
FL.href = "https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Playfair+Display:wght@600;700&display=swap";
document.head.appendChild(FL);

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = x => JSON.parse(JSON.stringify(x));
const EMPTY_CV = {
  personal: { name:"",title:"",email:"",phone:"",location:"",linkedin:"",website:"",github:"",summary:"" },
  experience:[], education:[], skills:{ technical:[], tools:[], soft:[], other:[] },
  certifications:[], projects:[], languages:[], awards:[], volunteering:[],
  variants:[], targetRole:"", targetJD:"",
};
const mkExp  = () => ({ id:uid(), company:"",role:"",start:"",end:"",current:false,location:"",bullets:[""] });
const mkEdu  = () => ({ id:uid(), institution:"",degree:"",field:"",start:"",end:"",grade:"",notes:"",relevant_modules:"" });
const mkProj = () => ({ id:uid(), name:"",url:"",tech:"",description:"",bullets:[""] });
const mkCert = () => ({ id:uid(), name:"",issuer:"",date:"",expires:"",url:"" });
const mkLang = () => ({ id:uid(), language:"",level:"" });
const mkAward= () => ({ id:uid(), title:"",issuer:"",date:"",description:"" });
const mkVol  = () => ({ id:uid(), org:"",role:"",start:"",end:"",description:"" });

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaude(sys, user, maxTokens=1200) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens,
      system:sys, messages:[{role:"user",content:user}] })
  });
  if (!r.ok) { const t=await r.text(); throw new Error(`API ${r.status}: ${t.slice(0,200)}`); }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message||JSON.stringify(d.error));
  return d.content?.map(b=>b.text||"").join("")||"";
}

// ── ATS Score ─────────────────────────────────────────────────────────────────
function calcATS(cv) {
  let s=0;
  const p=cv.personal, allSk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
  const txt=JSON.stringify(cv).toLowerCase();
  if(p.name) s+=8; if(p.email) s+=7; if(p.phone) s+=4; if(p.location) s+=3;
  if(p.summary?.length>80) s+=10; else if(p.summary?.length>30) s+=4;
  if(cv.experience.length>=1) s+=10; if(cv.experience.length>=2) s+=4;
  if(cv.experience.some(e=>e.bullets.some(b=>/\d+%|\$[\d,]+|\d+ (people|team|users|customers)/i.test(b)))) s+=12;
  if(cv.experience.some(e=>e.bullets.some(b=>b.trim().length>0))) s+=4;
  if(allSk.length>=5) s+=8; if(allSk.length>=10) s+=4;
  if(cv.education.length>=1) s+=6; if(p.linkedin) s+=4; if(p.github||p.website) s+=2;
  const verbs=["achieved","led","improved","developed","increased","managed","delivered","built","optimised","reduced","launched","scaled","drove","designed","created","implemented","established","spearheaded","generated","streamlined"];
  s+=Math.min(verbs.filter(w=>txt.includes(w)).length*1.5,10);
  if(p.title) s+=2;
  return Math.min(Math.round(s),100);
}

// ── Completion ────────────────────────────────────────────────────────────────
function calcCompletion(cv) {
  const allSk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
  const checks=[!!cv.personal.name,!!cv.personal.email,!!cv.personal.phone,!!cv.personal.location,!!cv.personal.title,!!cv.personal.summary,!!cv.personal.linkedin,cv.experience.length>0,cv.experience.some(e=>e.bullets.filter(b=>b.trim()).length>=3),allSk.length>=5,cv.education.length>0,cv.certifications.length>0||cv.projects.length>0];
  return Math.round(checks.filter(Boolean).length/checks.length*100);
}

// ── Keyword Analysis ──────────────────────────────────────────────────────────
function analyzeKeywords(cv, jd) {
  if(!jd.trim()) return {matched:[],missing:[],score:0};
  const cvText=JSON.stringify(cv).toLowerCase();
  const stopwords=new Set(["with","that","this","have","will","your","from","they","been","were","into","also","when","then","than","more","some","such","each","both","their","there","these","those","about","which","would","could","should","being","having","using","must","very","and","the","for","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","may","new","now","see","two","who","did","let","put","too","use","via"]);
  const words=jd.toLowerCase().replace(/[^\w\s\+\#\.]/g," ").split(/\s+/).filter(w=>w.length>3&&!stopwords.has(w));
  const freq={};
  words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
  const topWords=Object.entries(freq).filter(([w,c])=>c>=1).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([w])=>w);
  const matched=topWords.filter(w=>cvText.includes(w));
  const missing=topWords.filter(w=>!cvText.includes(w));
  return {matched,missing,score:Math.round(matched.length/Math.max(topWords.length,1)*100)};
}

// ── Weak verbs ────────────────────────────────────────────────────────────────
const WEAK=["responsible for","worked on","helped","assisted","involved in","handled","was tasked","participated","supported","contributed to","duties included","tasked with"];
function isWeak(b){const l=b.toLowerCase().trim();return WEAK.some(w=>l.startsWith(w));}

// ── Undo/Redo ─────────────────────────────────────────────────────────────────
function historyReducer(state,action){
  if(action.type==="SET"){const past=[...state.past,state.present].slice(-40);return{past,present:action.payload,future:[]};}
  if(action.type==="UNDO"&&state.past.length){return{past:state.past.slice(0,-1),present:state.past[state.past.length-1],future:[state.present,...state.future]};}
  if(action.type==="REDO"&&state.future.length){return{past:[...state.past,state.present],present:state.future[0],future:state.future.slice(1)};}
  return state;
}

// ── Tokens ────────────────────────────────────────────────────────────────────
const T={bg:"#080810",surface:"#0e0e1c",border:"#1c1c30",accent:"#7c5cfc",accentDim:"#4a3a8a",accentLight:"#b09fff",text:"#e2e0f0",muted:"#6060a0",faint:"#3a3a5a",green:"#4caf50",yellow:"#f59e0b",red:"#ef4444"};
const S={
  app:{fontFamily:"'Sora',sans-serif",minHeight:"100vh",background:T.bg,color:T.text,display:"flex",flexDirection:"column"},
  header:{borderBottom:`1px solid ${T.border}`,padding:"0 18px",display:"flex",alignItems:"center",justifyContent:"space-between",height:50,background:"#0a0a14",flexShrink:0,gap:8},
  shell:{display:"flex",flex:1,overflow:"hidden",height:"calc(100vh - 50px)"},
  sidebar:{width:196,background:"#0a0a14",borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"},
  navSec:{padding:"10px 14px 3px",fontSize:10,color:T.faint,fontWeight:700,textTransform:"uppercase",letterSpacing:".1em"},
  navItem:(a)=>({display:"flex",alignItems:"center",gap:8,padding:"7px 14px",cursor:"pointer",fontSize:12.5,fontWeight:a?600:400,color:a?T.accentLight:T.muted,background:a?"#16162a":"transparent",borderLeft:`2px solid ${a?T.accent:"transparent"}`,transition:"all .12s",userSelect:"none"}),
  main:{flex:1,display:"flex",overflow:"hidden"},
  editor:{flex:1,overflowY:"auto",padding:"18px 22px",background:T.bg},
  preview:{width:390,borderLeft:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:"#f4f3f0"},
  card:{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px 18px",marginBottom:12},
  cardTitle:{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".08em",marginBottom:11,display:"flex",alignItems:"center",justifyContent:"space-between"},
  inp:{width:"100%",background:"#080812",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:"'Sora',sans-serif",outline:"none",boxSizing:"border-box"},
  ta:{width:"100%",background:"#080812",border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:"'Sora',sans-serif",outline:"none",resize:"vertical",boxSizing:"border-box",lineHeight:1.5},
  lbl:{fontSize:11,color:T.muted,marginBottom:3,display:"block",fontWeight:500},
  row:{display:"flex",gap:10,marginBottom:10},
  field:{flex:1,marginBottom:10},
  btn:(v="ghost")=>({padding:v==="primary"?"8px 16px":"6px 11px",borderRadius:6,border:v==="ghost"?`1px solid ${T.border}`:"none",background:v==="primary"?T.accent:v==="danger"?"#1a0808":v==="success"?"#051a05":"#14142a",color:v==="danger"?"#f87171":v==="success"?"#4ade80":T.accentLight,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .12s",fontFamily:"'Sora',sans-serif",display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}),
  pill:{display:"inline-flex",alignItems:"center",gap:5,background:"#16162a",border:`1px solid ${T.border}`,borderRadius:20,padding:"3px 10px",fontSize:12,color:T.accentLight},
  badge:(c)=>({display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:c==="green"?"#051a05":c==="yellow"?"#1a0e00":"#1a0505",color:c==="green"?T.green:c==="yellow"?T.yellow:T.red,border:`1px solid ${c==="green"?T.green+"30":c==="yellow"?T.yellow+"30":T.red+"30"}`}),
};

// ── Field Components ──────────────────────────────────────────────────────────
const fo=e=>e.target.style.borderColor=T.accentDim, bl=e=>e.target.style.borderColor=T.border;
const Inp=({label,value,onChange,placeholder,type="text",disabled=false,hint})=>(
  <div style={S.field}>
    {label&&<label style={S.lbl}>{label}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      disabled={disabled} style={{...S.inp,opacity:disabled?.55:1}} onFocus={fo} onBlur={bl}/>
    {hint&&<div style={{fontSize:10,color:T.faint,marginTop:3}}>{hint}</div>}
  </div>
);
const Ta=({label,value,onChange,rows=3,placeholder,hint})=>(
  <div style={S.field}>
    {label&&<label style={S.lbl}>{label}</label>}
    <textarea rows={rows} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={S.ta} onFocus={fo} onBlur={bl}/>
    {hint&&<div style={{fontSize:10,color:T.faint,marginTop:3}}>{hint}</div>}
  </div>
);
const Sel=({label,value,onChange,options})=>(
  <div style={S.field}>
    {label&&<label style={S.lbl}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{...S.inp,cursor:"pointer"}}>
      {options.map(([v,l])=><option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

// ── CV Preview ────────────────────────────────────────────────────────────────
function CVPreview({cv,theme}) {
  const p=cv.personal,dark=theme==="dark";
  const allSk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
  const bg=dark?"#12121e":"#fff",fg=dark?"#e0dff0":"#1a1a2a",acc=dark?"#9080ff":"#4a3aaa",sub=dark?"#8080b0":"#555";
  const w={fontFamily:"'Sora',sans-serif",color:fg,fontSize:11,lineHeight:1.55,padding:"22px 20px",background:bg,minHeight:"100%"};
  const h2={fontSize:9.5,fontWeight:700,color:acc,borderBottom:`1.5px solid ${acc}`,paddingBottom:2,marginBottom:7,textTransform:"uppercase",letterSpacing:".07em",marginTop:13};
  return(
    <div style={w}>
      <div style={{textAlign:"center",marginBottom:11}}>
        <div style={{fontSize:17,fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{p.name||"Your Name"}</div>
        {p.title&&<div style={{fontSize:11,color:acc,fontWeight:500,marginTop:2}}>{p.title}</div>}
        <div style={{fontSize:9.5,color:sub,marginTop:4,display:"flex",justifyContent:"center",gap:9,flexWrap:"wrap"}}>
          {[p.email,p.phone,p.location,p.linkedin,p.github,p.website].filter(Boolean).map((c,i)=><span key={i}>{c}</span>)}
        </div>
      </div>
      {p.summary&&<><div style={h2}>Profile</div><div style={{fontSize:10.5,color:dark?"#c0b8e0":fg,marginBottom:8}}>{p.summary}</div></>}
      {cv.experience.length>0&&<><div style={h2}>Experience</div>{cv.experience.map(e=>(
        <div key={e.id} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:600,fontSize:11}}>
            <span>{e.role||"Role"}</span><span style={{color:sub,fontWeight:400,fontSize:9.5}}>{e.start}{e.start&&(e.end||e.current)?" – ":""}{e.current?"Present":e.end}</span>
          </div>
          <div style={{color:acc,fontSize:10,marginBottom:3}}>{e.company}{e.location?` · ${e.location}`:""}</div>
          {e.bullets.filter(b=>b.trim()).map((b,i)=><div key={i} style={{marginLeft:10,fontSize:10.5,marginBottom:2}}>• {b}</div>)}
        </div>
      ))}</>}
      {allSk.length>0&&<><div style={h2}>Skills</div>
        {cv.skills.technical.length>0&&<div style={{marginBottom:3,fontSize:10.5}}><b style={{color:sub,fontWeight:600}}>Technical: </b>{cv.skills.technical.join(", ")}</div>}
        {cv.skills.tools.length>0&&<div style={{marginBottom:3,fontSize:10.5}}><b style={{color:sub,fontWeight:600}}>Tools: </b>{cv.skills.tools.join(", ")}</div>}
        {cv.skills.soft.length>0&&<div style={{marginBottom:3,fontSize:10.5}}><b style={{color:sub,fontWeight:600}}>Soft Skills: </b>{cv.skills.soft.join(", ")}</div>}
        {cv.skills.other.length>0&&<div style={{marginBottom:3,fontSize:10.5}}><b style={{color:sub,fontWeight:600}}>Other: </b>{cv.skills.other.join(", ")}</div>}
      </>}
      {cv.education.length>0&&<><div style={h2}>Education</div>{cv.education.map(e=>(
        <div key={e.id} style={{marginBottom:7}}>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:600,fontSize:11}}><span>{e.degree}{e.field?` in ${e.field}`:""}</span><span style={{color:sub,fontWeight:400,fontSize:9.5}}>{e.start}{e.end?` – ${e.end}`:""}</span></div>
          <div style={{color:acc,fontSize:10}}>{e.institution}{e.grade?` · ${e.grade}`:""}</div>
          {e.relevant_modules&&<div style={{color:sub,fontSize:9.5,marginTop:1}}>Modules: {e.relevant_modules}</div>}
        </div>
      ))}</>}
      {cv.projects.length>0&&<><div style={h2}>Projects</div>{cv.projects.map(p2=>(
        <div key={p2.id} style={{marginBottom:7}}>
          <div style={{fontWeight:600,fontSize:11}}>{p2.name}{p2.tech&&<span style={{color:sub,fontWeight:400,fontSize:9.5}}> · {p2.tech}</span>}</div>
          {p2.url&&<div style={{color:acc,fontSize:9.5}}>{p2.url}</div>}
          {p2.description&&<div style={{fontSize:10.5,color:sub,marginTop:1}}>{p2.description}</div>}
          {p2.bullets.filter(b=>b.trim()).map((b,i)=><div key={i} style={{marginLeft:10,fontSize:10.5,marginBottom:2}}>• {b}</div>)}
        </div>
      ))}</>}
      {cv.certifications.length>0&&<><div style={h2}>Certifications</div>{cv.certifications.map(c=>(
        <div key={c.id} style={{marginBottom:4,fontSize:10.5}}><b>{c.name}</b>{c.issuer&&<span style={{color:sub}}> · {c.issuer}</span>}{c.date&&<span style={{color:sub}}> · {c.date}</span>}</div>
      ))}</>}
      {cv.awards.length>0&&<><div style={h2}>Awards</div>{cv.awards.map(a=>(
        <div key={a.id} style={{marginBottom:4,fontSize:10.5}}><b>{a.title}</b>{a.issuer&&<span style={{color:sub}}> · {a.issuer}</span>}{a.description&&<div style={{color:sub,fontSize:9.5}}>{a.description}</div>}</div>
      ))}</>}
      {cv.volunteering.length>0&&<><div style={h2}>Volunteering</div>{cv.volunteering.map(v=>(
        <div key={v.id} style={{marginBottom:6}}><div style={{fontWeight:600,fontSize:11}}>{v.role} · <span style={{color:acc}}>{v.org}</span></div>{v.description&&<div style={{fontSize:10.5,color:sub}}>{v.description}</div>}</div>
      ))}</>}
      {cv.languages.length>0&&<><div style={h2}>Languages</div>
        <div style={{fontSize:10.5}}>{cv.languages.map(l=><span key={l.id} style={{marginRight:12}}><b>{l.language}</b>{l.level?` (${l.level})`:""}</span>)}</div>
      </>}
    </div>
  );
}

// ── Meter ─────────────────────────────────────────────────────────────────────
const Meter=({label,score,max=100})=>{
  const pct=Math.min(score,max)/max*100,col=pct>=75?T.green:pct>=50?T.yellow:T.red;
  return(<div style={{marginBottom:9}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
      <span style={{fontSize:11,color:T.muted}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:col,fontFamily:"'DM Mono',monospace"}}>{score}{max===100?"%":""}</span>
    </div>
    <div style={{height:5,background:"#1a1a2e",borderRadius:99,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:99,transition:"width .4s"}}/>
    </div>
  </div>);
};

// ── LinkedIn Output Component ─────────────────────────────────────────────────
function LinkedInOutput({ li, copied, copyText }) {
  const Cp = ({ text, label }) => (
    <button style={{...S.btn(), padding:"3px 9px", fontSize:11}} onClick={() => copyText(text, label)}>
      {copied === label ? "✓" : "Copy"}
    </button>
  );
  const Sec = ({ icon, title, children, ct, cl }) => (
    <div style={{...S.card, marginBottom:9}}>
      <div style={S.cardTitle}>
        <span>{icon} {title}</span>
        {ct && <Cp text={ct} label={cl || title} />}
      </div>
      {children}
    </div>
  );
  return (
    <>
      <Sec icon="🏷" title="Headline" ct={li.headline} cl="Headline">
        <div style={{fontSize:15, fontWeight:600, color:"#e0d8ff", lineHeight:1.4, padding:"5px 0"}}>{li.headline}</div>
        <div style={{fontSize:10, color:T.faint, marginTop:3}}>{li.headline?.length || 0}/220 chars</div>
      </Sec>

      <Sec icon="📝" title="About Section" ct={li.about} cl="About">
        <pre style={{whiteSpace:"pre-wrap", fontSize:13, color:"#c0b8e0", lineHeight:1.75, fontFamily:"'Sora',sans-serif"}}>{li.about}</pre>
        <div style={{fontSize:10, color:T.faint, marginTop:4}}>{li.about?.length || 0}/2600 chars (LinkedIn limit)</div>
      </Sec>

      {li.experience?.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>💼 Experience Descriptions</div>
          {li.experience.map((e, i) => (
            <div key={i} style={{marginBottom:11, padding:"9px 12px", background:"#0d0d1a", border:`1px solid ${T.border}`, borderRadius:8}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:5}}>
                <div>
                  <div style={{fontWeight:600, fontSize:12, color:T.accentLight}}>{e.role}</div>
                  <div style={{fontSize:11, color:T.muted}}>{e.company}</div>
                </div>
                <Cp text={e.description} label={`${e.role} desc`} />
              </div>
              <pre style={{whiteSpace:"pre-wrap", fontSize:12, color:"#a0a0c0", lineHeight:1.65, fontFamily:"'Sora',sans-serif"}}>{e.description}</pre>
            </div>
          ))}
        </div>
      )}

      <Sec icon="⚡" title="Skills to Endorse" ct={(li.skills_to_endorse || []).join("\n")} cl="Skills">
        <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
          {(li.skills_to_endorse || []).map((s, i) => (
            <span key={i} style={{...S.pill, cursor:"pointer"}} onClick={() => copyText(s, s)}>{s}</span>
          ))}
        </div>
      </Sec>

      {li.featured_section_ideas && (
        <Sec icon="⭐" title="Featured Section Ideas" ct={(li.featured_section_ideas || []).join("\n")} cl="Featured">
          {li.featured_section_ideas.map((idea, i) => (
            <div key={i} style={{padding:"6px 0", borderBottom:`1px solid ${T.border}`, fontSize:13, color:"#b0a8d0", display:"flex", gap:8}}>
              <span style={{color:T.accent}}>◆</span>{idea}
            </div>
          ))}
        </Sec>
      )}

      <Sec icon="🤝" title="Connection Request Note" ct={li.connection_note} cl="Connection Note">
        <div style={{fontSize:13, color:"#c0b8e0", lineHeight:1.65, padding:"8px 10px", background:"#0d0d1a", borderRadius:7, border:`1px solid ${T.border}`}}>{li.connection_note}</div>
        <div style={{fontSize:10, color:T.faint, marginTop:4}}>{li.connection_note?.length || 0}/300</div>
      </Sec>

      {li.content_ideas && (
        <Sec icon="💡" title="Content / Post Ideas" ct={(li.content_ideas || []).join("\n\n")} cl="Post Ideas">
          {li.content_ideas.map((idea, i) => (
            <div key={i} style={{display:"flex", gap:8, marginBottom:7, padding:"8px 10px", background:"#0d0d1a", borderRadius:7, border:`1px solid ${T.border}`}}>
              <span style={{color:T.accent, fontWeight:700, fontSize:12, flexShrink:0}}>{i + 1}.</span>
              <div style={{fontSize:13, color:"#b0a8d0", flex:1}}>{idea}</div>
              <Cp text={idea} label={`Post ${i + 1}`} />
            </div>
          ))}
        </Sec>
      )}

      <div style={{...S.card, background:"#051a05", border:`1px solid ${T.green}20`}}>
        <div style={S.cardTitle}><span style={{color:T.green}}>✓ LinkedIn Tips</span></div>
        {[
          "Professional headshot = 21× more views — update yours",
          "Enable 'Open to Work' privately so only recruiters see it",
          "Customise your URL: linkedin.com/in/yourname",
          "Request 2-3 recommendations from previous managers",
          "Post in your target industry 2× per week for algorithm visibility",
          "Follow target companies and engage with their posts",
        ].map((tip, i) => (
          <div key={i} style={{fontSize:12, color:"#70b070", padding:"5px 0", borderBottom:`1px solid ${T.green}15`, display:"flex", gap:8}}>
            <span>💚</span>{tip}
          </div>
        ))}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function CVStudio() {
  // ── State ──────────────────────────────────────────────────────────────────
  const initCV=()=>{try{const s=localStorage.getItem("cvs3");return s?JSON.parse(s):clone(EMPTY_CV);}catch{return clone(EMPTY_CV);}};
  const [history,dispatch]=useReducer(historyReducer,{past:[],present:initCV(),future:[]});
  const cv=history.present;
  const setCV=useCallback(upd=>{const next=typeof upd==="function"?upd(history.present):upd;dispatch({type:"SET",payload:next});},[history.present]);
  const undo=()=>dispatch({type:"UNDO"});
  const redo=()=>dispatch({type:"REDO"});

  const [tab,setTab]=useState("personal");
  const [showPreview,setShowPreview]=useState(true);
  const [previewTheme,setPreviewTheme]=useState("light");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiOutput,setAiOutput]=useState("");
  const [aiMode,setAiMode]=useState("analyse");
  const [toasts,setToasts]=useState([]);
  const [newSkill,setNewSkill]=useState({technical:"",tools:"",soft:"",other:""});
  const [importLoading,setImportLoading]=useState(false);
  const [importStatus,setImportStatus]=useState("");
  const [pasteText,setPasteText]=useState("");
  const [pasteLoading,setPasteLoading]=useState(false);
  const [liGoals,setLiGoals]=useState({targetRoles:"",industries:"",openTo:"",tone:"professional",extras:""});
  const [liOutput,setLiOutput]=useState(null);
  const [liLoading,setLiLoading]=useState(false);
  const [copied,setCopied]=useState("");
  const [coverLetter,setCoverLetter]=useState({tone:"professional",focus:"",output:"",loading:false});
  const [kwResult,setKwResult]=useState(null);
  const [interviewQs,setInterviewQs]=useState({output:"",loading:false});
  const [bulletAI,setBulletAI]=useState({expId:null,bi:null,loading:false,suggestion:""});
  const fileInputRef=useRef();
  const importFileRef=useRef();
  const saveTimer=useRef();

  const atsScore=calcATS(cv);
  const completionScore=calcCompletion(cv);
  const allSk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
  const estimatePages=()=>(JSON.stringify(cv).replace(/[^a-z]/gi,"").length/1800).toFixed(1);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{try{localStorage.setItem("cvs3",JSON.stringify(cv));}catch{}},800);
  },[cv]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(()=>{
    const h=e=>{if((e.ctrlKey||e.metaKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();undo();}if((e.ctrlKey||e.metaKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))){e.preventDefault();redo();}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const toast=(msg,type="info")=>{const id=uid();setToasts(t=>[...t,{id,msg,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);};

  // ── Patch helpers ─────────────────────────────────────────────────────────
  const patchP=(k,v)=>setCV(p=>({...p,personal:{...p.personal,[k]:v}}));
  const arrSet=(key,fn)=>setCV(p=>({...p,[key]:fn(p[key])}));
  const patchExp=(id,k,v)=>arrSet("experience",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchEdu=(id,k,v)=>arrSet("education",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchProj=(id,k,v)=>arrSet("projects",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchCert=(id,k,v)=>arrSet("certifications",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchLang=(id,k,v)=>arrSet("languages",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchAwd=(id,k,v)=>arrSet("awards",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchVol=(id,k,v)=>arrSet("volunteering",a=>a.map(e=>e.id===id?{...e,[k]:v}:e));
  const patchBullet=(key,id,i,v)=>setCV(p=>({...p,[key]:p[key].map(e=>{if(e.id!==id)return e;const b=[...e.bullets];b[i]=v;return{...e,bullets:b};})}));
  const addBullet=(key,id)=>setCV(p=>({...p,[key]:p[key].map(e=>e.id===id?{...e,bullets:[...e.bullets,""]}:e)}));
  const removeBullet=(key,id,i)=>setCV(p=>({...p,[key]:p[key].map(e=>e.id===id?{...e,bullets:e.bullets.filter((_,idx)=>idx!==i)}:e)}));
  const addSkill=(cat,v)=>{if(!v.trim())return;setCV(p=>({...p,skills:{...p.skills,[cat]:[...p.skills[cat],v.trim()]}}));};
  const removeSkill=(cat,i)=>setCV(p=>({...p,skills:{...p.skills,[cat]:p.skills[cat].filter((_,idx)=>idx!==i)}}));
  const moveExp=(id,dir)=>setCV(p=>{const a=[...p.experience];const i=a.findIndex(e=>e.id===id);const j=i+dir;if(j<0||j>=a.length)return p;[a[i],a[j]]=[a[j],a[i]];return{...p,experience:a};});

  // ── Copy ──────────────────────────────────────────────────────────────────
  const copyText=(text,label)=>{navigator.clipboard.writeText(text).then(()=>{setCopied(label);setTimeout(()=>setCopied(""),2000);toast(`${label} copied!`,"success");});};

  // ── AI Coach ──────────────────────────────────────────────────────────────
  const runAI=async()=>{
    setAiLoading(true);setAiOutput("");
    const cvText=JSON.stringify(cv,null,2);
    try{
      const modes={
        analyse:{sys:"You are an expert CV coach for 2026. Analyse the CV and give concise, actionable feedback:\n\nSTRENGTHS\n- point\n\nWEAKNESSES\n- specific issue\n\nATS TIPS\n- tip\n\nQUICK WINS (top 3 most impactful changes)\n1.\n2.\n3.\n\nBe specific, reference actual content, no fluff.",user:`Analyse:\n${cvText}`},
        tailor:{sys:"You are a CV tailoring expert. Given the CV and JD, give specific recommendations:\n\nKEYWORDS TO ADD (exact phrases from JD missing from CV)\n-\n\nEXPERIENCE TO REFRAME\n-\n\nSUMMARY REWRITE\n[write it]\n\nSKILLS TO ADD\n-\n\nWARNINGS\n-",user:`CV:\n${cvText}\n\nRole: ${cv.targetRole}\nJD:\n${cv.targetJD}`},
        bullets:{sys:"Rewrite the most recent job's bullets using STAR format, strong action verbs, quantified results. Use realistic numbers if none given. 4-5 bullets starting with •, one per line. Nothing else.",user:`CV:\n${cvText}`},
        summary:{sys:"Write a compelling 3-4 sentence professional summary. ATS-optimised, first-person, strong hook, top achievement, ends with what they seek. Output ONLY the summary text.",user:`CV:\n${cvText}\nTarget: ${cv.targetRole||"not specified"}`},
        gaps:{sys:"Analyse this CV for career gaps and weaknesses. For each: (1) identify it, (2) give specific advice to address it. Flag: gaps, missing metrics, vague descriptions, job-hopping. Honest but constructive.",user:`CV:\n${cvText}`},
      };
      const m=modes[aiMode];
      setAiOutput(await callClaude(m.sys,m.user,1400));
    }catch(e){setAiOutput(`Error: ${e.message}`);}
    setAiLoading(false);
  };

  // ── Bullet enhancer ───────────────────────────────────────────────────────
  const enhanceBullet=async(expId,bi,text)=>{
    setBulletAI({expId,bi,loading:true,suggestion:""});
    try{
      const exp=cv.experience.find(e=>e.id===expId);
      const s=await callClaude("Rewrite this CV bullet with a powerful action verb, strong impact, under 120 chars. Output ONLY the rewritten text, no prefix.",`Role: ${exp?.role} at ${exp?.company}\nBullet: ${text}`,200);
      setBulletAI({expId,bi,loading:false,suggestion:s.trim().replace(/^[•\-]\s*/,"")});
    }catch(e){setBulletAI({expId:null,bi:null,loading:false,suggestion:""});toast("Enhance failed","error");}
  };
  const applyBullet=()=>{if(!bulletAI.suggestion)return;patchBullet("experience",bulletAI.expId,bulletAI.bi,bulletAI.suggestion);setBulletAI({expId:null,bi:null,loading:false,suggestion:""});toast("Applied!","success");};

  // ── Cover Letter ──────────────────────────────────────────────────────────
  const genCoverLetter=async()=>{
    setCoverLetter(c=>({...c,loading:true,output:""}));
    try{
      const out=await callClaude(`Write a compelling cover letter. Tone: ${coverLetter.tone}. Opening hook → why this role → 2 specific achievements → forward-looking close. ~300 words. Reference real CV details. Output ONLY the letter.`,`CV:\n${JSON.stringify(cv,null,2)}\nRole: ${cv.targetRole||"unspecified"}\nJD: ${cv.targetJD||"none"}\nFocus: ${coverLetter.focus||"general strengths"}`,800);
      setCoverLetter(c=>({...c,output:out,loading:false}));
    }catch(e){setCoverLetter(c=>({...c,loading:false,output:`Error: ${e.message}`}));}
  };

  // ── Interview Prep ────────────────────────────────────────────────────────
  const genInterviewQs=async()=>{
    setInterviewQs({output:"",loading:true});
    try{
      const out=await callClaude("Generate 10 interview questions for this candidate. Mix: 3 behavioural STAR, 3 technical/role-specific, 2 about career choices, 2 curveball. For each, provide a brief answer tip. Format:\n1. Question?\n→ Tip: ...\n\n2. ...",`CV:\n${JSON.stringify(cv,null,2)}\nTarget: ${cv.targetRole||"not specified"}`,1400);
      setInterviewQs({output:out,loading:false});
    }catch(e){setInterviewQs({output:`Error: ${e.message}`,loading:false});}
  };

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  const genLinkedIn=async()=>{
    setLiLoading(true);setLiOutput(null);
    try{
      const r=await callClaude(`You are a LinkedIn profile expert. Output ONLY valid JSON, no markdown:\n{"headline":"220 char max","about":"1500-2000 chars first-person","experience":[{"role":"","company":"","description":"2-3 lines + 3 bullets"}],"skills_to_endorse":["10 skills"],"featured_section_ideas":["3 ideas"],"connection_note":"300 char max","content_ideas":["5 post ideas"]}`,`CV:\n${JSON.stringify(cv,null,2)}\nGoals:${JSON.stringify(liGoals)}`,1600);
      const clean=r.trim().replace(/^```json\s*/i,"").replace(/^```/i,"").replace(/```$/i,"").trim();
      const s=clean.indexOf("{"),e=clean.lastIndexOf("}");
      setLiOutput(JSON.parse(clean.slice(s,e+1)));
    }catch(e){toast(`Failed: ${e.message}`,"error");}
    setLiLoading(false);
  };

  // ── Parse CV text ─────────────────────────────────────────────────────────
  const doParse=async(text)=>{
    const sys=`You are a CV parser. Output ONLY valid JSON matching this schema, no markdown:\n{"personal":{"name":"","title":"","email":"","phone":"","location":"","linkedin":"","website":"","github":"","summary":""},"experience":[{"id":"uid7","company":"","role":"","start":"","end":"","current":false,"location":"","bullets":[""]}],"education":[{"id":"uid7","institution":"","degree":"","field":"","start":"","end":"","grade":"","notes":"","relevant_modules":""}],"skills":{"technical":[],"tools":[],"soft":[],"other":[]},"certifications":[{"id":"uid7","name":"","issuer":"","date":"","expires":"","url":""}],"projects":[{"id":"uid7","name":"","url":"","tech":"","description":"","bullets":[""]}],"languages":[{"id":"uid7","language":"","level":""}],"awards":[{"id":"uid7","title":"","issuer":"","date":"","description":""}],"volunteering":[{"id":"uid7","org":"","role":"","start":"","end":"","description":""}]}\nGenerate unique 7-char ids. Extract ALL bullets verbatim. Output ONLY JSON.`;
    const raw=await callClaude(sys,`Parse:\n${text.slice(0,14000)}`,3000);
    let clean=raw.trim().replace(/^```json\s*/i,"").replace(/^```/i,"").replace(/```$/i,"").trim();
    const s=clean.indexOf("{"),e=clean.lastIndexOf("}");
    if(s===-1||e===-1)throw new Error("No JSON found in response");
    const data=JSON.parse(clean.slice(s,e+1));
    let skills=data.skills;
    if(Array.isArray(skills))skills={technical:skills,tools:[],soft:[],other:[]};
    skills=skills||{technical:[],tools:[],soft:[],other:[]};
    setCV(prev=>({...prev,
      personal:{...EMPTY_CV.personal,...data.personal},
      experience:(data.experience||[]).map(e=>({...mkExp(),...e,bullets:e.bullets?.filter(Boolean).length?e.bullets:[""]})),
      education:(data.education||[]).map(e=>({...mkEdu(),...e})),
      skills,
      certifications:(data.certifications||[]).map(c=>({...mkCert(),...c})),
      projects:(data.projects||[]).map(p=>({...mkProj(),...p,bullets:p.bullets?.filter(Boolean).length?p.bullets:[""]})),
      languages:(data.languages||[]).map(l=>({...mkLang(),...l})),
      awards:(data.awards||[]).map(a=>({...mkAward(),...a})),
      volunteering:(data.volunteering||[]).map(v=>({...mkVol(),...v})),
    }));
  };

  const importCV=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setImportLoading(true);setImportStatus("Reading file…");
    try{
      let rawText="";
      const ext=file.name.split(".").pop().toLowerCase();
      if(ext==="docx"){
        setImportStatus("Loading Word reader…");
        if(!window.mammoth)await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";s.onload=res;s.onerror=()=>rej(new Error("Could not load Word reader — check internet"));document.head.appendChild(s);});
        setImportStatus("Extracting text…");
        rawText=(await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
      }else if(ext==="pdf"){
        setImportStatus("Loading PDF reader…");
        if(!window.pdfjsLib)await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";s.onload=res;s.onerror=()=>rej(new Error("Could not load PDF reader — check internet"));document.head.appendChild(s);});
        window.pdfjsLib.GlobalWorkerOptions.workerSrc="";
        setImportStatus("Extracting PDF text…");
        const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true}).promise;
        const pages=[];
        for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const c=await page.getTextContent();let t="",lastY=null;for(const item of c.items){if(lastY!==null&&Math.abs(item.transform[5]-lastY)>5)t+="\n";t+=item.str+" ";lastY=item.transform[5];}pages.push(t.trim());}
        rawText=pages.join("\n\n");
      }else{toast("Upload .docx or .pdf","error");setImportLoading(false);e.target.value="";return;}
      if(!rawText.trim()){toast("No text found — use paste option","error");setImportLoading(false);e.target.value="";return;}
      setImportStatus(`Extracted ${rawText.length} chars. Parsing with AI…`);
      await doParse(rawText);
      toast("CV imported! Review each section.","success");setImportStatus("");setTab("personal");
    }catch(err){console.error(err);setImportStatus(`Error: ${err.message}`);}
    setImportLoading(false);e.target.value="";
  };

  const parsePaste=async()=>{
    if(!pasteText.trim()){toast("Paste CV text first","error");return;}
    setPasteLoading(true);
    try{await doParse(pasteText);toast("Parsed! Review each section.","success");setTab("personal");setPasteText("");}
    catch(e){toast(`Error: ${e.message.slice(0,80)}`,"error");}
    setPasteLoading(false);
  };

  // ── JSON save/load ────────────────────────────────────────────────────────
  const saveJSON=()=>{const b=new Blob([JSON.stringify(cv,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${cv.personal.name||"cv"}.json`;a.click();toast("Saved","success");};
  const loadJSON=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);let sk=d.skills;if(Array.isArray(sk))sk={technical:sk,tools:[],soft:[],other:[]};setCV({...EMPTY_CV,...d,skills:sk||EMPTY_CV.skills,variants:d.variants||[]});toast("Loaded!","success");}catch{toast("Invalid JSON","error");}};r.readAsText(f);e.target.value="";};

  // ── Export Word ───────────────────────────────────────────────────────────
  const exportDocx=async()=>{
    toast("Generating Word…","info");
    try{
      if(!window.docx)await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.umd.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      const{Document,Packer,Paragraph,TextRun,BorderStyle,AlignmentType}=window.docx;
      const p=cv.personal,ch=[];
      const h2=t=>new Paragraph({children:[new TextRun({text:t,bold:true,size:20,color:"4a3aaa",font:"Arial"})],border:{bottom:{style:BorderStyle.SINGLE,size:8,color:"4a3aaa",space:1}},spacing:{before:180,after:80}});
      ch.push(new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:p.name||"Name",bold:true,size:32,font:"Arial"})]}));
      if(p.title)ch.push(new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:p.title,size:22,color:"4a3aaa",font:"Arial"})],spacing:{after:40}}));
      const contacts=[p.email,p.phone,p.location,p.linkedin,p.github,p.website].filter(Boolean);
      if(contacts.length)ch.push(new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:contacts.join("  |  "),size:17,color:"666666",font:"Arial"})],spacing:{after:120}}));
      if(p.summary){ch.push(h2("PROFILE"));ch.push(new Paragraph({children:[new TextRun({text:p.summary,size:20,font:"Arial"})],spacing:{after:80}}));}
      // Skills
      const sk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
      if(sk.length){ch.push(h2("SKILLS"));
        [["Technical",cv.skills.technical],["Tools",cv.skills.tools],["Soft Skills",cv.skills.soft],["Other",cv.skills.other]].forEach(([label,arr])=>{
          if(arr.length)ch.push(new Paragraph({children:[new TextRun({text:`${label}: `,bold:true,size:20,font:"Arial"}),new TextRun({text:arr.join(", "),size:20,font:"Arial"})],spacing:{after:40}}));
        });
      }
      if(cv.experience.length){ch.push(h2("EXPERIENCE"));cv.experience.forEach(e=>{
        ch.push(new Paragraph({children:[new TextRun({text:e.role||"Role",bold:true,size:22,font:"Arial"}),new TextRun({text:`  |  ${e.company}${e.location?` · ${e.location}`:""}`,size:22,color:"4a3aaa",font:"Arial"}),new TextRun({text:`  ${e.start}${e.start?" – ":""}${e.current?"Present":e.end}`,size:17,color:"888888",font:"Arial"})],spacing:{before:100,after:40}}));
        e.bullets.filter(b=>b.trim()).forEach(b=>ch.push(new Paragraph({children:[new TextRun({text:b,size:20,font:"Arial"})],bullet:{level:0},spacing:{after:30}})));
      });}
      if(cv.education.length){ch.push(h2("EDUCATION"));cv.education.forEach(e=>{
        ch.push(new Paragraph({children:[new TextRun({text:`${e.degree}${e.field?` in ${e.field}`:""}`,bold:true,size:22,font:"Arial"}),new TextRun({text:`  |  ${e.institution}${e.grade?` · ${e.grade}`:""}`,size:22,color:"4a3aaa",font:"Arial"}),new TextRun({text:`  ${e.start}${e.end?` – ${e.end}`:""}`,size:17,color:"888888",font:"Arial"})],spacing:{before:100,after:40}}));
        if(e.relevant_modules)ch.push(new Paragraph({children:[new TextRun({text:`Modules: ${e.relevant_modules}`,size:18,color:"555555",font:"Arial"})],spacing:{after:40}}));
      });}
      if(cv.projects.length){ch.push(h2("PROJECTS"));cv.projects.forEach(pr=>{
        ch.push(new Paragraph({children:[new TextRun({text:pr.name,bold:true,size:22,font:"Arial"}),pr.tech?new TextRun({text:` · ${pr.tech}`,size:18,color:"4a3aaa",font:"Arial"}):new TextRun("")],spacing:{before:80,after:30}}));
        if(pr.url)ch.push(new Paragraph({children:[new TextRun({text:pr.url,size:17,color:"4a3aaa",font:"Arial"})],spacing:{after:20}}));
        if(pr.description)ch.push(new Paragraph({children:[new TextRun({text:pr.description,size:19,font:"Arial"})],spacing:{after:30}}));
        pr.bullets.filter(b=>b.trim()).forEach(b=>ch.push(new Paragraph({children:[new TextRun({text:b,size:19,font:"Arial"})],bullet:{level:0},spacing:{after:25}})));
      });}
      if(cv.certifications.length){ch.push(h2("CERTIFICATIONS"));cv.certifications.forEach(c=>ch.push(new Paragraph({children:[new TextRun({text:c.name,bold:true,size:20,font:"Arial"}),c.issuer?new TextRun({text:`  ·  ${c.issuer}`,size:20,color:"4a3aaa",font:"Arial"}):new TextRun(""),c.date?new TextRun({text:`  ·  ${c.date}`,size:17,color:"888888",font:"Arial"}):new TextRun("")],spacing:{after:50}})));}
      if(cv.awards.length){ch.push(h2("AWARDS"));cv.awards.forEach(a=>ch.push(new Paragraph({children:[new TextRun({text:a.title,bold:true,size:20,font:"Arial"}),a.issuer?new TextRun({text:`  ·  ${a.issuer}`,size:20,color:"4a3aaa",font:"Arial"}):new TextRun("")],spacing:{after:50}})));}
      if(cv.languages.length){ch.push(h2("LANGUAGES"));ch.push(new Paragraph({children:[new TextRun({text:cv.languages.map(l=>`${l.language}${l.level?` (${l.level})`:""}`).join("  ·  "),size:20,font:"Arial"})]}));}
      const doc=new Document({sections:[{children:ch}]});
      const blob=await Packer.toBlob(doc);const a2=document.createElement("a");a2.href=URL.createObjectURL(blob);a2.download=`${p.name||"cv"}.docx`;a2.click();
      toast("Word downloaded!","success");
    }catch(e){console.error(e);toast("Export failed — check console","error");}
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportPDF=()=>{
    const p=cv.personal;const sk=[...cv.skills.technical,...cv.skills.tools,...cv.skills.soft,...cv.skills.other];
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Sora',sans-serif;font-size:10.5pt;color:#1a1a2a;padding:20px 28px;line-height:1.55}h1{font-size:18pt;font-weight:700;text-align:center;margin-bottom:3px}.sub{text-align:center;color:#4a3aaa;font-size:10pt;margin-bottom:5px}.contact{text-align:center;font-size:9pt;color:#666;margin-bottom:12px}h2{font-size:8.5pt;font-weight:700;color:#4a3aaa;border-bottom:1.5px solid #4a3aaa;padding-bottom:2px;margin:11px 0 6px;text-transform:uppercase;letter-spacing:.06em}.row{display:flex;justify-content:space-between;font-weight:600;font-size:10.5pt}.co{color:#4a3aaa;font-size:9.5pt;margin-bottom:3px}.b{margin-left:12px;margin-bottom:2px;font-size:10pt}@media print{body{padding:12px 20px}}</style></head><body>
<h1>${p.name||"Name"}</h1>${p.title?`<div class="sub">${p.title}</div>`:""}
<div class="contact">${[p.email,p.phone,p.location,p.linkedin,p.github,p.website].filter(Boolean).join(" · ")}</div>
${p.summary?`<h2>Profile</h2><p>${p.summary}</p>`:""}
${sk.length?`<h2>Skills</h2>${cv.skills.technical.length?`<div><b>Technical:</b> ${cv.skills.technical.join(", ")}</div>`:""}${cv.skills.tools.length?`<div><b>Tools:</b> ${cv.skills.tools.join(", ")}</div>`:""}${cv.skills.soft.length?`<div><b>Soft Skills:</b> ${cv.skills.soft.join(", ")}</div>`:""}${cv.skills.other.length?`<div><b>Other:</b> ${cv.skills.other.join(", ")}</div>`:""}`:""}
${cv.experience.length?`<h2>Experience</h2>${cv.experience.map(e=>`<div style="margin-bottom:8px"><div class="row"><span>${e.role||"Role"}</span><span style="color:#666;font-weight:400;font-size:9pt">${e.start}${e.start?" – ":""}${e.current?"Present":e.end}</span></div><div class="co">${e.company}${e.location?` · ${e.location}`:""}</div>${e.bullets.filter(b=>b.trim()).map(b=>`<div class="b">• ${b}</div>`).join("")}</div>`).join("")}`:""}
${cv.education.length?`<h2>Education</h2>${cv.education.map(e=>`<div style="margin-bottom:7px"><div class="row"><span>${e.degree}${e.field?` in ${e.field}`:""}</span><span style="color:#666;font-weight:400;font-size:9pt">${e.start}${e.end?` – ${e.end}`:""}</span></div><div class="co">${e.institution}${e.grade?` · ${e.grade}`:""}</div>${e.relevant_modules?`<div style="color:#777;font-size:9pt">Modules: ${e.relevant_modules}</div>`:""}</div>`).join("")}`:""}
${cv.projects.length?`<h2>Projects</h2>${cv.projects.map(pr=>`<div style="margin-bottom:7px"><b>${pr.name}</b>${pr.tech?` <span style="color:#4a3aaa;font-size:9pt">· ${pr.tech}</span>`:""} ${pr.url?`<span style="color:#4a3aaa;font-size:9pt">${pr.url}</span>`:""}<div style="color:#555;font-size:10pt">${pr.description||""}</div>${pr.bullets.filter(b=>b.trim()).map(b=>`<div class="b">• ${b}</div>`).join("")}</div>`).join("")}`:""}
${cv.certifications.length?`<h2>Certifications</h2>${cv.certifications.map(c=>`<div style="margin-bottom:3px"><b>${c.name}</b>${c.issuer?` · ${c.issuer}`:""}${c.date?` · <span style="color:#888">${c.date}</span>`:""}</div>`).join("")}`:""}
${cv.awards.length?`<h2>Awards</h2>${cv.awards.map(a=>`<div style="margin-bottom:3px"><b>${a.title}</b>${a.issuer?` · ${a.issuer}`:""}${a.description?`<br><span style="color:#555;font-size:9.5pt">${a.description}</span>`:""}</div>`).join("")}`:""}
${cv.languages.length?`<h2>Languages</h2><div>${cv.languages.map(l=>`<b>${l.language}</b>${l.level?` (${l.level})`:""}`).join(" · ")}</div>`:""}
</body></html>`;
    const w=window.open("","_blank");w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);toast("Print dialog opened","info");
  };

  // ── Nav ───────────────────────────────────────────────────────────────────
  const NAV=[
    {section:"Setup",items:[{id:"import",label:"Import CV",icon:"📥"}]},
    {section:"Your CV",items:[{id:"personal",label:"Personal",icon:"👤"},{id:"experience",label:"Experience",icon:"💼"},{id:"education",label:"Education",icon:"🎓"},{id:"skills",label:"Skills",icon:"⚡"},{id:"projects",label:"Projects",icon:"🚀"},{id:"extras",label:"Extras",icon:"🏆"}]},
    {section:"Optimise",items:[{id:"analyse",label:"AI Coach",icon:"🤖"},{id:"keywords",label:"Keywords",icon:"🔍"},{id:"coverletter",label:"Cover Letter",icon:"✉"},{id:"interview",label:"Interview Prep",icon:"🎙"}]},
    {section:"Publish",items:[{id:"variants",label:"Variants",icon:"🔀"},{id:"linkedin",label:"LinkedIn",icon:"💼"}]},
  ];

  return(
    <div style={S.app}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{display:"flex",alignItems:"baseline",gap:5,flexShrink:0}}>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:T.accentLight}}>CV Studio</span>
          <span style={{fontSize:9,color:T.faint,fontFamily:"'DM Mono',monospace"}}>2026</span>
        </div>
        {/* Live scores */}
        <div style={{display:"flex",gap:14,alignItems:"center",flex:1,justifyContent:"center"}}>
          {[["ATS",atsScore],["Done",completionScore]].map(([l,s])=>{
            const c=s>=75?T.green:s>=50?T.yellow:T.red;
            return<div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:10,color:T.muted}}>{l}</span>
              <div style={{height:4,width:56,background:"#1a1a2e",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${s}%`,background:c,borderRadius:99,transition:"width .4s"}}/>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:c,fontFamily:"'DM Mono',monospace"}}>{s}%</span>
            </div>;
          })}
          <span style={{fontSize:10,color:T.faint}}>~{estimatePages()}pg</span>
          <span style={{fontSize:10,color:T.faint,fontFamily:"'DM Mono',monospace"}}>{history.past.length>0?"●  auto-saved":"auto-saved"}</span>
        </div>
        {/* Actions */}
        <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
          <input ref={fileInputRef} type="file" accept=".json" style={{display:"none"}} onChange={loadJSON}/>
          <input ref={importFileRef} type="file" accept=".docx,.pdf" style={{display:"none"}} onChange={importCV}/>
          <button style={{...S.btn(),fontSize:11}} onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)">↩</button>
          <button style={{...S.btn(),fontSize:11}} onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Y)">↪</button>
          <button style={{...S.btn(),fontSize:11}} onClick={()=>fileInputRef.current.click()}>📂 Load</button>
          <button style={{...S.btn(),fontSize:11}} onClick={saveJSON}>💾 Save</button>
          <button style={{...S.btn(),fontSize:11}} onClick={exportDocx}>📄 Word</button>
          <button style={{...S.btn(),fontSize:11}} onClick={exportPDF}>🖨 PDF</button>
          <button style={{...S.btn(showPreview?"primary":"ghost"),fontSize:11}} onClick={()=>setShowPreview(p=>!p)}>{showPreview?"Hide Preview":"Preview"}</button>
        </div>
      </div>

      <div style={S.shell}>
        {/* ── Sidebar ── */}
        <div style={S.sidebar}>
          {NAV.map(sec=>(
            <div key={sec.section}>
              <div style={S.navSec}>{sec.section}</div>
              {sec.items.map(n=>(
                <div key={n.id} style={S.navItem(tab===n.id)} onClick={()=>setTab(n.id)}>
                  <span style={{fontSize:13}}>{n.icon}</span><span>{n.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={S.main}>
          <div style={S.editor}>

            {/* ── IMPORT ── */}
            {tab==="import"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>📥 Import Existing CV</div>
                  <div style={{fontSize:12,color:"#8080b0",marginBottom:14,lineHeight:1.65}}>Upload a <b style={{color:T.accentLight}}>.docx</b> or <b style={{color:T.accentLight}}>.pdf</b>, or paste your CV text below. Claude parses everything automatically.</div>
                  <div onClick={()=>!importLoading&&importFileRef.current.click()}
                    style={{border:`2px dashed ${T.faint}`,borderRadius:10,padding:"28px 18px",textAlign:"center",cursor:importLoading?"default":"pointer",background:"#0a0a14",transition:"all .2s",opacity:importLoading?.7:1,marginBottom:12}}
                    onMouseEnter={e=>{if(!importLoading)e.currentTarget.style.borderColor=T.accent;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.faint;}}>
                    <div style={{fontSize:32,marginBottom:7}}>{importLoading?"⏳":"📄"}</div>
                    <div style={{fontSize:14,fontWeight:600,color:T.accentLight,marginBottom:4}}>{importLoading?(importStatus||"Processing…"):"Click to upload .docx or .pdf"}</div>
                    <div style={{fontSize:11,color:T.faint}}>{importLoading?"May take 20-40 seconds":"Word & text-based PDFs"}</div>
                  </div>
                  {importStatus&&importStatus.startsWith("Error:")&&(
                    <div style={{padding:"9px 12px",background:"#1a0808",border:`1px solid ${T.red}30`,borderRadius:8,marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:600,color:T.red,marginBottom:3}}>Error</div>
                      <div style={{fontSize:10,color:"#c06060",fontFamily:"'DM Mono',monospace",wordBreak:"break-all"}}>{importStatus}</div>
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:10,margin:"10px 0 12px"}}>
                    <div style={{flex:1,height:1,background:T.border}}/><span style={{fontSize:10,color:T.faint}}>OR PASTE TEXT</span><div style={{flex:1,height:1,background:T.border}}/>
                  </div>
                  <Ta label="Paste CV text (open your CV → Ctrl+A → Ctrl+C → paste here)" rows={7} value={pasteText} onChange={setPasteText} placeholder="Paste your full CV text here..."/>
                  <button style={{...S.btn("primary"),padding:"8px 18px"}} onClick={parsePaste} disabled={pasteLoading||!pasteText.trim()}>
                    {pasteLoading?"⏳ Parsing…":"✨ Parse Pasted Text"}
                  </button>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>💡 Tips</div>
                  {[["Word docs give best results",".docx preserves structure perfectly"],["Text PDFs only","Scanned PDFs have no text — use paste instead"],["Paste is most reliable","Always works regardless of file format"],["Review after import","Check dates, bullets, contacts — AI is good but verify"]].map(([t,d])=>(
                    <div key={t} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{color:T.accent}}>◆</span><div><div style={{fontSize:12,fontWeight:600,color:"#c0b8e0",marginBottom:1}}>{t}</div><div style={{fontSize:11,color:T.muted}}>{d}</div></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── PERSONAL ── */}
            {tab==="personal"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>Contact & Identity</div>
                  <div style={S.row}><Inp label="Full Name *" value={cv.personal.name} onChange={v=>patchP("name",v)} placeholder="Jane Smith"/><Inp label="Professional Title / Headline" value={cv.personal.title} onChange={v=>patchP("title",v)} placeholder="Senior Data Scientist" hint="Match exact title from job postings for ATS"/></div>
                  <div style={S.row}><Inp label="Email *" value={cv.personal.email} onChange={v=>patchP("email",v)} placeholder="jane@email.com"/><Inp label="Phone" value={cv.personal.phone} onChange={v=>patchP("phone",v)} placeholder="+44 7700 900000"/></div>
                  <div style={S.row}><Inp label="Location" value={cv.personal.location} onChange={v=>patchP("location",v)} placeholder="London, UK"/><Inp label="LinkedIn URL" value={cv.personal.linkedin} onChange={v=>patchP("linkedin",v)} placeholder="linkedin.com/in/janesmith"/></div>
                  <div style={S.row}><Inp label="GitHub" value={cv.personal.github} onChange={v=>patchP("github",v)} placeholder="github.com/janesmith"/><Inp label="Website / Portfolio" value={cv.personal.website} onChange={v=>patchP("website",v)} placeholder="janesmith.io"/></div>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>
                    <span>Professional Summary</span>
                    <span style={{fontSize:11,color:cv.personal.summary.split(/\s+/).filter(Boolean).length>=60?T.green:T.yellow}}>{cv.personal.summary.split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                  <Ta rows={5} value={cv.personal.summary} onChange={v=>patchP("summary",v)} placeholder="3-4 sentences. Lead with years of experience + specialism. Include one quantified achievement. End with what you're seeking. Write last — after filling all other sections."/>
                  <div style={{display:"flex",gap:7,marginTop:8,flexWrap:"wrap"}}>
                    {[["≥60 words",cv.personal.summary.split(/\s+/).filter(Boolean).length>=60],["Contains a number",/\d/.test(cv.personal.summary)],["Has action verb",/led|built|managed|created|drove|designed|developed|increased|improved/i.test(cv.personal.summary)],["Not generic",cv.personal.summary.length>0&&!/hardworking|team player|passionate about/i.test(cv.personal.summary)]].map(([l,ok])=>(
                      <span key={l} style={S.badge(ok?"green":"yellow")}>{ok?"✓":"○"} {l}</span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── EXPERIENCE ── */}
            {tab==="experience"&&(
              <>
                {cv.experience.map((e,ei)=>(
                  <div key={e.id} style={S.card}>
                    <div style={S.cardTitle}>
                      <span>Position {ei+1}{e.role?` — ${e.role}`:""}</span>
                      <div style={{display:"flex",gap:5}}>
                        {ei>0&&<button style={{...S.btn(),padding:"3px 7px",fontSize:11}} onClick={()=>moveExp(e.id,-1)} title="Move up">↑</button>}
                        {ei<cv.experience.length-1&&<button style={{...S.btn(),padding:"3px 7px",fontSize:11}} onClick={()=>moveExp(e.id,1)} title="Move down">↓</button>}
                        <button style={S.btn("danger")} onClick={()=>arrSet("experience",a=>a.filter(x=>x.id!==e.id))}>✕ Remove</button>
                      </div>
                    </div>
                    <div style={S.row}><Inp label="Job Title *" value={e.role} onChange={v=>patchExp(e.id,"role",v)} placeholder="Product Manager"/><Inp label="Company *" value={e.company} onChange={v=>patchExp(e.id,"company",v)} placeholder="Acme Corp"/></div>
                    <div style={S.row}><Inp label="Location" value={e.location} onChange={v=>patchExp(e.id,"location",v)} placeholder="London, UK"/><Inp label="Start" value={e.start} onChange={v=>patchExp(e.id,"start",v)} placeholder="Jan 2021"/><Inp label="End" value={e.end} onChange={v=>patchExp(e.id,"end",v)} placeholder="Dec 2023" disabled={e.current}/></div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <input type="checkbox" id={`c-${e.id}`} checked={e.current} onChange={ev=>patchExp(e.id,"current",ev.target.checked)}/>
                      <label htmlFor={`c-${e.id}`} style={{fontSize:12,color:T.muted,cursor:"pointer"}}>Current position</label>
                    </div>
                    <label style={S.lbl}>Achievement Bullets</label>
                    <div style={{fontSize:10.5,color:T.faint,marginBottom:7}}>💡 Formula: Action verb + what you did + measurable result. Aim for 3-5 bullets with at least 60% containing a number.</div>
                    {e.bullets.map((b,i)=>{
                      const weak=b.trim()&&isWeak(b);
                      const hasNum=/\d/.test(b);
                      const isSugg=bulletAI.expId===e.id&&bulletAI.bi===i;
                      return(
                        <div key={i} style={{marginBottom:7}}>
                          <div style={{display:"flex",gap:5,alignItems:"flex-start"}}>
                            <span style={{color:weak?T.red:hasNum?T.green:T.muted,paddingTop:9,fontSize:12,flexShrink:0}}>•</span>
                            <input value={b} onChange={ev=>patchBullet("experience",e.id,i,ev.target.value)}
                              placeholder="Reduced customer churn by 23% by implementing proactive outreach programme..."
                              style={{...S.inp,flex:1,borderColor:weak?"#3a1010":T.border}}
                              onFocus={fo} onBlur={bl}/>
                            <button style={{...S.btn(),padding:"5px 7px",fontSize:10}} onClick={()=>enhanceBullet(e.id,i,b)} disabled={!b.trim()||bulletAI.loading} title="AI enhance this bullet">✨</button>
                            {e.bullets.length>1&&<button style={{...S.btn("danger"),padding:"5px 7px"}} onClick={()=>removeBullet("experience",e.id,i)}>✕</button>}
                          </div>
                          {weak&&<div style={{fontSize:10,color:T.red,marginLeft:18,marginTop:2}}>⚠ Weak opener — start with a strong action verb (Led, Built, Reduced, Launched...)</div>}
                          {isSugg&&(bulletAI.loading?<div style={{marginLeft:18,marginTop:4,fontSize:11,color:T.muted}}>⏳ Enhancing…</div>:
                            bulletAI.suggestion&&<div style={{marginLeft:18,marginTop:5,padding:"8px 10px",background:"#061a06",border:`1px solid ${T.green}25`,borderRadius:6}}>
                              <div style={{fontSize:10,color:T.green,marginBottom:4}}>✨ AI suggestion:</div>
                              <div style={{fontSize:12,color:"#c0e0c0"}}>{bulletAI.suggestion}</div>
                              <div style={{display:"flex",gap:6,marginTop:6}}>
                                <button style={{...S.btn("success"),padding:"3px 10px",fontSize:11}} onClick={applyBullet}>Apply</button>
                                <button style={{...S.btn(),padding:"3px 10px",fontSize:11}} onClick={()=>setBulletAI({expId:null,bi:null,loading:false,suggestion:""})}>Dismiss</button>
                              </div>
                            </div>)}
                        </div>
                      );
                    })}
                    <button style={S.btn()} onClick={()=>addBullet("experience",e.id)}>+ Bullet</button>
                  </div>
                ))}
                <button style={{...S.btn("primary"),width:"100%",justifyContent:"center",padding:10}} onClick={()=>arrSet("experience",a=>[...a,mkExp()])}>+ Add Position</button>
              </>
            )}

            {/* ── EDUCATION ── */}
            {tab==="education"&&(
              <>
                {cv.education.map((e,ei)=>(
                  <div key={e.id} style={S.card}>
                    <div style={S.cardTitle}><span>Education {ei+1}{e.institution?` — ${e.institution}`:""}</span><button style={S.btn("danger")} onClick={()=>arrSet("education",a=>a.filter(x=>x.id!==e.id))}>✕</button></div>
                    <div style={S.row}><Inp label="Degree" value={e.degree} onChange={v=>patchEdu(e.id,"degree",v)} placeholder="BSc, MSc, PhD..."/><Inp label="Field" value={e.field} onChange={v=>patchEdu(e.id,"field",v)} placeholder="Computer Science"/></div>
                    <Inp label="Institution *" value={e.institution} onChange={v=>patchEdu(e.id,"institution",v)} placeholder="University of Manchester"/>
                    <div style={S.row}><Inp label="Start" value={e.start} onChange={v=>patchEdu(e.id,"start",v)} placeholder="2017"/><Inp label="End" value={e.end} onChange={v=>patchEdu(e.id,"end",v)} placeholder="2021"/><Inp label="Grade" value={e.grade} onChange={v=>patchEdu(e.id,"grade",v)} placeholder="First / 3.9 GPA"/></div>
                    <Inp label="Relevant Modules" value={e.relevant_modules} onChange={v=>patchEdu(e.id,"relevant_modules",v)} placeholder="Machine Learning, Statistics, Data Structures..." hint="Listing modules boosts ATS keyword matches — especially for JDs with specific technical requirements"/>
                    <Ta label="Notes / Dissertation" rows={2} value={e.notes} onChange={v=>patchEdu(e.id,"notes",v)} placeholder="Dissertation: AI in drug discovery. Dean's List. Relevant projects..."/>
                  </div>
                ))}
                <button style={{...S.btn("primary"),width:"100%",justifyContent:"center",padding:10}} onClick={()=>arrSet("education",a=>[...a,mkEdu()])}>+ Add Education</button>
              </>
            )}

            {/* ── SKILLS ── */}
            {tab==="skills"&&(
              <>
                <div style={{...S.card,background:"#0d0d1a",border:`1px solid ${T.accentDim}40`}}>
                  <div style={{fontSize:12,color:T.muted,lineHeight:1.65}}>
                    <b style={{color:T.accentLight}}>2026:</b> Skills-first hiring means ATS now reads this section first. Categorise clearly. List both full terms AND acronyms — "Artificial Intelligence (AI)". Aim for 15-20 skills across all categories.
                  </div>
                </div>
                {[["technical","🔧 Technical Skills","Python (3.10+), TypeScript, SQL, Machine Learning, React..."],["tools","🛠 Tools & Platforms","AWS, Docker, Kubernetes, Figma, Salesforce, GitHub Actions..."],["soft","🤝 Soft Skills","Stakeholder Management, Cross-functional Leadership, Agile..."],["other","✨ Other / Methodologies","Scrum, Six Sigma, ISO 9001, Product-led Growth..."]].map(([cat,label,ph])=>(
                  <div key={cat} style={S.card}>
                    <div style={S.cardTitle}>{label} <span style={{fontWeight:400,color:T.faint,textTransform:"none",letterSpacing:0}}>({cv.skills[cat].length})</span></div>
                    <div style={{display:"flex",gap:8,marginBottom:10}}>
                      <input value={newSkill[cat]} onChange={e=>setNewSkill(s=>({...s,[cat]:e.target.value}))}
                        onKeyDown={e=>{if(e.key==="Enter"){addSkill(cat,newSkill[cat]);setNewSkill(s=>({...s,[cat]:""}));}}}
                        placeholder={ph} style={{...S.inp,flex:1}} onFocus={fo} onBlur={bl}/>
                      <button style={S.btn("primary")} onClick={()=>{addSkill(cat,newSkill[cat]);setNewSkill(s=>({...s,[cat]:""}));}}>Add</button>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {cv.skills[cat].map((s,i)=>(
                        <span key={i} style={S.pill}>{s}<span style={{cursor:"pointer",color:T.red,fontSize:9,marginLeft:2}} onClick={()=>removeSkill(cat,i)}>✕</span></span>
                      ))}
                      {cv.skills[cat].length===0&&<span style={{fontSize:11,color:T.faint}}>None yet</span>}
                    </div>
                  </div>
                ))}
                <div style={S.card}>
                  <Meter label={`Total: ${allSk.length} skills`} score={allSk.length} max={20}/>
                  <div style={{fontSize:11,color:T.muted}}>{allSk.length<5?"⚠ Add at least 5 for ATS":allSk.length<10?"Consider adding more tools/technologies":allSk.length>=15?"✓ Excellent coverage":"✓ Good coverage"}</div>
                </div>
              </>
            )}

            {/* ── PROJECTS ── */}
            {tab==="projects"&&(
              <>
                {cv.projects.map((pr,i)=>(
                  <div key={pr.id} style={S.card}>
                    <div style={S.cardTitle}><span>Project {i+1}{pr.name?` — ${pr.name}`:""}</span><button style={S.btn("danger")} onClick={()=>arrSet("projects",a=>a.filter(x=>x.id!==pr.id))}>✕</button></div>
                    <div style={S.row}><Inp label="Name *" value={pr.name} onChange={v=>patchProj(pr.id,"name",v)} placeholder="E-commerce Platform Rebuild"/><Inp label="URL" value={pr.url} onChange={v=>patchProj(pr.id,"url",v)} placeholder="github.com/user/project"/></div>
                    <Inp label="Tech Stack" value={pr.tech} onChange={v=>patchProj(pr.id,"tech",v)} placeholder="React, Node.js, PostgreSQL, Docker, AWS" hint="List every technology — these are ATS-searchable keywords"/>
                    <Ta label="Description" rows={2} value={pr.description} onChange={v=>patchProj(pr.id,"description",v)} placeholder="What it does, what problem it solves, and its scale/impact."/>
                    <label style={S.lbl}>Key Contributions / Achievements</label>
                    {pr.bullets.map((b,bi)=>(
                      <div key={bi} style={{display:"flex",gap:5,marginBottom:6}}>
                        <span style={{color:T.muted,paddingTop:9,fontSize:12}}>•</span>
                        <input value={b} onChange={ev=>patchBullet("projects",pr.id,bi,ev.target.value)} placeholder="Built RESTful API serving 50k req/day at 99.9% uptime..." style={{...S.inp,flex:1}} onFocus={fo} onBlur={bl}/>
                        {pr.bullets.length>1&&<button style={{...S.btn("danger"),padding:"5px 7px"}} onClick={()=>removeBullet("projects",pr.id,bi)}>✕</button>}
                      </div>
                    ))}
                    <button style={S.btn()} onClick={()=>addBullet("projects",pr.id)}>+ Bullet</button>
                  </div>
                ))}
                <button style={{...S.btn("primary"),width:"100%",justifyContent:"center",padding:10}} onClick={()=>arrSet("projects",a=>[...a,mkProj()])}>+ Add Project</button>
              </>
            )}

            {/* ── EXTRAS ── */}
            {tab==="extras"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>🏆 Certifications</div>
                  {cv.certifications.map((c,i)=>(
                    <div key={c.id} style={{...S.row,alignItems:"flex-end",marginBottom:7}}>
                      <Inp label={i===0?"Name":undefined} value={c.name} onChange={v=>patchCert(c.id,"name",v)} placeholder="AWS Solutions Architect"/>
                      <Inp label={i===0?"Issuer":undefined} value={c.issuer} onChange={v=>patchCert(c.id,"issuer",v)} placeholder="Amazon"/>
                      <Inp label={i===0?"Date":undefined} value={c.date} onChange={v=>patchCert(c.id,"date",v)} placeholder="2024"/>
                      <Inp label={i===0?"Expires":undefined} value={c.expires} onChange={v=>patchCert(c.id,"expires",v)} placeholder="2027"/>
                      <div style={{paddingBottom:10}}><button style={S.btn("danger")} onClick={()=>arrSet("certifications",a=>a.filter(x=>x.id!==c.id))}>✕</button></div>
                    </div>
                  ))}
                  <button style={S.btn()} onClick={()=>arrSet("certifications",a=>[...a,mkCert()])}>+ Add Cert</button>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🥇 Awards & Recognition</div>
                  {cv.awards.map((a,i)=>(
                    <div key={a.id} style={{marginBottom:10}}>
                      <div style={{...S.row,alignItems:"flex-end",gap:8}}>
                        <Inp label="Award" value={a.title} onChange={v=>patchAwd(a.id,"title",v)} placeholder="Employee of the Year"/>
                        <Inp label="Issuer" value={a.issuer} onChange={v=>patchAwd(a.id,"issuer",v)} placeholder="Acme Corp"/>
                        <Inp label="Date" value={a.date} onChange={v=>patchAwd(a.id,"date",v)} placeholder="2023"/>
                        <div style={{paddingBottom:10}}><button style={S.btn("danger")} onClick={()=>arrSet("awards",a2=>a2.filter(x=>x.id!==a.id))}>✕</button></div>
                      </div>
                      <Inp value={a.description} onChange={v=>patchAwd(a.id,"description",v)} placeholder="Why you received this award..."/>
                    </div>
                  ))}
                  <button style={S.btn()} onClick={()=>arrSet("awards",a=>[...a,mkAward()])}>+ Add Award</button>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🤝 Volunteering & Community</div>
                  <div style={{fontSize:11,color:T.faint,marginBottom:8}}>Shows character, fills employment gaps, demonstrates skills. Include if the role or skills are relevant.</div>
                  {cv.volunteering.map((v,i)=>(
                    <div key={v.id} style={{marginBottom:10}}>
                      <div style={{...S.row,alignItems:"flex-end",gap:8}}>
                        <Inp label="Role" value={v.role} onChange={x=>patchVol(v.id,"role",x)} placeholder="Mentor"/>
                        <Inp label="Organisation" value={v.org} onChange={x=>patchVol(v.id,"org",x)} placeholder="Code First Girls"/>
                        <Inp label="Start" value={v.start} onChange={x=>patchVol(v.id,"start",x)} placeholder="2022"/>
                        <Inp label="End" value={v.end} onChange={x=>patchVol(v.id,"end",x)} placeholder="Present"/>
                        <div style={{paddingBottom:10}}><button style={S.btn("danger")} onClick={()=>arrSet("volunteering",a=>a.filter(x=>x.id!==v.id))}>✕</button></div>
                      </div>
                      <Inp value={v.description} onChange={x=>patchVol(v.id,"description",x)} placeholder="Mentored 12 junior developers in Python and ML fundamentals..."/>
                    </div>
                  ))}
                  <button style={S.btn()} onClick={()=>arrSet("volunteering",a=>[...a,mkVol()])}>+ Add</button>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🌍 Languages</div>
                  {cv.languages.map((l,i)=>(
                    <div key={l.id} style={{...S.row,alignItems:"flex-end",gap:8,marginBottom:7}}>
                      <Inp label={i===0?"Language":undefined} value={l.language} onChange={v=>patchLang(l.id,"language",v)} placeholder="Spanish"/>
                      <Sel label={i===0?"Level":undefined} value={l.level} onChange={v=>patchLang(l.id,"level",v)} options={[["","Select"],["Native","Native"],["C2","C2 Mastery"],["C1","C1 Advanced"],["B2","B2 Upper Intermediate"],["B1","B1 Intermediate"],["A2","A2 Elementary"],["A1","A1 Beginner"]]}/>
                      <div style={{paddingBottom:10}}><button style={S.btn("danger")} onClick={()=>arrSet("languages",a=>a.filter(x=>x.id!==l.id))}>✕</button></div>
                    </div>
                  ))}
                  <button style={S.btn()} onClick={()=>arrSet("languages",a=>[...a,mkLang()])}>+ Add Language</button>
                </div>
              </>
            )}

            {/* ── AI COACH ── */}
            {tab==="analyse"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>🤖 AI CV Coach</div>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
                    {[["analyse","📊 Full Analysis","Strengths, gaps, ATS tips"],["tailor","🎯 Tailor to JD","Match job description"],["bullets","✍ Rewrite Bullets","Stronger achievement bullets"],["summary","💬 Write Summary","Generate profile"],["gaps","🔎 Gap Analysis","Career gaps & issues"]].map(([id,label,desc])=>(
                      <div key={id} onClick={()=>setAiMode(id)} style={{flex:"1 1 140px",padding:"8px 11px",borderRadius:8,cursor:"pointer",border:`1px solid ${aiMode===id?T.accent:T.border}`,background:aiMode===id?"#16122a":"#0d0d1a",transition:"all .15s"}}>
                        <div style={{fontWeight:600,fontSize:12,color:aiMode===id?T.accentLight:T.muted}}>{label}</div>
                        <div style={{fontSize:10,color:T.faint,marginTop:2}}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  {aiMode==="tailor"&&!cv.targetJD&&<div style={{padding:"8px 12px",background:"#1a1000",border:`1px solid ${T.yellow}30`,borderRadius:7,fontSize:12,color:T.yellow,marginBottom:10}}>⚠ Add a job description in the Variants tab first</div>}
                  <button style={{...S.btn("primary"),padding:"9px 20px"}} onClick={runAI} disabled={aiLoading}>{aiLoading?"⏳ Analysing…":"▶ Run Analysis"}</button>
                </div>
                {(aiOutput||aiLoading)&&(
                  <div style={S.card}>
                    <div style={S.cardTitle}>
                      <span>AI Feedback</span>
                      <div style={{display:"flex",gap:6}}>
                        {aiMode==="summary"&&aiOutput&&<button style={S.btn("primary")} onClick={()=>{patchP("summary",aiOutput.trim());toast("Applied!","success");}}>Apply →</button>}
                        {aiOutput&&<button style={S.btn()} onClick={()=>copyText(aiOutput,"Feedback")}>{copied==="Feedback"?"✓":"Copy"}</button>}
                      </div>
                    </div>
                    {aiLoading?<div style={{color:T.muted,fontSize:13}}>⏳ Thinking…</div>:<pre style={{whiteSpace:"pre-wrap",fontSize:13,color:"#c0b8e0",lineHeight:1.75,fontFamily:"'Sora',sans-serif"}}>{aiOutput}</pre>}
                  </div>
                )}
                <div style={S.card}>
                  <div style={S.cardTitle}>📋 ATS Checklist 2026</div>
                  {[
                    ["Name & email",!!(cv.personal.name&&cv.personal.email)],
                    ["Phone & location",!!(cv.personal.phone&&cv.personal.location)],
                    ["Professional headline",!!cv.personal.title],
                    ["Summary ≥60 words",cv.personal.summary.split(/\s+/).filter(Boolean).length>=60],
                    ["2+ experience entries",cv.experience.length>=2],
                    ["3-5 bullets per role",cv.experience.length>0&&cv.experience.every(e=>e.bullets.filter(b=>b.trim()).length>=3)],
                    ["Quantified achievements (numbers)",cv.experience.some(e=>e.bullets.some(b=>/\d/.test(b)))],
                    ["No weak bullet openers",!cv.experience.some(e=>e.bullets.some(b=>b.trim()&&isWeak(b)))],
                    ["Action verbs in bullets",cv.experience.some(e=>e.bullets.some(b=>/^(led|built|designed|managed|delivered|increased|improved|created|developed|launched|drove|scaled|achieved|reduced|optimised|implemented|spearheaded)/i.test(b.trim())))],
                    ["5+ skills listed",allSk.length>=5],
                    ["Technical skills categorised",cv.skills.technical.length>0],
                    ["Education present",cv.education.length>=1],
                    ["LinkedIn URL added",!!cv.personal.linkedin],
                    ["GitHub / portfolio linked",!!(cv.personal.github||cv.personal.website)],
                    ["All experience dates filled",cv.experience.every(e=>e.start)],
                    ["No clichés (hardworking/team player)",!/hardworking|team player|go-getter|synergy|passionate about/i.test(cv.personal.summary)],
                  ].map(([label,ok])=>(
                    <div key={label} style={{display:"flex",gap:9,padding:"5px 0",borderBottom:`1px solid #1a1a2a`,fontSize:12}}>
                      <span>{ok?"✅":"⬜"}</span><span style={{color:ok?"#b0d0b0":"#9090b0"}}>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── KEYWORDS ── */}
            {tab==="keywords"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>🔍 Keyword Gap Analyser</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.65}}>ATS systems rank CVs by keyword match against the job description. Paste a JD in the Variants tab, then analyse which keywords you have vs. what's missing.</div>
                  {!cv.targetJD&&<div style={{padding:"9px 12px",background:"#1a1000",border:`1px solid ${T.yellow}30`,borderRadius:7,fontSize:12,color:T.yellow,marginBottom:10}}>⚠ Go to Variants tab and paste a job description first</div>}
                  <button style={S.btn("primary")} onClick={()=>{if(!cv.targetJD){toast("Add a job description in Variants first","error");return;}setKwResult(analyzeKeywords(cv,cv.targetJD));}} disabled={!cv.targetJD}>🔍 Analyse Now</button>
                </div>
                {kwResult&&(
                  <>
                    <div style={S.card}>
                      <div style={S.cardTitle}><span>Keyword Match Score</span><span style={{fontSize:18,fontWeight:700,color:kwResult.score>=70?T.green:kwResult.score>=50?T.yellow:T.red,fontFamily:"'DM Mono',monospace"}}>{kwResult.score}%</span></div>
                      <Meter label="Match rate" score={kwResult.score}/>
                      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{kwResult.score>=70?"✓ Strong match for this role":kwResult.score>=50?"⚠ Moderate — add key missing terms":"✗ Low — significant tailoring needed. Use AI Coach → Tailor to JD"}</div>
                      <div style={{fontSize:11,color:T.faint}}>Target: 70-80% match. Don't keyword-stuff — weave terms in naturally.</div>
                    </div>
                    <div style={S.card}>
                      <div style={S.cardTitle}>✅ Present in your CV ({kwResult.matched.length})</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{kwResult.matched.map(k=><span key={k} style={{...S.pill,borderColor:T.green+"30",color:T.green,background:"#051a05"}}>{k}</span>)}</div>
                    </div>
                    <div style={S.card}>
                      <div style={S.cardTitle}>❌ Missing from your CV ({kwResult.missing.length})</div>
                      <div style={{fontSize:11,color:T.muted,marginBottom:9}}>Click a keyword to add it to your "Other" skills, or add it naturally to your bullets/summary.</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{kwResult.missing.slice(0,25).map(k=>(
                        <span key={k} style={{...S.pill,borderColor:T.red+"30",color:T.red,background:"#1a0505",cursor:"pointer"}} onClick={()=>{addSkill("other",k);toast(`Added "${k}" to skills`,"success");}}>
                          {k} <span style={{fontSize:9}}>+</span>
                        </span>
                      ))}</div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── COVER LETTER ── */}
            {tab==="coverletter"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>✉ Cover Letter Generator</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.65}}>AI generates a tailored, human-sounding cover letter. Works best with a job description in the Variants tab — but will work without one too.</div>
                  <Sel label="Tone" value={coverLetter.tone} onChange={v=>setCoverLetter(c=>({...c,tone:v}))} options={[["professional","Professional & Polished"],["confident","Confident & Direct"],["conversational","Conversational & Warm"],["creative","Creative & Personality-led"],["technical","Technical & Detailed"]]}/>
                  <Ta label="Specific focus (optional)" rows={2} value={coverLetter.focus} onChange={v=>setCoverLetter(c=>({...c,focus:v}))} placeholder="e.g. Emphasise Python expertise, mention I'm relocating to Berlin, highlight team leadership at Acme Corp..."/>
                  <button style={{...S.btn("primary"),padding:"9px 20px"}} onClick={genCoverLetter} disabled={coverLetter.loading}>{coverLetter.loading?"⏳ Writing…":"✨ Generate Cover Letter"}</button>
                </div>
                {coverLetter.output&&(
                  <div style={S.card}>
                    <div style={S.cardTitle}><span>Cover Letter</span><button style={S.btn()} onClick={()=>copyText(coverLetter.output,"Cover Letter")}>{copied==="Cover Letter"?"✓ Copied":"Copy"}</button></div>
                    <pre style={{whiteSpace:"pre-wrap",fontSize:13,color:"#c0b8e0",lineHeight:1.8,fontFamily:"'Sora',sans-serif"}}>{coverLetter.output}</pre>
                  </div>
                )}
              </>
            )}

            {/* ── INTERVIEW ── */}
            {tab==="interview"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>🎙 Interview Preparation</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.65}}>Generate 10 likely interview questions based on your CV and target role — with tips on how to answer each using STAR format. Set your target role in the Variants tab for best results.</div>
                  <button style={{...S.btn("primary"),padding:"9px 20px"}} onClick={genInterviewQs} disabled={interviewQs.loading}>{interviewQs.loading?"⏳ Generating…":"🎙 Generate 10 Questions"}</button>
                </div>
                {interviewQs.output&&(
                  <div style={S.card}>
                    <div style={S.cardTitle}><span>10 Likely Questions</span><button style={S.btn()} onClick={()=>copyText(interviewQs.output,"Questions")}>{copied==="Questions"?"✓":"Copy All"}</button></div>
                    <pre style={{whiteSpace:"pre-wrap",fontSize:13,color:"#c0b8e0",lineHeight:1.85,fontFamily:"'Sora',sans-serif"}}>{interviewQs.output}</pre>
                  </div>
                )}
              </>
            )}

            {/* ── VARIANTS ── */}
            {tab==="variants"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>🎯 Target Role & JD</div>
                  <div style={{fontSize:11,color:T.faint,marginBottom:10}}>Used by AI Coach, Keyword Analyser, Cover Letter, and Interview Prep.</div>
                  <Inp label="Target Job Title" value={cv.targetRole} onChange={v=>setCV(p=>({...p,targetRole:v}))} placeholder="Senior Software Engineer at Google"/>
                  <Ta label="Paste Job Description" rows={8} value={cv.targetJD} onChange={v=>setCV(p=>({...p,targetJD:v}))} placeholder="Paste the full job description here..."/>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🔀 CV Variants</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Save named snapshots for different roles. Each variant stores a complete copy — switch freely without losing anything.</div>
                  <button style={{...S.btn("primary"),marginBottom:12}} onClick={()=>{const name=prompt("Variant name (e.g. 'Senior PM – Fintech'):");if(!name)return;setCV(p=>({...p,variants:[...p.variants,{id:uid(),name,snapshot:clone(p)}]}));toast(`Saved: ${name}`,"success");}}>💾 Save Current as Variant</button>
                  {cv.variants.length===0&&<div style={{fontSize:12,color:T.faint}}>No variants yet — fill your CV then save variants for specific roles.</div>}
                  {cv.variants.map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"#0d0d1a",border:`1px solid ${T.border}`,borderRadius:8,marginBottom:7}}>
                      <span style={{flex:1,fontSize:13,color:T.accentLight}}>{v.name}</span>
                      <button style={S.btn()} onClick={()=>{setCV({...clone(v.snapshot),variants:cv.variants});toast(`Loaded: ${v.name}`,"info");}}>Load</button>
                      <button style={S.btn("danger")} onClick={()=>setCV(p=>({...p,variants:p.variants.filter(x=>x.id!==v.id)}))}>✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── LINKEDIN ── */}
            {tab==="linkedin"&&(
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>💼 LinkedIn Profile Generator</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Generate every section of your LinkedIn profile — headline, About, experience descriptions, skills to endorse, post ideas, and a connection note template.</div>
                  <div style={S.row}><Inp label="Target Roles" value={liGoals.targetRoles} onChange={v=>setLiGoals(g=>({...g,targetRoles:v}))} placeholder="Senior Engineer, Tech Lead, CTO"/><Inp label="Industries" value={liGoals.industries} onChange={v=>setLiGoals(g=>({...g,industries:v}))} placeholder="Fintech, SaaS, Gaming"/></div>
                  <Inp label="Open To" value={liGoals.openTo} onChange={v=>setLiGoals(g=>({...g,openTo:v}))} placeholder="Full-time, freelance, advisory, co-founder..."/>
                  <div style={S.row}><Sel label="Tone" value={liGoals.tone} onChange={v=>setLiGoals(g=>({...g,tone:v}))} options={[["professional","Professional"],["conversational","Conversational"],["bold","Bold & Ambitious"],["technical","Technical"],["creative","Creative"]]}/></div>
                  <Ta label="Extra context" rows={2} value={liGoals.extras} onChange={v=>setLiGoals(g=>({...g,extras:v}))} placeholder="Relocating to Berlin, pivoting from finance to tech, want to show AI thought leadership..."/>
                  <button style={{...S.btn("primary"),padding:"9px 20px"}} onClick={genLinkedIn} disabled={liLoading}>{liLoading?"⏳ Generating…":"✨ Generate Full LinkedIn Profile"}</button>
                </div>
                {liOutput && !liLoading && (
                  <LinkedInOutput li={liOutput} copied={copied} copyText={copyText} />
                )}
              </>
            )}

          </div>

          {/* ── Preview ── */}
          {showPreview&&(
            <div style={S.preview}>
              <div style={{padding:"8px 13px",background:"#e8e6f0",borderBottom:"1px solid #ccc",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10.5,fontWeight:700,color:"#4a3aaa"}}>LIVE PREVIEW</span>
                <button style={{fontSize:11,padding:"3px 9px",borderRadius:5,border:"1px solid #ccc",background:previewTheme==="dark"?"#1a1a2e":"#fff",color:previewTheme==="dark"?"#b09fff":"#4a3aaa",cursor:"pointer",fontFamily:"'Sora',sans-serif"}} onClick={()=>setPreviewTheme(t=>t==="light"?"dark":"light")}>
                  {previewTheme==="light"?"🌙":"☀"}
                </button>
              </div>
              <CVPreview cv={cv} theme={previewTheme}/>
            </div>
          )}
        </div>
      </div>

      {/* ── Toasts ── */}
      <div style={{position:"fixed",bottom:16,right:16,display:"flex",flexDirection:"column",gap:6,zIndex:9999}}>
        {toasts.map(t=>(
          <div key={t.id} style={{padding:"8px 13px",borderRadius:8,fontSize:13,fontWeight:500,fontFamily:"'Sora',sans-serif",background:t.type==="success"?"#061a06":t.type==="error"?"#1a0606":"#0e0e1c",color:t.type==="success"?T.green:t.type==="error"?T.red:T.accentLight,border:`1px solid ${t.type==="success"?T.green+"30":t.type==="error"?T.red+"30":T.border}`,boxShadow:"0 4px 18px rgba(0,0,0,.5)"}}>
            {t.msg}
          </div>
        ))}
      </div>

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:99px}
        input::placeholder,textarea::placeholder{color:${T.faint}}
        button:not(:disabled):hover{opacity:.82;transform:translateY(-1px)}
        button:not(:disabled):active{transform:translateY(0)}
        button:disabled{opacity:.38;cursor:not-allowed}
        select option{background:#12121e;color:${T.text}}
      `}</style>
    </div>
  );
}
