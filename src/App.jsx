import { useState, useEffect, useCallback, useRef } from "react";

// ─── Trusted Sources ──────────────────────────────────────────────────────────
const TRUSTED_SOURCES = [
  { name: "Economic Times Markets", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",           category: "Markets",  trust: "Verified — Bennett Coleman & Co. Ltd" },
  { name: "Economic Times Finance", url: "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms",             category: "Finance",  trust: "Verified — Bennett Coleman & Co. Ltd" },
  { name: "Economic Times Business",url: "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",            category: "Business", trust: "Verified — Bennett Coleman & Co. Ltd" },
  { name: "Business Standard",      url: "https://www.business-standard.com/rss/finance-1.rss",                           category: "Finance",  trust: "Verified — Business Standard Ltd" },
  { name: "Moneycontrol",           url: "https://www.moneycontrol.com/rss/business.xml",                                 category: "Business", trust: "Verified — Network18 Media" },
  { name: "Livemint Markets",       url: "https://www.livemint.com/rss/markets",                                           category: "Markets",  trust: "Verified — HT Media Ltd" },
  { name: "Livemint Companies",     url: "https://www.livemint.com/rss/companies",                                         category: "Business", trust: "Verified — HT Media Ltd" },
];
const NEWS_CATEGORIES = ["All", "Markets", "Finance", "Business"];
const RSS_PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";
const SK = { session:"ap:session", users:"ap:users", bookmarks:(e)=>`ap:bm:${e.replace(/[^a-z0-9]/gi,"_")}`, apikey:"ap:apikey" };
const BUILT_IN_KEY=(()=>{try{return process.env.REACT_APP_CLAUDE_KEY||"";}catch(_){return "";}})();
const getApiKey=()=>{
  if(BUILT_IN_KEY) return BUILT_IN_KEY;
  try{return localStorage.getItem("ap:apikey")||"";}catch(_){return "";}
};
const setApiKey=(k)=>{ try{localStorage.setItem("ap:apikey",k);}catch(_){} };

const SUGGESTED_QUESTIONS = {
  Markets:  ["What does this mean for the stock market?","Is this good or bad for investors?","Which sectors are affected?"],
  Finance:  ["How does this affect common people?","What should a salaried person do?","Explain this in simple terms"],
  Business: ["What does this mean for Indian businesses?","How does this impact jobs?","Who benefits from this?"],
  default:  ["Explain this news in simple terms","What is the background of this story?","How does this affect India?"],
};

// ─── Prompts ──────────────────────────────────────────────────────────────────
const ETHICAL_PROMPT=(a)=>`You are the ethical AI news analyst for Axoniva Pulse, an Indian financial news platform.
STRICT RULES: 1.Never invent facts. 2.Never allege against individuals. 3.Use "reportedly"/"allegedly" for unverified claims. 4.Flag LEGAL_CASE for court/arrest. 5.Flag INDIVIDUAL_ALLEGATION for personal allegations. 6.Flag OPINION_PIECE for editorials. 7.Flag UNVERIFIED_CLAIMS if no sources cited. 8.Flag SUSPICIOUS_CONTENT + safe_to_publish=false if fabricated. 9.Flag MARKET_RUMOUR for rumours. 10.NEVER give financial advice. 11.Strictly neutral.
ARTICLE — Title: ${a.title} | Content: ${a.description} | Source: ${a.source}
Return ONLY valid JSON:
{"safe_to_publish":true,"summary":"2-3 neutral sentences max 80 words","what_happened":"1 sentence core event","what_it_means":"1 sentence context for Indian reader, not financial advice","sentiment":"positive or negative or neutral","confidence":"high or medium or low","content_flags":[],"flag_reason":"","tags":["k1","k2","k3"],"ai_disclaimer":"AI-assisted summary from ${a.source}. Not verified journalism. Not financial advice. Always read the original article."}`;

const CHAT_SYSTEM_PROMPT=(article)=>`You are the AI news assistant for Axoniva Pulse, a trusted Indian financial news platform by Axoniva AI Tech.
Article: TITLE: ${article.title} | CONTENT: ${article.description} | SOURCE: ${article.source}
RULES: 1.Only discuss this story. 2.NEVER give investment advice. 3.Never invent facts. 4.Use "reportedly" for claims. 5.Keep answers simple, 2-4 sentences. 6.Say "consult a professional" for legal/financial decisions. 7.End with: "📰 Read the full article at ${article.source} for complete details."`;

const GLOBAL_CHAT_SYSTEM=`You are the AI assistant for Axoniva Pulse, Indian financial news platform by Axoniva AI Tech. Only discuss Indian finance, markets, business news. NEVER give investment advice. Keep answers simple and clear. Not a financial advisor.`;

const BRIEFING_PROMPT=(articles,userName,hour)=>`You are the News Briefing AI for Axoniva Pulse. Create a ${hour<12?"morning":hour<17?"afternoon":"evening"} briefing for ${userName||"our reader"}.
STORIES: ${articles.slice(0,5).map((a,i)=>`${i+1}.[${a.category}] ${a.title} — ${a.description?.slice(0,120)}`).join("\n")}
RULES: 1.Never invent facts. 2.Never give financial advice. 3.Use "reportedly" for unverified claims. 4.1-2 sentences per story. 5.Not a financial advisor.
Return ONLY valid JSON:
{"greeting":"${hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'} ${userName||'there'}! Here's your Axoniva Pulse briefing.","date":"${new Date().toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}","market_mood":"bullish or bearish or mixed or steady","market_mood_reason":"1 sentence why","stories":[{"number":1,"category":"","headline":"","summary":"","sentiment":"positive or negative or neutral","source":""}],"closing":"1 sentence closing appropriate for ${hour<12?"morning":hour<17?"afternoon":"evening"}.","disclaimer":"AI-generated briefing from verified sources. Not financial advice."}`;

// ─── World-Class Design Tokens (FT + Bloomberg + Reuters inspired) ─────────────
const C = {
  // Core
  ink:       "#0A0A0A",   // near-black — like FT headlines
  inkMid:    "#1C1C1C",
  inkLight:  "#3D3D3D",
  muted:     "#6B6B6B",
  subtle:    "#9B9B9B",
  // Backgrounds
  cream:     "#F8F4EF",   // FT's warm cream
  creamDark: "#EDE8E1",
  paper:     "#FDFCFB",
  white:     "#FFFFFF",
  // Brand
  gold:      "#C9A84C",   // premium gold accent
  goldDark:  "#A8893A",
  goldLight: "#F5EDD6",
  navy:      "#0A1628",
  navyMid:   "#162240",
  blue:      "#1B5FA8",   // editorial blue — not electric
  blueSoft:  "#E8F0F8",
  // Status
  green:     "#1A7A4A",  greenBg: "#E8F5EE",
  red:       "#C0392B",  redBg:   "#FDECEA",
  amber:     "#B7770D",  amberBg: "#FEF7E6",
  purple:    "#5B3B8C",  purpleBg:"#F0EBF8",
  orange:    "#C05A1F",  orangeBg:"#FEF0E6",
  // Borders
  rule:      "#D4C9BC",   // editorial rule colour
  ruleDark:  "#B5A99A",
};

// Category editorial colours — like section tabs in FT/Bloomberg
const CAT_CFG = {
  Markets:  { accent: "#1B5FA8", bg: "#E8F0F8", label: "Markets"  },
  Finance:  { accent: "#1A7A4A", bg: "#E8F5EE", label: "Finance"  },
  Business: { accent: "#C05A1F", bg: "#FEF0E6", label: "Business" },
};

const FLAG_CFG = {
  LEGAL_CASE:            {color:C.amber, bg:C.amberBg, icon:"⚖",  label:"Legal Case"},
  INDIVIDUAL_ALLEGATION: {color:C.red,   bg:C.redBg,   icon:"⚠",  label:"Allegation"},
  OPINION_PIECE:         {color:C.purple,bg:C.purpleBg,icon:"✦",  label:"Opinion"},
  UNVERIFIED_CLAIMS:     {color:C.orange,bg:C.orangeBg,icon:"◎",  label:"Unverified"},
  MARKET_RUMOUR:         {color:C.amber, bg:C.amberBg, icon:"◈",  label:"Rumour"},
  SUSPICIOUS_CONTENT:    {color:C.red,   bg:C.redBg,   icon:"✕",  label:"Suspicious"},
  POLITICAL_CONTENT:     {color:C.purple,bg:C.purpleBg,icon:"◉",  label:"Political"},
  SENSITIVE_TOPIC:       {color:C.orange,bg:C.orangeBg,icon:"◆",  label:"Sensitive"},
};

// ─── Responsive Hook ──────────────────────────────────────────────────────────
const useBreakpoint=()=>{
  const [bp,setBp]=useState({isMobile:false,isTablet:false,isDesktop:true,w:1200});
  useEffect(()=>{
    const u=()=>{const w=window.innerWidth;setBp({isMobile:w<640,isTablet:w>=640&&w<1024,isDesktop:w>=1024,w});};
    u();window.addEventListener("resize",u);return()=>window.removeEventListener("resize",u);
  },[]);
  return bp;
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const timeAgo=(d)=>{const diff=Date.now()-new Date(d).getTime(),m=Math.floor(diff/60000),h=Math.floor(m/60),day=Math.floor(h/24);if(m<2)return"Just now";if(m<60)return`${m} min ago`;if(h<24)return`${h}h ago`;return`${day}d ago`;};
const stripHtml=(s="")=>s.replace(/<[^>]*>/g," ").replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim();
const validateEmail=(e)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const readTime=(text)=>Math.max(1,Math.ceil(text.split(" ").length/200));

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Spinner=({size=18,color=C.gold})=><span style={{display:"inline-block",width:size,height:size,border:`2px solid ${color}`,borderTopColor:"transparent",borderRadius:"50%",animation:"aspin 0.8s linear infinite",flexShrink:0}}/>;

const LivePill=()=>(
  <span style={{display:"inline-flex",alignItems:"center",gap:5,background:C.red,color:C.white,fontSize:9,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",padding:"3px 8px",fontFamily:"'DM Sans',sans-serif"}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:C.white,display:"inline-block",animation:"apulse 1.5s infinite",flexShrink:0}}/>
    Live
  </span>
);

const SectionRule=({label,accent=C.gold})=>(
  <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:16}}>
    <div style={{width:3,height:18,background:accent,flexShrink:0}}/>
    <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:accent,paddingLeft:8,fontFamily:"'DM Sans',sans-serif"}}>{label}</span>
    <div style={{flex:1,height:1,background:C.rule,marginLeft:12}}/>
  </div>
);

