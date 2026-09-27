/** Synthetic fixtures only. Never merge these into the production data feed. */
import {predict} from './core.mjs';
export function createDemo() {
  const make = (id,month,days,label) => {
    const date = day => `2026-${month}-${String(day).padStart(2,'0')}`;
    const rounds = days.map((d,i) => ({number:i+1,opensAt:`${date(d)}T14:00:00+09:00`,closesAt:`${date(d+1)}T14:00:00+09:00`,resultsAt:`${date(d+1)}T18:00:00+09:00`}));
    const members = ['A','B','C'].map(m => ({id:`demo-${m}`,name:`サンプル${m}`}));
    const slots = members.flatMap((m,i) => [1,2,3,4].map((n) => ({id:`${m.id}-${n}`,memberId:m.id,date:n<=2?'2026-11-01':'2026-11-08',session:(n-1)%2+1,firstRound:1,initialStatus:i===2 && n===4?'exempt':'offered'})));
    return {id,label,group:'乃木坂46',eventType:'online',xTerms:[`DEMO-${id}`],rounds,members,slots,officialSnapshots:[],predictions:[]};
  };
  const previous = make('demo-previous','08',[5,12,19,26],'前作（架空データ）');
  const current = make('demo-current','09',[2,9,16,29],'今作（架空データ）');
  current.previousReleaseId = previous.id;
  const snapshot = (r,n,counts) => ({id:`${r.id}-official-${n}`,applicationRound:n+1,observedAt:r.rounds[n].opensAt,receptionOpen:true,complete:true,sourceUrl:'https://fortunemusic.jp/',sourceHash:'0'.repeat(64),cells:r.slots.map(s => ({slotId:s.id,status:s.initialStatus==='exempt'?'exempt':Number(s.id.at(-1))<=counts[r.members.findIndex(m => m.id===s.memberId)]?'sold_out':'available',evidence:'架空のテストデータ。公式の販売状況ではありません。'}))});
  previous.officialSnapshots = [snapshot(previous,1,[1,0,0]),snapshot(previous,2,[3,1,0]),snapshot(previous,3,[4,2,1])];
  current.officialSnapshots = [snapshot(current,1,[2,0,0]),snapshot(current,2,[4,2,0])];
  const reports = [];
  for (const n of [2,3]) for (const id of ['demo-A-3','demo-A-4','demo-B-3','demo-C-1']) {
    for (let i=0;i<4;i++) reports.push({releaseId:current.id,slotId:id,round:n,postId:`${n}${id}${i}`,authorKey:`fake-${i}`,postedAt:current.rounds[n-1].resultsAt,accepted:true,basis:'round_total',applied:10,won:i===3?10:1});
  }
  current.predictions = [2,3].map(n => predict(current,reports,n,current.rounds[n-1].resultsAt));
  return {schemaVersion:1,generatedAt:'2026-09-18T12:00:00+09:00',demo:true,releases:[previous,current]};
}
