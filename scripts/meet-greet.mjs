#!/usr/bin/env node
/** Node 22+. Run from the repository root. All publication is explicit. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createHmac} from 'node:crypto';
import {validateData,validateSnapshot,predict,time} from '../meet-greet/core.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
export async function atomicJSON(file,data,mode=0o644) {
  const temp=`${file}.${process.pid}.tmp`;
  try {await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n',{mode});await fs.rename(temp,file);}
  finally {await fs.rm(temp,{force:true});}
}
/** All writers share this lock and reject changes made since their input was read. */
export async function publish(file,data,expectedHash) {
  const lock=`${file}.lock`,handle=await fs.open(lock,'wx',0o600);
  try {
    if(sha(JSON.stringify(await read(file)))!==expectedHash)throw new Error('Publication conflict; reload current data before retrying');
    await atomicJSON(file,data);
  } finally {await handle.close();await fs.rm(lock,{force:true});}
}
/** Conservative text-only extraction. Unknown formats go to a private review queue. */
export function parsePost(post,release,roundNumber,salt) {
  const reject=reason=>({accepted:false,postId:post.id,reason});
  if(!post.id || !post.author_id || !post.created_at)return reject('missing_metadata');
  const text=String(post.note_post?.text||post.text||'').normalize('NFKC');
  if((post.referenced_posts||post.referenced_tweets||[]).length)return reject('reference_or_reply');
  if(/[?？]|予想|らしい|だそう|友達|友人|代理|転載|かも|じゃな|ではな|だったら|仮に|例えば/.test(text))return reject('ambiguous_claim');
  if(!release.xTerms?.some(term=>text.includes(term)))return reject('release_not_explicit');
  const releaseNumbers=[...text.matchAll(/\d+(?:st|nd|rd|th)/gi)].map(x=>x[0]);
  if(new Set(releaseNumbers).size>1)return reject('multiple_releases');
  if(release.eventType==='real'?!/リアル/.test(text):!/オンライン/.test(text)||/リアル/.test(text))return reject('format_not_explicit');
  const rounds=[...text.matchAll(/第?(\d+)次/g)].map(x=>Number(x[1]));
  if(!rounds.length||rounds.some(n=>n!==roundNumber))return reject('round_not_explicit');
  const members=release.members.filter(m=>text.replace(/\s/g,'').includes(m.name.replace(/\s/g,'')));
  if(members.length!==1)return reject('member_ambiguous');
  const dates=[...text.matchAll(/(?<!\d)(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})(?!\d)/g)];
  const sessions=[...text.matchAll(/第?(\d+)部/g)].map(x=>Number(x[1]));
  if(dates.length!==1||sessions.length!==1)return reject('date_session_ambiguous');
  const [,year,month,day]=dates[0];
  const slots=release.slots.filter(s=>s.memberId===members[0].id&&s.session===sessions[0]&&Number(s.date.slice(5,7))===Number(month)&&Number(s.date.slice(8))===Number(day)&&(!year||Number(s.date.slice(0,4))===Number(year))&&s.firstRound<=roundNumber);
  if(slots.length!==1)return reject('slot_ambiguous');
  // Require labelled round totals; never reinterpret 3/15, screenshots or per-order counts.
  const applications=[...text.matchAll(/応募合計\s*[:：]?\s*(\d+)\s*枚/g)];
  const wins=[...text.matchAll(/当選(?:合計)?\s*[:：]?\s*(\d+)\s*枚/g)];
  if(applications.length!==1||wins.length!==1)return reject('labelled_totals_required');
  const applied=Number(applications[0][1]),won=Number(wins[0][1]);
  if(!Number.isSafeInteger(applied)||!Number.isSafeInteger(won)||applied<1||won>applied)return reject('invalid_counts');
  const round=release.rounds.find(r=>r.number===roundNumber),next=release.rounds.find(r=>r.number===roundNumber+1);
  let posted;try{posted=time(post.created_at);}catch{return reject('invalid_time');}
  if(!round||posted<time(round.resultsAt)||(next&&posted>=time(next.opensAt)))return reject('outside_results_window');
  return {releaseId:release.id,slotId:slots[0].id,round:roundNumber,postId:String(post.id),
    authorKey:createHmac('sha256',salt).update(String(post.author_id)).digest('hex'),
    postedAt:post.created_at,accepted:true,basis:'round_total',applied,won,parser:'strict-labelled-text-v1'};
}
export function importSnapshot(data,releaseId,input,evidence,now=Date.now()) {
  const result=structuredClone(data),release=result.releases.find(r=>r.id===releaseId);
  if(!release)throw new Error('Unknown release');
  if(input.reviewed!==true)throw new Error('Official slot mapping must be reviewed before import');
  const snapshot={...input,sourceHash:sha(evidence)};
  validateSnapshot(release,snapshot,now);
  const existing=release.officialSnapshots.find(s=>s.id===snapshot.id);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(snapshot))throw new Error('Immutable snapshot ID conflict; add a correction with a new ID');return result;}
  release.officialSnapshots.push(snapshot);result.generatedAt=new Date(now).toISOString();
  return validateData(result,now);
}
export async function collectX(dataFile,releaseId,roundNumber,privateDir,maxPages=2,fetchImpl=fetch) {
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10)throw new Error('maxPages must be 1..10');
  const data=validateData(await read(dataFile)),release=data.releases.find(r=>r.id===releaseId);
  if(!release)throw new Error('Unknown release');
  const baseline=sha(JSON.stringify(data));
  const round=release.rounds.find(r=>r.number===roundNumber),next=release.rounds.find(r=>r.number===roundNumber+1);
  const end=next?.opensAt||release.collectionEndsAt||(release.slots.length?[...release.slots].map(s=>s.date).sort().at(-1)+'T23:59:59+09:00':null);
  const now=Date.now();
  if(!round||!end||now<time(round.resultsAt)||now>=time(end))return {skipped:'outside_results_window'};
  const token=process.env.X_BEARER_TOKEN,salt=process.env.MEET_GREET_AUTHOR_SALT;
  if(!token||!salt||salt.length<32)throw new Error('Server-side X_BEARER_TOKEN and a 32+ character MEET_GREET_AUTHOR_SALT are required');
  if(!release.xTerms?.length||release.xTerms.some(x=>typeof x!=='string'||!x.trim()||/["\n\r]/.test(x)))throw new Error('Explicit, quoted-safe release xTerms are required');
  await fs.mkdir(privateDir,{recursive:true,mode:0o700});
  const real=await fs.realpath(privateDir),relative=path.relative(ROOT,real);
  if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new Error('privateDir must be outside the published repository');
  const lock=path.join(real,'collector.lock');
  const handle=await fs.open(lock,'wx',0o600).catch(()=>{throw new Error('Collector lock exists; do not run concurrent writers');});
  try {
    const stateFile=path.join(real,`${sha(release.id+':'+roundNumber)}.json`);
    let state;try{state=await read(stateFile);}catch(e){if(e.code!=='ENOENT')throw e;state={reports:[],review:[],lastRun:0,completedEnd:null,pending:null};}
    if(now-state.lastRun<15*60*1000)return {skipped:'cooldown'};
    // The recent endpoint cannot backfill gaps older than seven days. Do not silently truncate.
    const start=state.completedEnd||round.resultsAt;
    if(time(state.pending?.start||start)<now-7*86400000+1000)throw new Error('Search coverage gap exceeds recent-search retention; backfill separately before advancing');
    if(!state.pending)state.pending={start,end:new Date(now-30000).toISOString(),nextToken:null};
    if(time(state.pending.start)>=time(state.pending.end))return {skipped:'empty_window'};
    let pages=0;
    while(pages<maxPages) {
      const q=`(${release.xTerms.map(t=>`"${t}"`).join(' OR ')}) (ミーグリ OR ミートグリート) (当落 OR 当選 OR 落選 OR 全落 OR 全当) lang:ja -is:retweet`;
      if(q.length>512)throw new Error('Search query exceeds conservative 512-character limit');
      const params=new URLSearchParams({query:q,max_results:'100',start_time:state.pending.start,end_time:state.pending.end,sort_order:'recency'});
      // Defaults match X documentation checked 2026-09-24; legacy is an explicit deployment option.
      if(process.env.X_API_SCHEMA==='legacy')params.set('tweet.fields','id,text,author_id,created_at,referenced_tweets');
      else {params.set('post.fields','id,text,created_at');params.set('expansions','author_id,referenced_posts');}
      if(state.pending.nextToken)params.set('next_token',state.pending.nextToken);
      const response=await fetchImpl(`https://api.x.com/2/tweets/search/recent?${params}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000),redirect:'error'});
      if(!response.ok)throw new Error(`X search HTTP ${response.status}; cursor and published predictions retained`);
      const body=await response.json();
      if(body.errors?.length||(!Array.isArray(body.data)&&body.meta?.result_count!==0))throw new Error('Incomplete X response; cursor retained');
      for(const post of body.data||[]) {
        const report=parsePost(post,release,roundNumber,salt);
        if(report.accepted){state.reports=state.reports.filter(r=>r.postId!==report.postId);state.reports.push(report);}
        else if(!state.review.some(r=>r.postId===post.id))state.review.push({postId:post.id,reason:report.reason,postedAt:post.created_at||new Date(now).toISOString(),url:`https://x.com/i/status/${post.id}`});
      }
      pages++;state.lastRun=now;
      const nextToken=body.meta?.next_token;
      if(nextToken)state.pending.nextToken=nextToken;
      else {state.completedEnd=state.pending.end;state.pending=null;}
      // Private files contain no post text; review via the original X URL. TTL bounds metadata retention.
      state.review=state.review.filter(r=>Date.parse(r.postedAt)>now-30*86400000);
      state.reports=state.reports.filter(r=>Date.parse(r.postedAt)>now-30*86400000);
      await atomicJSON(stateFile,state,0o600);
      if(!state.pending)break;
    }
    if(state.pending)return {pages,pending:true,published:false};
    const finished=Date.now();
    if(finished>=time(end))return {pages,published:false,skipped:'results_window_closed_during_search'};
    const prediction=predict(release,state.reports,roundNumber,new Date(finished).toISOString());
    release.predictions.push(prediction);data.generatedAt=prediction.generatedAt;
    validateData(data,finished);await publish(dataFile,data,baseline);
    return {pages,published:true,accepted:state.reports.length,review:state.review.length};
  } finally {await handle.close();await fs.rm(lock,{force:true});}
}
async function main(args) {
  const [command,dataFile,releaseId,arg4,arg5,arg6]=args;
  if(!dataFile)throw new Error('Usage: validate DATA | import-official DATA RELEASE SNAPSHOT SOURCE_FILE | predict DATA RELEASE ROUND REPORTS | collect-x DATA RELEASE ROUND PRIVATE_DIR [MAX_PAGES] | sync-x DATA PRIVATE_DIR [MAX_PAGES]');
  if(command==='validate'){validateData(await read(dataFile));return {valid:true};}
  if(command==='sync-x'){
    const data=validateData(await read(dataFile)),results=[];
    for(const r of data.releases)for(const round of r.rounds){
      try{results.push({releaseId:r.id,round:round.number,...await collectX(dataFile,r.id,round.number,releaseId,arg4?Number(arg4):2)});}
      catch(error){results.push({releaseId:r.id,round:round.number,error:error.message});process.exitCode=1;}
    }
    return {results};
  }
  if(command==='import-official'){
    const data=await read(dataFile),snapshot=await read(arg4),evidence=await fs.readFile(arg5);
    const updated=importSnapshot(data,releaseId,snapshot,evidence);await publish(dataFile,updated,sha(JSON.stringify(data)));return {imported:snapshot.id};
  }
  if(command==='predict'){
    const data=validateData(await read(dataFile)),release=data.releases.find(r=>r.id===releaseId);
    if(!release)throw new Error('Unknown release');
    const baseline=sha(JSON.stringify(data));
    const p=predict(release,await read(arg5),Number(arg4),new Date().toISOString());
    release.predictions.push(p);data.generatedAt=p.generatedAt;validateData(data);await publish(dataFile,data,baseline);return {predicted:p.cells.length};
  }
  if(command==='collect-x')return collectX(dataFile,releaseId,Number(arg4),arg5,arg6?Number(arg6):2);
  throw new Error('Unknown command');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