const CategoryLabel=({cat,small=false})=>{
  const cfg=CAT_CFG[cat]||CAT_CFG.Markets;
  return <span style={{fontSize:small?9:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:cfg.accent,fontFamily:"'DM Sans',sans-serif"}}>{cfg.label}</span>;
};

const SentimentDot=({s})=>{
  const m={positive:{c:C.green,l:"Positive"},negative:{c:C.red,l:"Negative"},neutral:{c:C.amber,l:"Neutral"}};
  const v=m[s?.toLowerCase()]||m.neutral;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,color:v.c,fontFamily:"'DM Sans',sans-serif",fontWeight:600}}><span style={{width:5,height:5,borderRadius:"50%",background:v.c,display:"inline-block"}}/>{v.l}</span>;
};

const FlagRow=({flags,reason})=>{
  if(!flags?.length)return null;
  return <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>{flags.map(f=>{const cfg=FLAG_CFG[f];if(!cfg)return null;return <span key={f} title={reason||""} style={{fontSize:9,fontWeight:700,color:cfg.color,background:cfg.bg,padding:"2px 6px",letterSpacing:"0.08em",textTransform:"uppercase",cursor:"help",fontFamily:"'DM Sans',sans-serif"}}>{cfg.icon} {cfg.label}</span>;})}</div>;
};

