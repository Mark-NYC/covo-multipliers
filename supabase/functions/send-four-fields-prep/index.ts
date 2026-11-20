// Four Fields Intensive (December 2026) participant preparation emails.
// Run by pg_cron at 9 AM America/New_York on Nov 23, 25, 27.
// Transactional messages for registered participants only, not a marketing list.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVENT_SLUG = "four-fields-intensive-december-2026";
const PREP_URL = "https://www.covomultipliers.com/four-fields-preparation";
const JOIN_LABEL = "Four Fields preparation page";
const SCHEDULE: Record<string, "intro" | "discovery" | "bring_notes"> = {
  "2026-11-23": "intro",
  "2026-11-25": "discovery",
  "2026-11-27": "bring_notes",
};
type Key = "intro" | "discovery" | "bring_notes";
const CONTACT = "CoVo Multipliers";
const link = (label: string) => `<a style="display:inline-block;padding:13px 18px;background:#1b4d3e;color:white;text-decoration:none;font-weight:700;border-radius:5px;" href="${PREP_URL}">${label}</a>`;
const esc = (s:string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));
function body(key:Key, firstName:string) {
 const hi = `<p>Hi ${esc(firstName)},</p>`;
 let subject = "", content = "";
 if(key==="intro") {
  subject="Before we meet: Your Four Fields preparation";
  content=`<p>We're looking forward to being together for the <strong>Four Fields Intensive, December 4–6.</strong></p>
<p>This won't simply be a training where you listen and take notes. We're going to discover together how Jesus made disciples, gathered believers, and developed leaders, and what those patterns mean for us today.</p>
<p><strong>We'd like you to do three things before we meet:</strong></p>
<ol><li>Watch the short Four Fields overview video.</li><li>Read Mark chapters 1–4.</li><li>Work through the Four Fields Discovery Worksheet as you read.</li></ol>
<p>We've put everything you need in one place:</p><p>${link("START YOUR PREPARATION")}</p>
<p>Don't worry about getting the right answers. Pay attention to what the Scriptures actually say. Look for specific actions, people, places, and patterns.</p>
<p>We'll work through what you've discovered together during the Intensive.</p><p>Looking forward to it!</p>`;
 } else if(key==="discovery") {
  subject="As you read Mark 1–4, look for these patterns";
  content=`<p>As you prepare for the Four Fields Intensive, I want to encourage you to read Mark 1–4 with a particular question in mind:</p>
<p><strong>What do we see Jesus actually doing to make disciples and develop leaders?</strong></p>
<p>The Four Fields framework gives us five areas to pay attention to:</p>
<ul><li><strong>Entry:</strong> How does Jesus enter new places and engage people?</li>
<li><strong>Gospel:</strong> What does Jesus proclaim, and how does he communicate the good news?</li>
<li><strong>Discipleship:</strong> How does Jesus call and equip people to follow and obey him?</li>
<li><strong>Church:</strong> What do we observe about gathering people and building community?</li>
<li><strong>Leaders:</strong> How does Jesus identify, invest in, and entrust responsibility to others?</li></ul>
<p>Also pay attention to prayer, the Holy Spirit, kingdom conflict, and the spread of the gospel.</p>
<p>Here's my encouragement: <strong>Don't read your existing ministry methods back into the text.</strong> Let the Scriptures speak for themselves.</p>
<p>Write down what you discover, including the verses where you found it. If the text doesn't address one of the questions, that's fine too.</p>
<p>${link("OPEN THE DISCOVERY WORKSHEET AND PREPARATION PAGE")}</p><p>I'm excited to see what we discover together.</p>`;
 } else {
  subject="One week until Four Fields: Bring your discoveries";
  content=`<p>We're one week away from the Four Fields Intensive!</p>
<p>By now, I hope you've had a chance to watch the Four Fields overview and begin reading Mark 1–4.</p>
<p>Here's what I'd love for you to bring into our time together:</p><p><strong>Your discoveries from Scripture.</strong></p>
<p>What surprised you? What patterns did you notice? What did Jesus do that you don't often see practiced in disciple-making today?</p>
<p>Bring your completed or partially completed worksheet, along with your Bible and any notes you've taken.</p>
<p>If you haven't started yet, there's still time.</p>
<p>${link("COMPLETE YOUR PREPARATION HERE")}</p>
<p>One important thing: <strong>We're not expecting you to master the Four Fields before we meet.</strong> We're asking you to come ready to discover, discuss, and practice.</p>
<p>This Intensive is designed to move us beyond knowing about disciple-making toward actually doing what Jesus modeled.</p><p>See you December 4–6!</p>`;
 }
 return {subject,html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#222"><div style="max-width:590px;margin:auto;background:#fff;border-radius:8px;overflow:hidden"><div style="background:#1b4d3e;color:#fff;padding:26px"><div style="font-size:12px;letter-spacing:1px">COVO MULTIPLIERS TRAINING</div><h1 style="font-size:22px;margin:10px 0 0">${esc(subject)}</h1></div><div style="padding:26px;font-size:15px;line-height:1.7">${hi}${content}<p>Mark<br>${CONTACT}</p><p style="font-size:12px;color:#666">You received this email because you registered for the December 4–6 Four Fields Intensive.</p></div></div></body></html>`};
}
function reply(code:number,data:unknown) {return new Response(JSON.stringify(data),{status:code,headers:{"content-type":"application/json"}});}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 const admin=Deno.env.get("REMINDER_ADMIN_SECRET");
 if(!admin || req.headers.get("x-admin-secret")!==admin)return reply(401,{error:"Unauthorized"});
 const now=new Date();
 const estDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const key=SCHEDULE[estDate];
 if(!key)return reply(200,{status:"not_scheduled",date:estDate});
 // Keep the sending window to 9:00–9:59 AM ET. Cron retries every 5m.
 const estHour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",hourCycle:"h23"}).format(now));
 if(estHour!==9)return reply(200,{status:"outside_window",date:estDate});
 const dryRun=new URL(req.url).searchParams.get("dry_run")==="true";
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data:event,error:eventErr}=await supabase.from("events").select("id,title,is_published").eq("slug",EVENT_SLUG).single();
 if(eventErr||!event?.is_published)return reply(500,{error:"Event is missing or unpublished"});
 const {data:registrations,error:regErr}=await supabase.from("registrations").select("id,name,email").eq("event_id",event.id).eq("registration_status","active");
 if(regErr)return reply(500,{error:"Could not read event registrations"});
 const {data:existing,error:existingErr}=await supabase.from("intensive_prep_email_deliveries").select("registration_id,status,claimed_at").eq("email_key",key);
 if(existingErr)return reply(500,{error:"Could not read delivery receipts"});
 const receipts=new Map((existing||[]).map((x:any)=>[x.registration_id,x]));
 const candidates=(registrations||[]).filter((x:any)=>!receipts.get(x.id)||receipts.get(x.id)?.status==="failed"||(receipts.get(x.id)?.status==="pending"&&Date.now()-Date.parse(receipts.get(x.id).claimed_at)>30*60*1000));
 if(dryRun)return reply(200,{dry_run:true,date:estDate,key,active:registrations?.length??0,eligible:candidates.length});
 const apiKey=Deno.env.get("RESEND_API_KEY");
 if(!apiKey)return reply(500,{error:"RESEND_API_KEY is missing"});
 const from=Deno.env.get("RESEND_FROM_EMAIL")||"labs@covomultipliers.com";
 let sent=0,failed=0,skipped=0;
 for(const reg of candidates){
  // Insert only if no receipt, otherwise conditional claim expired/failed receipts.
  const old=receipts.get(reg.id);
  if(!old){
   const {error:e}=await supabase.from("intensive_prep_email_deliveries").insert({registration_id:reg.id,email_key:key,status:"pending",claimed_at:new Date().toISOString()});
   if(e){skipped++;continue;}
  } else {
   const {data:claim,error:e}=await supabase.from("intensive_prep_email_deliveries").update({status:"pending",claimed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("registration_id",reg.id).eq("email_key",key).eq("status",old.status).eq("claimed_at",old.claimed_at).select("registration_id");
   if(e||!claim?.length){skipped++;continue;}
  }
  const first=(reg.name||"there").trim().split(/\s+/)[0]||"there";
  const message=body(key,first);
  try {
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:`CoVo Multipliers <${from}>`,to:[reg.email],subject:message.subject,html:message.html,idempotency_key:`four-fields-prep-${key}-${reg.id}`})});
   const result=await response.json().catch(()=>({})) as {id?:string;message?:string};
   if(!response.ok||!result.id)throw new Error(`Resend HTTP ${response.status}: ${String(result.message||"missing message ID").slice(0,160)}`);
   await supabase.from("intensive_prep_email_deliveries").update({status:"sent",resend_id:result.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).eq("registration_id",reg.id).eq("email_key",key);
   sent++;
  }catch(e){
   await supabase.from("intensive_prep_email_deliveries").update({status:"failed",last_error:String(e).slice(0,300),updated_at:new Date().toISOString()}).eq("registration_id",reg.id).eq("email_key",key);
   failed++;
  }
 }
 return reply(200,{date:estDate,key,active:registrations?.length??0,eligible:candidates.length,sent,failed,skipped});
});