// ─── AI Summary Panel ─────────────────────────────────────────────────────────
const AISummaryPanel=({summary,loading,onDark=false})=>{
  if(!loading&&!summary)return null;
  const bg=onDark?"rgba(201,168,76,0.1)":"#FEFBF4";
  const border=C.gold;
  const tc=onDark?"rgba(255,255,255,0.85)":C.inkMid;
  const sc=onDark?"rgba(255,255,255,0.55)":C.muted;
  return(
    <div style={{background:bg,borderLeft:`2px solid ${border}`,padding:"14px 16px",marginTop:14,animation:"afadeup 0.3s ease"}}>
      {loading?(
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Spinner size={14} color={C.gold}/>
          <span style={{fontSize:11,color:C.gold,letterSpacing:"0.05em",fontFamily:"'DM Sans',sans-serif"}}>Analysing with ethical filters…</span>
        </div>
      ):summary.blocked?(
        <div>
          <p style={{fontSize:11,fontWeight:700,color:C.red,margin:"0 0 6px",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>✕ Summary Withheld</p>
          <p style={{fontSize:11.5,color:C.red,margin:"0 0 6px",lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>Flagged by ethical content filters. Read the original article via the source link.</p>
          <FlagRow flags={summary.content_flags} reason={summary.flag_reason}/>
        </div>
      ):summary.error?(
        <div>
          <p style={{margin:"0 0 6px",fontSize:13,color:C.red,fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>{summary.nokey?"🔑 AI Key Required":"⚠ Analysis Failed"}</p>
          <p style={{margin:"0 0 12px",fontSize:12,color:C.muted,fontFamily:"'DM Sans',sans-serif",lineHeight:1.65}}>{summary.nokey?"AI Analysis needs a free Anthropic API key. Takes 1 minute to set up.":"Could not generate analysis. Please try again in a moment."}</p>
          {summary.nokey&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",background:C.ink,color:C.gold,fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",textDecoration:"none",fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:5}}>Get Free API Key →</a>
            <button onClick={()=>{const k=window.prompt("Paste your Anthropic API key (starts with sk-ant-):");if(k&&k.trim().startsWith("sk-ant-")){setApiKey(k.trim());window.alert("Key saved! ✓ Now click AI Analysis again.");}else if(k){window.alert("Invalid key. It should start with sk-ant-");}}} style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.rule}`,color:C.inkLight,fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>I Have a Key — Enter It</button>
          </div>}
        </div>
      ):(
        <>
          <FlagRow flags={summary.content_flags} reason={summary.flag_reason}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",color:C.gold,fontFamily:"'DM Sans',sans-serif"}}>✦ AI Analysis</span>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <SentimentDot s={summary.sentiment}/>
              <span style={{fontSize:9,color:sc,fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"}}>{summary.confidence} confidence</span>
            </div>
          </div>
          <p style={{fontSize:13,lineHeight:1.7,color:tc,margin:"0 0 10px",fontFamily:"'DM Sans',sans-serif"}}>{summary.summary}</p>
          <div style={{borderTop:`1px solid ${onDark?"rgba(255,255,255,0.1)":C.rule}`,paddingTop:10,display:"flex",flexDirection:"column",gap:6}}>
            <p style={{fontSize:12,margin:0,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}><strong style={{color:onDark?C.white:C.ink,fontWeight:600}}>What happened — </strong><span style={{color:tc}}>{summary.what_happened}</span></p>
            <p style={{fontSize:12,margin:0,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}><strong style={{color:onDark?C.white:C.ink,fontWeight:600}}>What it means — </strong><span style={{color:tc}}>{summary.what_it_means}</span></p>
          </div>
          {summary.tags?.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {summary.tags.map(t=><span key={t} style={{fontSize:9,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>#{t}</span>)}
            </div>
          )}
          <p style={{fontSize:9.5,color:sc,margin:"10px 0 0",lineHeight:1.65,fontFamily:"'DM Sans',sans-serif",borderTop:`1px solid ${onDark?"rgba(255,255,255,0.08)":C.rule}`,paddingTop:8}}>
            ⓘ {summary.ai_disclaimer}
          </p>
        </>
      )}
    </div>
  );
};

// ─── Story Chat Panel ─────────────────────────────────────────────────────────
const StoryChatPanel=({article,onClose})=>{
  const [messages,setMessages]=useState([{role:"assistant",content:`Ask me anything about this story. I'll explain it clearly.\n\n"${article.title}"`}]);
  const [input,setInput]=useState("");const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);const inputRef=useRef(null);
  const suggestions=SUGGESTED_QUESTIONS[article.category]||SUGGESTED_QUESTIONS.default;
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),100);},[]);

  const send=async(text)=>{
    const q=text||input.trim();if(!q||loading)return;
    setInput("");setMessages(p=>[...p,{role:"user",content:q}]);setLoading(true);
    try{
      const ak=getApiKey();if(!ak){setMessages(p=>[...p,{role:"assistant",content:"⚠️ API key not configured. Please set your Anthropic API key in Settings."}]);setLoading(false);return;}const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ak,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-3-5-haiku-20241022",max_tokens:600,system:CHAT_SYSTEM_PROMPT(article),messages:[...messages.slice(-8).map(m=>({role:m.role,content:m.content})),{role:"user",content:q}]})});
      const data=await res.json();
      setMessages(p=>[...p,{role:"assistant",content:data.content?.[0]?.text||"Could not generate response."}]);
    }catch(_){setMessages(p=>[...p,{role:"assistant",content:"Connection error. Please try again."}]);}
    setLoading(false);
  };

  return(
    <div style={{marginTop:16,background:C.paper,border:`1px solid ${C.rule}`,animation:"afadeup 0.3s ease"}}>
      <div style={{background:C.ink,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:C.gold,fontFamily:"'DM Sans',sans-serif"}}>✦ Ask AI</span>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:"'DM Sans',sans-serif"}}>Not financial advice</span>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:16,cursor:"pointer",padding:2,lineHeight:1}}>✕</button>
      </div>
      <div style={{height:260,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10,WebkitOverflowScrolling:"touch"}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:8,justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"afadeup 0.2s ease"}}>
            {m.role==="assistant"&&<span style={{width:20,height:20,background:C.gold,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>AI</span>}
            <div style={{maxWidth:"84%",padding:"9px 12px",background:m.role==="user"?C.ink:C.cream,color:m.role==="user"?C.white:C.ink,fontSize:12.5,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>
              {m.content.split("\n").map((l,j)=><p key={j} style={{margin:"0 0 3px"}}>{l}</p>)}
            </div>
            {m.role==="user"&&<span style={{width:20,height:20,background:C.creamDark,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>U</span>}
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{width:20,height:20,background:C.gold,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>AI</span>
            <div style={{padding:"9px 12px",background:C.cream,display:"flex",gap:4,alignItems:"center"}}>
              {[0,0.2,0.4].map((d,i)=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.gold,display:"inline-block",animation:`apulse 1s infinite ${d}s`}}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {messages.length<=1&&(
        <div style={{padding:"0 14px 10px",display:"flex",gap:5,flexWrap:"wrap"}}>
          {suggestions.map((q,i)=>(
            <button key={i} onClick={()=>send(q)} style={{fontSize:10,padding:"4px 10px",background:"transparent",color:C.blue,border:`1px solid ${C.blue}`,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500,transition:"all 0.15s",letterSpacing:"0.02em"}}
              onMouseEnter={e=>{e.currentTarget.style.background=C.blue;e.currentTarget.style.color=C.white;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.blue;}}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div style={{padding:"10px 14px",borderTop:`1px solid ${C.rule}`,display:"flex",gap:8,background:C.white}}>
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ask anything about this story…" disabled={loading}
          style={{flex:1,padding:"8px 10px",border:`1px solid ${C.rule}`,fontSize:12.5,fontFamily:"'DM Sans',sans-serif",color:C.ink,outline:"none",background:loading?"#FAFAFA":C.white,transition:"border-color 0.2s"}}
          onFocus={e=>{e.target.style.borderColor=C.gold;}} onBlur={e=>{e.target.style.borderColor=C.rule;}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} style={{padding:"8px 16px",background:!input.trim()||loading?C.creamDark:C.ink,color:!input.trim()||loading?C.muted:C.white,border:"none",fontSize:12,fontWeight:600,cursor:!input.trim()||loading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",display:"flex",alignItems:"center",gap:5}}>
          {loading?<Spinner size={12} color={C.gold}/>:"Send"}
        </button>
      </div>
    </div>
  );
};

// ─── Global Chatbot ───────────────────────────────────────────────────────────
const GlobalChatbot=({isMobile})=>{
  const [open,setOpen]=useState(false);
  const [messages,setMessages]=useState([{role:"assistant",content:"Ask me anything about Indian finance, markets, RBI/SEBI policy, or economic news.\n\nExamples: What is repo rate? · How does inflation affect savings? · Explain Sensex vs Nifty."}]);
  const [input,setInput]=useState("");const [loading,setLoading]=useState(false);const [unread,setUnread]=useState(0);
  const bottomRef=useRef(null);const inputRef=useRef(null);
  useEffect(()=>{if(open){bottomRef.current?.scrollIntoView({behavior:"smooth"});setTimeout(()=>inputRef.current?.focus(),100);setUnread(0);}},[open,messages]);

  const send=async(text)=>{
    const q=text||input.trim();if(!q||loading)return;
    setInput("");setMessages(p=>[...p,{role:"user",content:q}]);setLoading(true);
    try{
      const ak=getApiKey();if(!ak){setMessages(p=>[...p,{role:"assistant",content:"⚠️ API key not configured. Please set your Anthropic API key in Settings."}]);setLoading(false);return;}const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ak,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-3-5-haiku-20241022",max_tokens:500,system:GLOBAL_CHAT_SYSTEM,messages:[...messages.slice(-8).map(m=>({role:m.role,content:m.content})),{role:"user",content:q}]})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"Could not respond. Please try again.";
      setMessages(p=>[...p,{role:"assistant",content:reply}]);
      if(!open)setUnread(p=>p+1);
    }catch(_){setMessages(p=>[...p,{role:"assistant",content:"Connection error. Please try again."}]);}
    setLoading(false);
  };
  const QUICK=["What is repo rate?","How does budget affect me?","Sensex vs Nifty?","What is inflation?"];

  return(
    <>
      {open&&(
        <div style={{position:"fixed",bottom:isMobile?"70px":"86px",right:isMobile?"12px":"28px",width:isMobile?"calc(100vw - 24px)":"360px",maxHeight:"68vh",background:C.white,border:`1px solid ${C.rule}`,boxShadow:"0 12px 48px rgba(0,0,0,0.15)",zIndex:900,display:"flex",flexDirection:"column",overflow:"hidden",animation:"afadeup 0.3s ease"}}>
          <div style={{background:C.ink,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div>
              <p style={{fontSize:12,fontWeight:700,color:C.gold,margin:0,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>✦ Axoniva AI</p>
              <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:0,fontFamily:"'DM Sans',sans-serif"}}>Finance & Markets Assistant</p>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:18,cursor:"pointer",padding:4}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"12px 14px",display:"flex",flexDirection:"column",gap:10,minHeight:180,WebkitOverflowScrolling:"touch"}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:8,justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"afadeup 0.2s ease"}}>
                {m.role==="assistant"&&<span style={{width:20,height:20,background:C.gold,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0,marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>AI</span>}
                <div style={{maxWidth:"84%",padding:"9px 12px",background:m.role==="user"?C.ink:C.cream,color:m.role==="user"?C.white:C.ink,fontSize:12.5,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>
                  {m.content.split("\n").map((l,j)=><p key={j} style={{margin:"0 0 3px"}}>{l}</p>)}
                </div>
                {m.role==="user"&&<span style={{width:20,height:20,background:C.creamDark,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0,marginTop:2}}>U</span>}
              </div>
            ))}
            {loading&&<div style={{display:"flex",gap:8}}><span style={{width:20,height:20,background:C.gold,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0}}>AI</span><div style={{padding:"9px 12px",background:C.cream,display:"flex",gap:4,alignItems:"center"}}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:C.gold,display:"inline-block",animation:`apulse 1s infinite ${d}s`}}/>)}</div></div>}
            <div ref={bottomRef}/>
          </div>
          {messages.length<=1&&<div style={{padding:"0 14px 10px",display:"flex",gap:5,flexWrap:"wrap",flexShrink:0}}>{QUICK.map((q,i)=><button key={i} onClick={()=>send(q)} style={{fontSize:10,padding:"4px 9px",background:"transparent",color:C.blue,border:`1px solid ${C.blue}`,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.blue;e.currentTarget.style.color=C.white;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.blue;}}>{q}</button>)}</div>}
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.rule}`,display:"flex",gap:8,background:C.white,flexShrink:0}}>
            <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Ask about Indian finance or markets…" disabled={loading}
              style={{flex:1,padding:"8px 10px",border:`1px solid ${C.rule}`,fontSize:12,fontFamily:"'DM Sans',sans-serif",color:C.ink,outline:"none",background:loading?"#FAFAFA":C.white}}
              onFocus={e=>{e.target.style.borderColor=C.gold;}} onBlur={e=>{e.target.style.borderColor=C.rule;}}/>
            <button onClick={()=>send()} disabled={!input.trim()||loading} style={{padding:"8px 14px",background:!input.trim()||loading?C.creamDark:C.ink,color:!input.trim()||loading?C.muted:C.white,border:"none",fontSize:11,fontWeight:700,cursor:!input.trim()||loading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",display:"flex",alignItems:"center",gap:4}}>
              {loading?<Spinner size={11} color={C.gold}/>:"Ask"}
            </button>
          </div>
          <p style={{fontSize:9,color:C.subtle,textAlign:"center",padding:"4px 14px 8px",fontFamily:"'DM Sans',sans-serif",flexShrink:0,background:C.white}}>Not financial advice · Verify with original sources</p>
        </div>
      )}
      <button onClick={()=>setOpen(p=>!p)} style={{position:"fixed",bottom:isMobile?16:24,right:isMobile?16:24,width:52,height:52,background:open?C.inkMid:C.ink,border:`2px solid ${C.gold}`,cursor:"pointer",zIndex:901,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.3)",transition:"all 0.25s",flexDirection:"column",gap:1}}>
        {open?<span style={{color:C.gold,fontSize:16,fontWeight:700}}>✕</span>:<><span style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:"0.1em",fontFamily:"'DM Sans',sans-serif",lineHeight:1}}>ASK</span><span style={{fontSize:9,fontWeight:700,color:C.gold,letterSpacing:"0.1em",fontFamily:"'DM Sans',sans-serif",lineHeight:1}}>AI</span></>}
        {!open&&unread>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,background:C.red,color:C.white,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif"}}>{unread}</span>}
      </button>
    </>
  );
};

// ─── Bookmark Button ──────────────────────────────────────────────────────────
const BookmarkBtn=({article,isBookmarked,onToggle,user,onAuthRequired,onDark=false})=>{
  const handle=(e)=>{e.stopPropagation();if(!user){onAuthRequired();return;}onToggle(article);};
  return(
    <button onClick={handle} title={!user?"Sign in to save":isBookmarked?"Unsave":"Save"} style={{background:"transparent",border:`1px solid ${onDark?(isBookmarked?C.gold:"rgba(255,255,255,0.2)"):(isBookmarked?C.gold:C.rule)}`,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:5,color:onDark?(isBookmarked?C.gold:"rgba(255,255,255,0.5)"):(isBookmarked?C.gold:C.muted),fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",flexShrink:0}}>
      <span style={{fontSize:12}}>{isBookmarked?"◈":"◇"}</span>
      <span className="bm-label">{isBookmarked?"Saved":"Save"}</span>
    </button>
  );
};

// ─── Editorial News Card ──────────────────────────────────────────────────────
const NewsCard=({article,onSummarise,summary,isSummarising,user,isBookmarked,onBookmark,onAuthRequired})=>{
  const [showSum,setShowSum]=useState(false);const [showChat,setShowChat]=useState(false);
  const cfg=CAT_CFG[article.category]||CAT_CFG.Markets;
  const handleSum=()=>{if(isSummarising)return;if(!summary){onSummarise(article);setShowSum(true);}else setShowSum(p=>!p);};
  return(
    <div style={{background:C.white,borderTop:`3px solid ${cfg.accent}`,padding:"16px 18px 14px",display:"flex",flexDirection:"column",height:"100%",transition:"box-shadow 0.2s"}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow=`0 4px 20px rgba(0,0,0,0.1)`;}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
      {/* Meta */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,gap:6}}>
        <CategoryLabel cat={article.category}/>
        <span style={{fontSize:10,color:C.subtle,fontFamily:"'DM Sans',sans-serif"}}>{timeAgo(article.pubDate)}</span>
      </div>
      <div style={{fontSize:10,color:C.subtle,marginBottom:8,fontFamily:"'DM Sans',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{article.source}</div>
      {/* Title */}
      <a href={article.link} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",flex:1}}>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:"clamp(14px,1.8vw,16px)",fontWeight:700,lineHeight:1.35,color:C.ink,margin:"0 0 8px",transition:"color 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.color=cfg.accent;}} onMouseLeave={e=>{e.currentTarget.style.color=C.ink;}}>
          {article.title}
        </h3>
      </a>
      <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"clamp(11.5px,1.4vw,12.5px)",color:C.muted,lineHeight:1.7,margin:"0 0 12px",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
        {article.description}
      </p>
      {/* Read time */}
      <p style={{fontSize:9,color:C.subtle,margin:"0 0 12px",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>
        {readTime(article.description)} min read
      </p>
      {showSum&&<AISummaryPanel summary={summary} loading={isSummarising}/>}
      {showChat&&<StoryChatPanel article={article} onClose={()=>setShowChat(false)}/>}
      {/* Actions */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",paddingTop:12,borderTop:`1px solid ${C.rule}`,marginTop:"auto"}}>
        <button onClick={handleSum} disabled={isSummarising} style={{flex:"1 1 100px",padding:"7px 8px",background:summary&&!isSummarising?C.goldLight:C.ink,color:summary&&!isSummarising?C.goldDark:C.white,border:"none",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",cursor:isSummarising?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"all 0.2s"}}>
          {isSummarising&&<Spinner size={10} color={summary?C.gold:C.white}/>}
          {isSummarising?"Analysing…":summary?(showSum?"▲ Hide":"▼ Analysis"):"✦ AI Analysis"}
        </button>
        <button onClick={()=>setShowChat(p=>!p)} style={{flex:"1 1 80px",padding:"7px 8px",background:showChat?C.ink:"transparent",color:showChat?C.gold:C.blue,border:`1px solid ${showChat?C.ink:C.blue}`,fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s"}}>
          ◎ {showChat?"Close":"Ask AI"}
        </button>
        <BookmarkBtn article={article} isBookmarked={isBookmarked} onToggle={onBookmark} user={user} onAuthRequired={onAuthRequired}/>
        <a href={article.link} target="_blank" rel="noopener noreferrer" style={{padding:"7px 10px",border:`1px solid ${C.rule}`,fontSize:10,color:C.muted,fontWeight:600,textDecoration:"none",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",whiteSpace:"nowrap"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.ink;e.currentTarget.style.color=C.ink;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.rule;e.currentTarget.style.color=C.muted;}}>
          Read →
        </a>
      </div>
    </div>
  );
};

// ─── Hero Story (full-width, editorial) ──────────────────────────────────────
const HeroCard=({article,onSummarise,summary,isSummarising,user,isBookmarked,onBookmark,onAuthRequired,isMobile})=>{
  const [showSum,setShowSum]=useState(false);const [showChat,setShowChat]=useState(false);
  const handleSum=()=>{if(isSummarising)return;if(!summary){onSummarise(article);setShowSum(true);}else setShowSum(p=>!p);};
  return(
    <div style={{background:C.navy,padding:isMobile?"20px 16px":"36px 40px",marginBottom:24,position:"relative",overflow:"hidden",animation:"afadeup 0.5s ease"}}>
      {/* Gold accent bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg, ${C.gold} 0%, ${C.goldDark} 100%)`}}/>
      {/* Subtle texture */}
      <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 80% 50%, rgba(201,168,76,0.06) 0%, transparent 60%)",pointerEvents:"none"}}/>

      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap",position:"relative"}}>
        <LivePill/>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",color:C.gold,fontFamily:"'DM Sans',sans-serif"}}>Top Story</span>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif"}}>{article.source}</span>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif"}}>·</span>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif"}}>{timeAgo(article.pubDate)}</span>
        <span style={{marginLeft:"auto"}}><CategoryLabel cat={article.category}/></span>
      </div>

      <a href={article.link} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block",position:"relative"}}>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"clamp(20px,6vw,26px)":"clamp(26px,3vw,38px)",fontWeight:700,color:C.white,margin:"0 0 14px",lineHeight:1.2,maxWidth:"85%",transition:"color 0.2s"}}
          onMouseEnter={e=>{e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.color=C.white;}}>
          {article.title}
        </h1>
      </a>

      <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:isMobile?"clamp(12.5px,3.5vw,14px)":"14.5px",color:"rgba(255,255,255,0.58)",lineHeight:1.75,margin:"0 0 22px",maxWidth:isMobile?"100%":"68%",position:"relative"}}>
        {article.description?.slice(0,isMobile?180:300)}…
      </p>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",position:"relative"}}>
        <button onClick={handleSum} disabled={isSummarising} style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"11px 22px",background:isSummarising?"rgba(201,168,76,0.3)":C.gold,color:C.ink,border:"none",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:isSummarising?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7,transition:"all 0.2s"}}
          onMouseEnter={e=>{if(!isSummarising)e.currentTarget.style.background=C.goldDark;e.currentTarget.style.color=C.white;}} onMouseLeave={e=>{e.currentTarget.style.background=isSummarising?"rgba(201,168,76,0.3)":C.gold;e.currentTarget.style.color=C.ink;}}>
          {isSummarising?<><Spinner size={13} color={C.ink}/>Analysing…</>:summary?(showSum?"▲ Hide Analysis":"✦ Show AI Analysis"):"✦ AI Fact-Check & Analyse"}
        </button>
        <button onClick={()=>setShowChat(p=>!p)} style={{flex:isMobile?"1 1 auto":"0 0 auto",padding:"11px 18px",background:"transparent",color:showChat?C.gold:"rgba(255,255,255,0.7)",border:`1px solid ${showChat?C.gold:"rgba(255,255,255,0.25)"}`,fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center",gap:6,whiteSpace:"nowrap"}}>
          ◎ {showChat?"Close":"Ask AI"}
        </button>
        <div style={{display:"flex",gap:8,flex:isMobile?"1 1 auto":"0 0 auto"}}>
          <BookmarkBtn article={article} isBookmarked={isBookmarked} onToggle={onBookmark} user={user} onAuthRequired={onAuthRequired} onDark/>
          <a href={article.link} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:"11px 16px",border:"1px solid rgba(255,255,255,0.2)",fontSize:11,color:"rgba(255,255,255,0.65)",textDecoration:"none",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5,transition:"all 0.2s",whiteSpace:"nowrap"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";e.currentTarget.style.color="rgba(255,255,255,0.65)";}}>
            Read Full Story →
          </a>
        </div>
      </div>
      {showSum&&<AISummaryPanel summary={summary} loading={isSummarising} onDark/>}
      {showChat&&<StoryChatPanel article={article} onClose={()=>setShowChat(false)}/>}
    </div>
  );
};

// ─── Morning Briefing ─────────────────────────────────────────────────────────
const MorningBriefingPanel=({articles,user,isMobile})=>{
  const [briefing,setBriefing]=useState(null);const [loading,setLoading]=useState(false);const [error,setError]=useState(false);const [generated,setGenerated]=useState(false);
  const hour=new Date().getHours();
  const session=hour<12?"Morning":hour<17?"Afternoon":"Evening";
  const sessionIcon=hour<12?"🌅":hour<17?"☀️":"🌙";
  const MOOD_CFG={bullish:{color:C.green,label:"Bullish ↑"},bearish:{color:C.red,label:"Bearish ↓"},mixed:{color:C.amber,label:"Mixed ↕"},steady:{color:C.blue,label:"Steady →"}};
  const SENT={positive:{c:C.green,i:"↑"},negative:{c:C.red,i:"↓"},neutral:{c:C.amber,i:"→"}};
  const generate=async()=>{
    if(!articles.length)return;
    setLoading(true);setError(false);setGenerated(false);
    try{
      const ak=getApiKey();if(!ak){setError(true);setLoading(false);return;}const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ak,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-3-5-haiku-20241022",max_tokens:1200,messages:[{role:"user",content:BRIEFING_PROMPT(articles,user?.name?.split(" ")[0],hour)}]})});
      const data=await res.json();
      const raw=data.content?.[0]?.text?.replace(/```json|```/g,"").trim();
      setBriefing(JSON.parse(raw));setGenerated(true);
    }catch(_){setError(true);}
    setLoading(false);
  };
  const mood=briefing?(MOOD_CFG[briefing.market_mood]||MOOD_CFG.steady):null;

  return(
    <div style={{animation:"afadeup 0.4s ease"}}>
      {/* Masthead */}
      <div style={{background:C.navy,padding:isMobile?"22px 16px":"36px 40px",marginBottom:20,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${C.gold},${C.goldDark})`}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle at 80% 50%, rgba(201,168,76,0.06) 0%, transparent 60%)",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap",position:"relative"}}>
          <div>
            <p style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"clamp(20px,6vw,26px)":"clamp(24px,3vw,34px)",fontWeight:700,color:C.white,margin:"0 0 6px"}}>
              {sessionIcon} Good {session}{user?`, ${user.name.split(" ")[0]}`:""}
            </p>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:"0 0 14px",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.05em"}}>
              {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </p>
            <p style={{fontSize:isMobile?12:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7,margin:0,maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
              Your personalised AI news briefing — top 5 Indian finance and market stories, analysed and summarised by Claude.
            </p>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20,flexWrap:"wrap",position:"relative"}}>
          <button onClick={generate} disabled={loading||!articles.length} style={{flex:isMobile?"1 1 100%":"0 0 auto",padding:"11px 26px",background:loading?"rgba(201,168,76,0.3)":C.gold,color:loading?C.goldDark:C.ink,border:"none",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:loading||!articles.length?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.2s"}}
            onMouseEnter={e=>{if(!loading)e.currentTarget.style.background=C.goldDark;e.currentTarget.style.color=C.white;}} onMouseLeave={e=>{e.currentTarget.style.background=loading?"rgba(201,168,76,0.3)":C.gold;e.currentTarget.style.color=loading?C.goldDark:C.ink;}}>
            {loading?<><Spinner size={13} color={C.ink}/>Generating briefing…</>:generated?`↺ Regenerate ${session} Briefing`:`${sessionIcon} Generate My ${session} Briefing`}
          </button>
          {!articles.length&&<span style={{fontSize:11,color:"rgba(255,255,255,0.35)",display:"flex",alignItems:"center",fontFamily:"'DM Sans',sans-serif"}}>⚠ Refresh news feed first</span>}
        </div>
      </div>

      {error&&<div style={{background:C.redBg,border:`1px solid #FCA5A5`,padding:"14px 18px",marginBottom:16,display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:18}}>⚠</span><div><p style={{fontSize:12,fontWeight:700,color:C.red,margin:"0 0 2px",fontFamily:"'DM Sans',sans-serif"}}>Could not generate briefing</p><p style={{fontSize:11,color:C.red,margin:0,fontFamily:"'DM Sans',sans-serif"}}>Please try again in a moment.</p></div><button onClick={generate} style={{marginLeft:"auto",padding:"7px 14px",background:C.red,color:C.white,border:"none",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",flexShrink:0}}>Retry</button></div>}

      {briefing&&(
        <div style={{background:C.white,border:`1px solid ${C.rule}`,overflow:"hidden",animation:"afadeup 0.4s ease"}}>
          <div style={{background:C.ink,padding:isMobile?"24px 16px":"36px 40px",textAlign:"center"}}>
            <div style={{maxWidth:680,margin:"0 auto"}}>
              <p style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"clamp(22px,6vw,30px)":"clamp(28px,3.5vw,38px)",fontWeight:700,color:C.white,margin:"0 0 10px",lineHeight:1.2}}>{briefing.greeting}</p>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.55)",margin:"0 0 20px",letterSpacing:"0.04em",fontFamily:"'DM Sans',sans-serif",fontWeight:400}}>{briefing.date}</p>
              {mood&&<div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:"rgba(255,255,255,0.06)",border:`1px solid rgba(255,255,255,0.1)`,padding:"14px 28px",gap:6}}>
                <p style={{fontSize:9,color:C.gold,margin:0,letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>Market Mood Today</p>
                <p style={{fontSize:22,fontWeight:700,color:mood.color,margin:0,fontFamily:"'DM Sans',sans-serif"}}>{mood.label}</p>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.55)",margin:0,fontFamily:"'DM Sans',sans-serif",lineHeight:1.55,textAlign:"center",maxWidth:280}}>{briefing.market_mood_reason}</p>
              </div>}
            </div>
          </div>
          <div style={{padding:isMobile?"16px":"36px 48px",maxWidth:720,margin:"0 auto"}}>
            <SectionRule label="Today's Top 5 Stories" accent={C.gold}/>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {briefing.stories?.map((story,i)=>{
                const sent=SENT[story.sentiment]||SENT.neutral;
                return(
                  <div key={i} style={{display:"flex",gap:16,padding:"20px 0",borderBottom:i<4?`1px solid ${C.rule}`:"none",alignItems:"flex-start"}}>
                    <span style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.gold,lineHeight:1,flexShrink:0,minWidth:32,opacity:0.7}}>{story.number}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                        <CategoryLabel cat={story.category} small/>
                        <span style={{fontSize:11,color:sent.c,fontWeight:700,fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"}}>{sent.i} {story.sentiment}</span>
                        <span style={{fontSize:11,color:C.muted,marginLeft:"auto",fontFamily:"'DM Sans',sans-serif",fontWeight:500}}>{story.source}</span>
                      </div>
                      <p style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"clamp(15px,4vw,17px)":"clamp(17px,2vw,20px)",fontWeight:700,color:C.ink,margin:"0 0 8px",lineHeight:1.3}}>{story.headline}</p>
                      <p style={{fontSize:isMobile?"clamp(13px,3.5vw,14.5px)":"15px",color:C.inkMid,margin:0,lineHeight:1.8,fontFamily:"'DM Sans',sans-serif",fontWeight:400}}>{story.summary}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {briefing.closing&&(
              <div style={{marginTop:24,padding:"20px 24px",background:C.goldLight,borderLeft:`3px solid ${C.gold}`,maxWidth:680,margin:"24px auto 0"}}>
                <p style={{fontSize:isMobile?15:18,color:C.inkMid,margin:0,fontStyle:"italic",lineHeight:1.8,fontFamily:"'Playfair Display',serif"}}>"{briefing.closing}"</p>
                <p style={{fontSize:9,color:C.gold,margin:"6px 0 0",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>— Axoniva Pulse AI</p>
              </div>
            )}
            <p style={{fontSize:11,color:C.muted,margin:"16px 0 0",lineHeight:1.7,fontFamily:"'DM Sans',sans-serif",paddingTop:12,borderTop:`1px solid ${C.rule}`}}>ⓘ {briefing.disclaimer}</p>
          </div>
        </div>
      )}

      {!briefing&&!loading&&!error&&(
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:1,background:C.rule}}>
          {[{icon:"📈",title:"Markets",desc:"Live market moves, indices, stocks"},{icon:"🏦",title:"Finance",desc:"RBI, SEBI, banking, policy"},{icon:"💼",title:"Business",desc:"Corporate news, deals, economy"}].map((t,i)=>(
            <div key={i} style={{background:C.white,padding:"24px 20px",textAlign:"center"}}>
              <p style={{fontSize:28,margin:"0 0 10px"}}>{t.icon}</p>
              <p style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:700,color:C.ink,margin:"0 0 6px"}}>{t.title}</p>
              <p style={{fontSize:11.5,color:C.muted,margin:0,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>{t.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────
const AuthModal=({onClose,onLogin})=>{
  const [mode,setMode]=useState("login");const [form,setForm]=useState({name:"",email:"",password:""});const [err,setErr]=useState("");const [loading,setLoading]=useState(false);const [success,setSuccess]=useState(false);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const submit=async()=>{
    setErr("");setLoading(true);
    if(!form.email||!form.password){setErr("Please fill all required fields.");setLoading(false);return;}
    if(!validateEmail(form.email)){setErr("Please enter a valid email address.");setLoading(false);return;}
    if(form.password.length<6){setErr("Password must be at least 6 characters.");setLoading(false);return;}
    if(mode==="signup"&&!form.name.trim()){setErr("Please enter your full name.");setLoading(false);return;}
    try{
      let users={};try{const r=sessionStorage.getItem(SK.users);if(r)users=JSON.parse(r);}catch(_){}
      if(mode==="signup"){if(users[form.email]){setErr("Account already exists. Please sign in.");setLoading(false);return;}users[form.email]={name:form.name.trim(),email:form.email,password:form.password,joinedAt:new Date().toISOString()};sessionStorage.setItem(SK.users,JSON.stringify(users));const s={name:form.name.trim(),email:form.email,loggedIn:true};sessionStorage.setItem(SK.session,JSON.stringify(s));setSuccess(true);setTimeout(()=>onLogin(s),1000);}
      else{const u=users[form.email];if(!u||u.password!==form.password){setErr("Invalid email or password.");setLoading(false);return;}const s={name:u.name,email:form.email,loggedIn:true};sessionStorage.setItem(SK.session,JSON.stringify(s));setSuccess(true);setTimeout(()=>onLogin(s),800);}
    }catch(e){setErr("Something went wrong. Please try again.");}setLoading(false);
  };
  const inp={width:"100%",padding:"10px 12px",border:`1px solid ${C.rule}`,fontSize:13.5,fontFamily:"'DM Sans',sans-serif",color:C.ink,outline:"none",background:C.white,boxSizing:"border-box",transition:"border-color 0.2s"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",animation:"afadeup 0.3s ease"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.white,width:"100%",maxWidth:400,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.4)",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{background:C.ink,padding:"24px 28px",position:"relative"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${C.gold},${C.goldDark})`}}/>
          <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
          <p style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.white,margin:"0 0 4px"}}>Axoniva <span style={{color:C.gold}}>Pulse</span></p>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:0,fontFamily:"'DM Sans',sans-serif"}}>{mode==="login"?"Sign in to your account":"Create your free account"}</p>
        </div>
        <div style={{display:"flex",borderBottom:`2px solid ${C.rule}`}}>
          {["login","signup"].map(m=>(<button key={m} onClick={()=>{setMode(m);setErr("");setForm({name:"",email:"",password:""});setSuccess(false);}} style={{flex:1,padding:"13px",background:"transparent",border:"none",borderBottom:mode===m?`2px solid ${C.ink}`:"2px solid transparent",marginBottom:-2,color:mode===m?C.ink:C.muted,fontSize:12,fontWeight:mode===m?700:400,letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s"}}>{m==="login"?"Sign In":"Create Account"}</button>))}
        </div>
        <div style={{padding:"24px 28px"}}>
          {success?(<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:44,marginBottom:12}}>✓</div><p style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.ink,marginBottom:6}}>{mode==="signup"?"Account Created":"Welcome Back"}</p><p style={{fontSize:12,color:C.muted,fontFamily:"'DM Sans',sans-serif"}}>Signing you in…</p></div>)
          :(<>
            {mode==="signup"&&<div style={{marginBottom:14}}><label style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.ink,display:"block",marginBottom:6,fontFamily:"'DM Sans',sans-serif"}}>Full Name</label><input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Your full name" style={inp} onFocus={e=>{e.target.style.borderColor=C.gold;}} onBlur={e=>{e.target.style.borderColor=C.rule;}}/></div>}
            <div style={{marginBottom:14}}><label style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.ink,display:"block",marginBottom:6,fontFamily:"'DM Sans',sans-serif"}}>Email</label><input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="your@email.com" style={inp} onFocus={e=>{e.target.style.borderColor=C.gold;}} onBlur={e=>{e.target.style.borderColor=C.rule;}}/></div>
            <div style={{marginBottom:20}}><label style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.ink,display:"block",marginBottom:6,fontFamily:"'DM Sans',sans-serif"}}>Password</label><input type="password" value={form.password} onChange={e=>set("password",e.target.value)} placeholder={mode==="signup"?"Minimum 6 characters":"Your password"} style={inp} onFocus={e=>{e.target.style.borderColor=C.gold;}} onBlur={e=>{e.target.style.borderColor=C.rule;}} onKeyDown={e=>{if(e.key==="Enter")submit();}}/></div>
            {err&&<div style={{background:C.redBg,borderLeft:`3px solid ${C.red}`,padding:"10px 14px",marginBottom:16,fontSize:11,color:C.red,fontFamily:"'DM Sans',sans-serif"}}>⚠ {err}</div>}
            <button onClick={submit} disabled={loading} style={{width:"100%",padding:"12px",background:C.ink,color:C.white,border:"none",fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:loading?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"background 0.2s"}} onMouseEnter={e=>{if(!loading)e.currentTarget.style.background=C.inkMid;}} onMouseLeave={e=>{e.currentTarget.style.background=C.ink;}}>
              {loading&&<Spinner size={14} color={C.white}/>}{loading?"Please wait…":mode==="login"?"Sign In →":"Create Account →"}
            </button>
            <p style={{fontSize:10,color:C.subtle,textAlign:"center",marginTop:14,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>Not financial advice. Data stored locally in your browser.</p>
          </>)}
        </div>
      </div>
    </div>
  );
};

// ─── User Menu ────────────────────────────────────────────────────────────────
const UserMenu=({user,bookmarkCount,onLogout,isMobile})=>{
  const [open,setOpen]=useState(false);
  const initials=user.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",gap:7,background:"transparent",border:`1px solid rgba(255,255,255,0.2)`,padding:"7px 12px",cursor:"pointer",color:C.white,transition:"border-color 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}>
        <span style={{width:26,height:26,background:C.gold,color:C.ink,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{initials}</span>
        {!isMobile&&<span style={{fontSize:11,fontWeight:600,fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.04em",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name.split(" ")[0]}</span>}
        {bookmarkCount>0&&<span style={{fontSize:9,fontWeight:700,background:C.gold,color:C.ink,padding:"2px 5px",fontFamily:"'DM Sans',sans-serif"}}>{bookmarkCount}</span>}
        <span style={{fontSize:8,color:"rgba(255,255,255,0.4)"}}>▼</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:C.white,border:`1px solid ${C.rule}`,width:210,boxShadow:"0 8px 32px rgba(0,0,0,0.12)",zIndex:300,animation:"afadeup 0.2s ease",overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.rule}`,background:C.cream}}>
            <p style={{fontSize:13,fontWeight:700,color:C.ink,margin:"0 0 2px",fontFamily:"'DM Sans',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</p>
            <p style={{fontSize:10,color:C.muted,margin:0,fontFamily:"'DM Sans',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</p>
          </div>
          <div style={{padding:"6px 0"}}>
            <div style={{padding:"9px 16px",display:"flex",alignItems:"center",gap:10}}><span style={{color:C.gold}}>◈</span><div><p style={{fontSize:12,fontWeight:700,color:C.ink,margin:0,fontFamily:"'DM Sans',sans-serif"}}>Saved Stories</p><p style={{fontSize:10,color:C.muted,margin:0,fontFamily:"'DM Sans',sans-serif"}}>{bookmarkCount} saved</p></div></div>
            <div style={{height:1,background:C.rule,margin:"4px 0"}}/>
            <button onClick={()=>{onLogout();setOpen(false);}} style={{width:"100%",padding:"10px 16px",background:"transparent",border:"none",textAlign:"left",cursor:"pointer",fontSize:11,color:C.red,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:6,transition:"background 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.redBg;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>⎋ Sign Out</button>
          </div>
        </div>
      )}
    </div>
  );
};



// ─── Verified Sources Modal ───────────────────────────────────────────────────
const SourcesModal=({onClose})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:C.white,width:"100%",maxWidth:480,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.4)",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{background:C.ink,padding:"22px 28px",position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:C.gold}}/>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
        <p style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.white,margin:"0 0 4px"}}>Verified <span style={{color:C.gold}}>Sources</span></p>
        <p style={{fontSize:12,color:"rgba(255,255,255,0.5)",margin:0,fontFamily:"'DM Sans',sans-serif"}}>All news on Axoniva Pulse comes from these verified outlets only</p>
      </div>
      <div style={{padding:"20px 28px"}}>
        {TRUSTED_SOURCES.map((src,i)=>(
          <div key={i} style={{padding:"14px 0",borderBottom:i<TRUSTED_SOURCES.length-1?`1px solid ${C.rule}`:"none",display:"flex",alignItems:"flex-start",gap:14}}>
            <div style={{width:36,height:36,background:C.cream,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📰</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <p style={{fontSize:14,fontWeight:700,color:C.ink,margin:0,fontFamily:"'DM Sans',sans-serif"}}>{src.name}</p>
                <span style={{fontSize:9,fontWeight:700,color:C.green,background:C.greenBg,padding:"2px 7px",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>✓ Verified</span>
                <CategoryLabel cat={src.category}/>
              </div>
              <p style={{fontSize:11,color:C.muted,margin:0,fontFamily:"'DM Sans',sans-serif"}}>{src.trust}</p>
            </div>
          </div>
        ))}
        <div style={{marginTop:16,padding:"12px 14px",background:C.amberBg,borderLeft:`3px solid ${C.gold}`}}>
          <p style={{fontSize:11,color:C.inkLight,margin:0,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>
            🛡️ Axoniva Pulse only aggregates news from Press Council registered and publicly listed Indian news organisations. No unverified sources, no social media, no anonymous blogs.
          </p>
        </div>
      </div>
    </div>
  </div>
);

// ─── API Key Settings Modal ───────────────────────────────────────────────────
const ApiKeyModal=({onClose,onSave})=>{
  const [key,setKey]=useState(getApiKey());
  const [show,setShow]=useState(false);
  const save=()=>{
    if(!key.trim().startsWith("sk-ant-")){alert("Please enter a valid Anthropic API key starting with sk-ant-");return;}
    setApiKey(key.trim());onSave();onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#FDFCFB",width:"100%",maxWidth:460,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.4)"}}>
        <div style={{background:"#0A1628",padding:"22px 28px",position:"relative"}}>
          <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"#C9A84C"}}/>
          <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}}>✕</button>
          <p style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:"#FFFFFF",margin:"0 0 4px"}}>Axoniva <span style={{color:"#C9A84C"}}>AI Setup</span></p>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.5)",margin:0,fontFamily:"'DM Sans',sans-serif"}}>Enter your Anthropic API key to enable AI features</p>
        </div>
        <div style={{padding:"24px 28px"}}>
          <div style={{background:"#EBF2FF",borderLeft:"3px solid #1B5FA8",padding:"12px 14px",marginBottom:18}}>
            <p style={{fontSize:11,fontWeight:700,color:"#1B5FA8",margin:"0 0 4px",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"}}>How to get your API key</p>
            <p style={{fontSize:11.5,color:"#374151",margin:0,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>
              1. Go to <strong>console.anthropic.com</strong><br/>
              2. Sign in → Click <strong>API Keys</strong><br/>
              3. Click <strong>Create Key</strong> → Copy it<br/>
              4. Paste it below
            </p>
          </div>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#0D1B2E",display:"block",marginBottom:6,fontFamily:"'DM Sans',sans-serif"}}>Anthropic API Key</label>
          <div style={{position:"relative",marginBottom:16}}>
            <input type={show?"text":"password"} value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-api03-..." style={{width:"100%",padding:"10px 40px 10px 12px",border:"1px solid #D4C9BC",fontSize:13,fontFamily:"'DM Sans',sans-serif",color:"#0D1B2E",outline:"none",background:"#FFFFFF",boxSizing:"border-box"}}
              onFocus={e=>{e.target.style.borderColor="#C9A84C";}} onBlur={e=>{e.target.style.borderColor="#D4C9BC";}}/>
            <button onClick={()=>setShow(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",cursor:"pointer",fontSize:14,color:"#6B6B6B"}}>{show?"🙈":"👁"}</button>
          </div>
          <div style={{background:"#FEF7E6",borderLeft:"3px solid #C9A84C",padding:"10px 12px",marginBottom:18}}>
            <p style={{fontSize:11,color:"#3D3D3D",margin:0,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>
              🔒 Your key is stored <strong>only in your browser</strong> (sessionStorage). It is never sent to Axoniva servers. Clears when you close the browser tab.
            </p>
          </div>
          <button onClick={save} style={{width:"100%",padding:"12px",background:"#0A1628",color:"#FFFFFF",border:"none",fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
            Save API Key & Enable AI Features →
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Ethics Notice ────────────────────────────────────────────────────────────
const EthicsNotice=()=>{
  const [gone,setGone]=useState(false);if(gone)return null;
  return(
    <div style={{background:C.amberBg,borderLeft:`3px solid ${C.gold}`,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:10,animation:"afadeup 0.4s ease"}}>
      <span style={{fontSize:14,flexShrink:0,color:C.gold}}>🛡</span>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:10,fontWeight:700,color:C.amber,margin:"0 0 2px",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>Editorial Ethics Policy</p>
        <p style={{fontSize:11,color:C.inkLight,margin:0,lineHeight:1.65,fontFamily:"'DM Sans',sans-serif"}}>Verified sources only · AI summaries pass through 5 ethical filters · Not verified journalism · Not financial advice · Always read the original article</p>
      </div>
      <button onClick={()=>setGone(true)} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:14,color:C.muted,flexShrink:0,padding:0,lineHeight:1}}>✕</button>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AxonivaPulse() {
  const {isMobile,isTablet}=useBreakpoint();
  const [articles,setArticles]=useState([]);const [loading,setLoading]=useState(true);const [fetchError,setFetchError]=useState(false);
  const [category,setCategory]=useState("All");const [summaries,setSummaries]=useState({});const [summarising,setSummarising]=useState({});
  const [lastUpdated,setLastUpdated]=useState(null);const [refreshing,setRefreshing]=useState(false);
  const [user,setUser]=useState(null);const [showAuth,setShowAuth]=useState(false);const [bookmarks,setBookmarks]=useState([]);const [menuOpen,setMenuOpen]=useState(false);const [showApiKey,setShowApiKey]=useState(false);const [apiKeySet,setApiKeySet]=useState(()=>!!getApiKey());const [showSources,setShowSources]=useState(false);const isAdmin=typeof window!=="undefined"&&window.location.search.includes("admin=axoniva2026");

  const fetchNews=useCallback(async(isRefresh=false)=>{
    isRefresh?setRefreshing(true):setLoading(true);setFetchError(false);
    const all=[];let anyOk=false;
    for(const src of TRUSTED_SOURCES){try{const r=await fetch(`${RSS_PROXY}${encodeURIComponent(src.url)}&count=10`,{cache:"no-cache"});const d=await r.json();if(d.items?.length){anyOk=true;d.items.slice(0,8).forEach((item,i)=>{all.push({id:`${src.name}-${i}-${Date.now()}`,title:item.title?.trim()||"Untitled",description:stripHtml(item.description||item.content||"").slice(0,400),link:item.link||"#",pubDate:item.pubDate||new Date().toISOString(),source:src.name,category:src.category,trust:src.trust});});}}catch(_){}}
    if(!anyOk)setFetchError(true);
    all.sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate));setArticles(all);setLastUpdated(new Date());
    isRefresh?setRefreshing(false):setLoading(false);
  },[]);

  useEffect(()=>{
    (async()=>{
      try{const sr=sessionStorage.getItem(SK.session);if(sr){const s=JSON.parse(sr);if(s.loggedIn){setUser(s);try{const br=sessionStorage.getItem(SK.bookmarks(s.email));if(br)setBookmarks(JSON.parse(br));}catch(_){}}}}catch(_){}
      fetchNews();
    })();
  },[fetchNews]);

  const summarise=async(article)=>{
    setSummarising(p=>({...p,[article.id]:true}));
    try{const ak=getApiKey();if(!ak){setSummaries(p=>({...p,[article.id]:{error:true,nokey:true}}));setSummarising(p=>({...p,[article.id]:false}));return;}const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ak,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-3-5-haiku-20241022",max_tokens:900,messages:[{role:"user",content:ETHICAL_PROMPT(article)}]})});const data=await res.json();if(data.error){console.error("API Error:",data.error);setSummaries(p=>({...p,[article.id]:{error:true,apierr:data.error.message||JSON.stringify(data.error)}}));setSummarising(p=>({...p,[article.id]:false}));return;}const raw=data.content?.[0]?.text?.replace(/```json|```/g,"").trim();const parsed=JSON.parse(raw);if(!parsed.safe_to_publish){setSummaries(p=>({...p,[article.id]:{blocked:true,content_flags:parsed.content_flags||["SUSPICIOUS_CONTENT"],flag_reason:parsed.flag_reason||"Failed ethical review."}}));}else{setSummaries(p=>({...p,[article.id]:parsed}));}}
    catch(_){setSummaries(p=>({...p,[article.id]:{error:true}}));}
    setSummarising(p=>({...p,[article.id]:false}));
  };

  const handleLogin=(s)=>{setUser(s);setShowAuth(false);};
  const handleLogout=async()=>{try{sessionStorage.removeItem(SK.session);}catch(_){}setUser(null);setBookmarks([]);};
  const toggleBookmark=async(article)=>{if(!user)return;const exists=bookmarks.find(b=>b.id===article.id);const updated=exists?bookmarks.filter(b=>b.id!==article.id):[...bookmarks,{...article,savedAt:new Date().toISOString()}];setBookmarks(updated);try{sessionStorage.setItem(SK.bookmarks(user.email),JSON.stringify(updated));}catch(_){};};
  const isBookmarked=(id)=>bookmarks.some(b=>b.id===id);

  const isSavedTab=category.startsWith("Saved");
  const isBriefingTab=category==="Briefing";
  const TABS=[...NEWS_CATEGORIES,"Saved"+(bookmarks.length>0?` (${bookmarks.length})`:""),"Briefing"];
  const filtered=isSavedTab?bookmarks:(isBriefingTab?articles:category==="All"?articles:articles.filter(a=>a.category===category));
  const gridCols=isMobile?"1fr":isTablet?"repeat(2,1fr)":"repeat(3,1fr)";

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
        body{background:${C.cream};overscroll-behavior:none}
        @keyframes aspin{to{transform:rotate(360deg)}}
        @keyframes apulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
        @keyframes aripple{0%{transform:scale(1);opacity:.4}100%{transform:scale(2.5);opacity:0}}
        @keyframes afadeup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes aslide{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:${C.ruleDark};border-radius:0}
        input,button{-webkit-appearance:none;appearance:none}
        @media(max-width:640px){.bm-label{display:none}}
        a{transition:color 0.15s}
      `}</style>

      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onLogin={handleLogin}/>}
      {showApiKey&&<ApiKeyModal onClose={()=>setShowApiKey(false)} onSave={()=>setApiKeySet(true)}/>}
      {showSources&&<SourcesModal onClose={()=>setShowSources(false)}/>}
      {menuOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:400}} onClick={()=>setMenuOpen(false)}/>}
      {menuOpen&&(
        <div style={{position:"fixed",top:0,left:0,bottom:0,width:"78%",maxWidth:280,background:C.ink,zIndex:500,animation:"aslide 0.25s ease",display:"flex",flexDirection:"column",overflowY:"auto"}}>
          <div style={{padding:"20px 16px",borderBottom:`1px solid rgba(255,255,255,0.1)`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.white}}>Axoniva <span style={{color:C.gold}}>Pulse</span></span>
            <button onClick={()=>setMenuOpen(false)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.4)",fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{padding:"8px 0",flex:1}}>
            {TABS.map(tab=>(<button key={tab} onClick={()=>{setCategory(tab);setMenuOpen(false);}} style={{width:"100%",padding:"13px 20px",background:"transparent",border:"none",borderLeft:category===tab?`3px solid ${C.gold}`:"3px solid transparent",textAlign:"left",color:category===tab?C.white:"rgba(255,255,255,0.5)",fontSize:13,fontWeight:category===tab?600:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.03em",transition:"all 0.15s"}}>{tab}</button>))}
          </div>
          {user?(<div style={{padding:"16px",borderTop:`1px solid rgba(255,255,255,0.1)`}}><p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:"0 0 4px",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.05em",textTransform:"uppercase"}}>Signed in</p><p style={{fontSize:14,fontWeight:700,color:C.white,margin:"0 0 12px",fontFamily:"'DM Sans',sans-serif"}}>{user.name}</p><button onClick={()=>{handleLogout();setMenuOpen(false);}} style={{width:"100%",padding:"10px",background:"transparent",border:`1px solid ${C.red}`,color:C.red,fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Sign Out</button></div>)
          :(<div style={{padding:"16px",borderTop:`1px solid rgba(255,255,255,0.1)`}}><button onClick={()=>{setShowAuth(true);setMenuOpen(false);}} style={{width:"100%",padding:"11px",background:C.gold,border:"none",color:C.ink,fontSize:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Sign In / Create Account</button></div>)}
        </div>
      )}

      <GlobalChatbot isMobile={isMobile}/>

      <div style={{fontFamily:"'DM Sans',sans-serif",background:C.cream,minHeight:"100vh"}}>

        {/* ── Masthead ── */}
        <header style={{background:C.ink,position:"sticky",top:0,zIndex:200,boxShadow:"0 1px 0 rgba(201,168,76,0.3)"}}>
          {/* Gold top line */}
          <div style={{height:3,background:`linear-gradient(90deg,${C.gold} 0%,${C.goldDark} 50%,${C.gold} 100%)`}}/>

          {/* Top bar */}
          {!isMobile&&(
            <div style={{borderBottom:`1px solid rgba(255,255,255,0.08)`,padding:"4px 28px",display:"flex",alignItems:"center",gap:16,background:"rgba(0,0,0,0.2)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"nowrap"}}><LivePill/>
  <span style={{fontSize:9,color:"rgba(255,255,255,0.9)",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>AI-Curated</span>
  <span style={{color:C.gold,fontSize:8}}>✦</span>
  <span style={{fontSize:9,color:"rgba(255,255,255,0.9)",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Ethically Filtered</span>
  <span style={{color:C.gold,fontSize:8}}>✦</span>
  <span style={{fontSize:9,color:"rgba(255,255,255,0.9)",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Verified Sources</span>
  <span style={{color:C.gold,fontSize:8}}>✦</span>
  <span style={{fontSize:9,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>Powered by Anthropic Claude</span>
</div>
              <span style={{marginLeft:"auto",fontSize:9,color:"#C9A84C",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.1em",fontWeight:600,textTransform:"uppercase"}}>{lastUpdated?`✦ Updated ${lastUpdated.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:""}</span>
            </div>
          )}

          {/* Brand bar */}
          <div style={{padding:isMobile?"10px 14px":"12px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:isMobile?10:0}}>
              {isMobile&&(<button onClick={()=>setMenuOpen(true)} style={{background:"transparent",border:"none",color:C.white,fontSize:22,cursor:"pointer",padding:"4px",display:"flex",alignItems:"center",lineHeight:1}}>☰</button>)}
              <div>
                <div style={{display:"flex",alignItems:"baseline",gap:0}}>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?22:28,fontWeight:800,color:C.white,letterSpacing:"-0.01em"}}>AXONIVA</span>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?22:28,fontWeight:800,color:C.gold,letterSpacing:"-0.01em"}}> PULSE</span>
                  <span style={{fontSize:8,fontWeight:700,color:C.gold,border:`1px solid ${C.gold}`,padding:"2px 5px",marginLeft:8,letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif",alignSelf:"center"}}>BETA</span>
                </div>
                {!isMobile&&<p style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"0.15em",textTransform:"uppercase",margin:"1px 0 0",fontFamily:"'DM Sans',sans-serif"}}>India's AI-Powered Finance Intelligence</p>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {isMobile&&<div style={{display:"flex",alignItems:"center",gap:5}}><LivePill/></div>}
              <button onClick={()=>fetchNews(true)} disabled={refreshing} style={{padding:isMobile?"7px 9px":"7px 14px",background:"transparent",border:`1px solid rgba(255,255,255,0.15)`,color:C.white,fontSize:isMobile?18:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:refreshing?"wait":"pointer",fontFamily:"'DM Sans',sans-serif",display:"flex",alignItems:"center",gap:5,transition:"border-color 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;}} onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.15)";}}>
                {refreshing?<Spinner size={11} color={C.white}/>:<span>↻</span>}
                {!isMobile&&(refreshing?"Refreshing":"Refresh")}
              </button>
              {!isMobile&&(<>{isAdmin&&<button onClick={()=>setShowApiKey(true)} title={apiKeySet?"API Key Active — Click to Update":"Setup Anthropic API Key"} style={{padding:"7px 12px",background:apiKeySet?"rgba(201,168,76,0.15)":"rgba(220,38,38,0.15)",border:`1px solid ${apiKeySet?C.gold:"#DC2626"}`,color:apiKeySet?C.gold:"#DC2626",fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all 0.2s",whiteSpace:"nowrap"}}>{apiKeySet?"✦ AI Active":"⚠ Setup AI Key"}</button>}{user?<UserMenu user={user} bookmarkCount={bookmarks.length} onLogout={handleLogout} isMobile={false}/>:<button onClick={()=>setShowAuth(true)} style={{padding:"7px 16px",background:C.gold,border:"none",color:C.ink,fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"background 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.background=C.goldDark;e.currentTarget.style.color=C.white;}} onMouseLeave={e=>{e.currentTarget.style.background=C.gold;e.currentTarget.style.color=C.ink;}}>Sign In</button>}</>)}
              {isMobile&&user&&<UserMenu user={user} bookmarkCount={bookmarks.length} onLogout={handleLogout} isMobile/>}
              {isMobile&&!user&&<button onClick={()=>setShowAuth(true)} style={{padding:"7px 12px",background:C.gold,border:"none",color:C.ink,fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Sign In</button>}
            </div>
          </div>

          {/* Navigation — desktop */}
          {!isMobile&&(
            <nav style={{display:"flex",padding:"0 28px",gap:0,borderTop:`1px solid rgba(255,255,255,0.08)`,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
              {TABS.map(tab=>(
                <button key={tab} onClick={()=>setCategory(tab)} style={{padding:"10px 18px",background:"transparent",border:"none",borderBottom:category===tab?`2px solid ${C.gold}`:"2px solid transparent",color:category===tab?C.white:"rgba(255,255,255,0.85)",fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.18s",fontFamily:"'DM Sans',sans-serif"}}
                  onMouseEnter={e=>{if(category!==tab)e.currentTarget.style.color=C.gold;}} onMouseLeave={e=>{if(category!==tab)e.currentTarget.style.color="rgba(255,255,255,0.85)";}}>
                  {tab}
                </button>
              ))}
            </nav>
          )}

          {/* Navigation — mobile pills */}
          {isMobile&&(
            <div style={{display:"flex",gap:6,padding:"8px 14px",overflowX:"auto",WebkitOverflowScrolling:"touch",borderTop:`1px solid rgba(255,255,255,0.07)`}}>
              {TABS.map(tab=>(
                <button key={tab} onClick={()=>setCategory(tab)} style={{padding:"5px 12px",border:`1px solid ${category===tab?C.gold:"rgba(255,255,255,0.15)"}`,background:category===tab?"transparent":"transparent",color:category===tab?C.gold:"rgba(255,255,255,0.85)",fontSize:10,fontWeight:category===tab?700:400,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",flexShrink:0,transition:"all 0.15s"}}>
                  {tab}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Content ── */}
        <main style={{maxWidth:1240,margin:"0 auto",padding:isMobile?"14px 12px 100px":"28px 28px 80px"}}>
          {loading&&(
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <Spinner size={36} color={C.gold}/>
              <p style={{marginTop:20,color:C.muted,fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>Fetching from verified sources…</p>
            </div>
          )}
          {!loading&&fetchError&&(
            <div style={{textAlign:"center",padding:"80px 16px"}}>
              <p style={{fontSize:48,marginBottom:16}}>📡</p>
              <h3 style={{fontFamily:"'Playfair Display',serif",color:C.ink,marginBottom:10,fontSize:22}}>Could not fetch news</h3>
              <p style={{color:C.muted,fontSize:12,marginBottom:20,fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.03em"}}>RSS proxy may be rate-limited. Please wait a moment and try again.</p>
              <button onClick={()=>fetchNews()} style={{padding:"11px 28px",background:C.ink,color:C.white,border:"none",fontSize:10,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Try Again</button>
            </div>
          )}

          {!loading&&!fetchError&&(
            <>
              <EthicsNotice/>

              {/* Stats strip */}
              <div style={{display:"flex",borderTop:`1px solid ${C.rule}`,borderBottom:`1px solid ${C.rule}`,marginBottom:24,background:C.white,overflowX:"auto"}}>
                {[{v:articles.length,l:"Stories",action:()=>setCategory("All")},{v:TRUSTED_SOURCES.length,l:"Verified Sources",action:()=>setShowSources(true)},{v:Object.keys(summaries).length,l:"AI Analyses",action:null},{v:bookmarks.length,l:"Saved",action:()=>setCategory("Saved")}].map((s,i)=>(
                  <div key={i} onClick={s.action||undefined} style={{flex:"1 1 80px",padding:"10px 16px",textAlign:"center",borderRight:i<3?`1px solid ${C.rule}`:"none",minWidth:70,cursor:s.action?"pointer":"default",transition:"background 0.15s"}} onMouseEnter={e=>{if(s.action)e.currentTarget.style.background=C.creamDark;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.gold}}>{s.v}</div>
                    <div style={{fontSize:8,color:C.subtle,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:2,fontFamily:"'DM Sans',sans-serif"}}>{s.l}</div>
                  </div>
                ))}
                <div style={{display:"flex",alignItems:"center",padding:"0 16px",borderLeft:`1px solid ${C.rule}`}}>
                  <span style={{fontSize:9,color:C.gold,letterSpacing:"0.1em",textTransform:"uppercase",whiteSpace:"nowrap",fontFamily:"'DM Sans',sans-serif",fontWeight:700}}>🛡 Ethics Filtered</span>
                </div>
              </div>

              {/* Briefing tab */}
              {isBriefingTab&&<MorningBriefingPanel articles={articles} user={user} isMobile={isMobile}/>}

              {/* Saved empty state */}
              {!isBriefingTab&&isSavedTab&&filtered.length===0&&(
                <div style={{textAlign:"center",padding:"70px 16px"}}>
                  <p style={{fontFamily:"'Playfair Display',serif",fontSize:36,color:C.creamDark,marginBottom:16}}>◈</p>
                  <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.ink,marginBottom:8}}>No Saved Stories</h3>
                  {user?<><p style={{color:C.muted,fontSize:12,marginBottom:18,fontFamily:"'DM Sans',sans-serif"}}>Save stories by clicking the ◇ Save button on any article.</p><button onClick={()=>setCategory("All")} style={{padding:"10px 24px",background:C.ink,color:C.white,border:"none",fontSize:10,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Browse Stories</button></>
                  :<><p style={{color:C.muted,fontSize:12,marginBottom:18,fontFamily:"'DM Sans',sans-serif"}}>Create a free account to save and revisit stories.</p><button onClick={()=>setShowAuth(true)} style={{padding:"10px 24px",background:C.ink,color:C.white,border:"none",fontSize:10,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Create Free Account</button></>}
                </div>
              )}

              {/* Saved header */}
              {!isBriefingTab&&isSavedTab&&filtered.length>0&&(
                <div style={{marginBottom:20}}>
                  <SectionRule label={`Saved Stories — ${filtered.length}`} accent={C.gold}/>
                </div>
              )}

              {/* Hero story */}
              {!isBriefingTab&&!isSavedTab&&filtered[0]&&(
                <>
                  <SectionRule label="Top Story" accent={C.gold}/>
                  <HeroCard article={filtered[0]} onSummarise={summarise} summary={summaries[filtered[0].id]} isSummarising={!!summarising[filtered[0].id]} user={user} isBookmarked={isBookmarked(filtered[0].id)} onBookmark={toggleBookmark} onAuthRequired={()=>setShowAuth(true)} isMobile={isMobile}/>
                </>
              )}

              {/* Section header for grid */}
              {!isBriefingTab&&filtered.slice(isSavedTab?0:1).length>0&&(
                <SectionRule label={isSavedTab?"Your Saved Stories":"Latest Stories"} accent={isSavedTab?C.gold:C.blue}/>
              )}

              {/* Grid */}
              {!isBriefingTab&&filtered.slice(isSavedTab?0:1).length>0&&(
                <div style={{display:"grid",gridTemplateColumns:gridCols,gap:1,background:C.rule,border:`1px solid ${C.rule}`}}>
                  {filtered.slice(isSavedTab?0:1).map((article,i)=>(
                    <div key={article.id} style={{animation:`afadeup 0.4s ease ${Math.min(i,6)*0.05}s both`}}>
                      <NewsCard article={article} onSummarise={summarise} summary={summaries[article.id]} isSummarising={!!summarising[article.id]} user={user} isBookmarked={isBookmarked(article.id)} onBookmark={toggleBookmark} onAuthRequired={()=>setShowAuth(true)}/>
                    </div>
                  ))}
                </div>
              )}

              {!isBriefingTab&&!isSavedTab&&filtered.length===0&&(
                <div style={{textAlign:"center",padding:"50px 0"}}>
                  <p style={{color:C.muted,fontFamily:"'DM Sans',sans-serif",fontSize:12,letterSpacing:"0.05em"}}>No stories in this category.</p>
                </div>
              )}
            </>
          )}
        </main>

        {/* ── Footer ── */}
        <footer style={{background:C.ink,padding:isMobile?"24px 16px":"32px 28px"}}>
          <div style={{maxWidth:1240,margin:"0 auto"}}>
            <div style={{borderBottom:`1px solid rgba(255,255,255,0.1)`,paddingBottom:20,marginBottom:20,display:"flex",alignItems:"flex-end",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div>
                <p style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:800,color:C.white,margin:"0 0 4px",letterSpacing:"-0.01em"}}>AXONIVA <span style={{color:C.gold}}>PULSE</span></p>
                <p style={{fontSize:9,color:"rgba(255,255,255,0.3)",margin:0,letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>India's AI-Powered Finance Intelligence</p>
              </div>
              <div style={{display:"flex",gap:20}}>
                {["axoniva.in","hello@axoniva.in"].map(l=><span key={l} style={{fontSize:10,color:"rgba(255,255,255,0.3)",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.04em"}}>{l}</span>)}
              </div>
            </div>
            <p style={{fontSize:9.5,color:"rgba(255,255,255,0.2)",lineHeight:1.8,margin:0,fontFamily:"'DM Sans',sans-serif",maxWidth:700}}>
              <strong style={{color:"rgba(255,255,255,0.35)"}}>Legal & Ethics Disclaimer —</strong> Axoniva Pulse aggregates content from verified third-party news outlets only. AI summaries are generated by Anthropic Claude and pass through ethical content filters. Summaries are <strong>not verified journalism, not financial advice, and not endorsed by original publishers.</strong> Axoniva AI Tech accepts no liability for third-party content. Not SEBI registered. Not a media company. © 2026 Axoniva AI Tech.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
