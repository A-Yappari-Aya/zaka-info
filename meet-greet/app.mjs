import {validateData,viewRelease,compareRelease,predictionAccuracy,LABELS,safeUrl,csv} from './core.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const number = x => x === null ? '—' : `${x>0?'+':''}${x}`;
const pct = x => x === null ? '—' : `${(x*100).toFixed(1)}%`;
const date = x => new Date(x).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
const query = new URLSearchParams(location.search);
let data,release,view,rows;
function fail(message) { $('message').textContent = message; $('message').className='error'; $('content').hidden=true; }
function options(id,items,value) {
  $(id).replaceChildren(...items.map(([v,t]) => {const o=document.createElement('option');o.value=v;o.textContent=t;return o;}));
  if (items.some(([v]) => String(v) === String(value))) $(id).value=value;
}
function chooseRelease(preferred) {
  const matches = data.releases.filter(r => r.group===$('group').value && r.eventType===$('format').value).slice().reverse();
  options('release',matches.map(r => [r.id,r.label]),preferred);
  chooseRound();
}
function chooseRound() {
  release = data.releases.find(r => r.id===$('release').value);
  const now = Date.now();
  const rounds = release?.rounds.filter(r => Date.parse(r.opensAt)<=now).map(r => [r.number,`第${r.number}次までの結果`]).reverse() || [];
  options('round',rounds,query.get('round')); render();
}
function render() {
  $('grid').replaceChildren();$('comparison').replaceChildren();$('summary').replaceChildren();
  $('timing').textContent='';$('accuracy').textContent='';$('compare-note').textContent='';
  if (!release || !$('round').value) { $('grid').textContent='この条件のデータは未登録です。';$('csv').disabled=true;return; }
  $('csv').disabled=false;
  const round=Number($('round').value), show=$('predictions').checked;
  view=viewRelease(release,round);rows=compareRelease(data,release,round).filter(m => m.name.includes($('member').value.trim()));
  const total=view.members.reduce((n,m)=>n+m.total,0),sold=view.members.reduce((n,m)=>n+m.sold,0),prediction=view.members.reduce((n,m)=>n+m.predicted,0);
  $('summary').innerHTML=`<div class="stat">公式確認の完売<strong>${sold} / ${total}<small> 部</small></strong><small>未確認を含む分母。販売枚数ではありません。</small></div><div class="stat">別枠の完売予想<strong>${prediction}<small> 部</small></strong><small>確定完売には加算しません。</small></div><div class="stat">確認・予想の段階<strong>第${round}次</strong><small>${view.hasSnapshot?'次回受付の公式確認あり':'次回受付の公式確認待ち'}</small></div>`;
  const next=release.rounds.find(r=>r.number===round+1);
  $('timing').textContent=`データ更新：${data.generatedAt?date(data.generatedAt):'未取得'}（日本時間）。${next?`第${round+1}次受付 ${date(next.opensAt)} 以降に、第${round}次の結果を確認。`:'次回受付がない場合は公式の明示確認まで未確定。'}`;
  const columns=[...new Map(view.cells.map(c=>[JSON.stringify([c.date,c.session,c.venue||'']),c])).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.session-b.session||(a.venue||'').localeCompare(b.venue||''));
  $('grid').innerHTML=`<table><caption class="muted">${esc(release.label)}・第${round}次まで</caption><thead><tr><th scope="col">メンバー</th><th scope="col">確定 / 販売部数</th>${columns.map(c=>`<th scope="col">${esc(c.date.slice(5))}<br>第${c.session}部 ${esc(c.venue||'')}</th>`).join('')}</tr></thead><tbody>${rows.map(m=>`<tr><th scope="row">${esc(m.name)}</th><td>${m.sold} / ${m.total}${show?`<small class="cell-note">予想 ${m.predicted}部</small>`:''}</td>${columns.map(c=>{const x=m.cells.find(s=>s.date===c.date&&s.session===c.session&&(s.venue||'')===(c.venue||''));if(!x)return '<td>—</td>';const status=show&&x.predicted?x.predicted:x.status;return `<td><button data-slot="${esc(x.id)}" class="${status}" aria-label="${esc(m.name)} ${esc(c.date)} 第${c.session}部 ${LABELS[status]}">${LABELS[status]}${x.status==='sold_out'?`<small class="cell-note">初確認 ${x.firstConfirmedRound}次</small>`:''}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  const prev=data.releases.find(r=>r.id===release.previousReleaseId);
  $('compare-note').textContent=prev?`${prev.label}の第${round}次までと比較。現在の予想は比較に含みません。`:'前作データは未登録です。';
  $('comparison').innerHTML=`<table><thead><tr><th>メンバー</th><th>今作の確定</th><th>前作の確定</th><th>差分</th><th>完売率の差</th><th>条件</th></tr></thead><tbody>${rows.map(m=>`<tr><th scope="row">${esc(m.name)}</th><td>${m.sold}/${m.total} (${pct(m.rate)})</td><td>${m.previous?`${m.previous.sold}/${m.previous.total} (${pct(m.previous.rate)})`:'—'}</td><td class="delta">${number(m.delta)}</td><td>${m.deltaPp===null?'—':`${number(Number(m.deltaPp.toFixed(1)))}pt`}</td><td>${m.denominatorChanged?'販売部数が異なります / ':''}${m.delta===null?'比較情報不足':'同一次数・公式確認'}</td></tr>`).join('')}</tbody></table>`;
  const accuracy=predictionAccuracy(release,round);
  $('accuracy').textContent=accuracy?`保存済み予想の検証：判定可能な${accuracy.judged}部のうち${accuracy.hits}部で完売確認（予想した枠のみ。未判定は除外）。`:'予想履歴は公式確認後も残し、確認できた枠だけで検証します。';
  query.set('group',release.group);query.set('release',release.id);query.set('round',round);query.set('format',release.eventType);
  history.replaceState(null,'',`?${query}`);
}
$('grid').addEventListener('click',e=>{
  const target=e.target.closest('button[data-slot]');if(!target)return;
  const c=view.cells.find(s=>s.id===target.dataset.slot),m=release.members.find(x=>x.id===c.memberId);
  const source=c.source&&safeUrl(c.source.sourceUrl,true);
  const xquery=`${release.group} ${release.xTerms?.[0]||release.label} ${m.name} 第${view.resultRound}次 ミーグリ 当落`;
  $('detail-body').innerHTML=`<h2>${esc(m.name)}</h2><p>${esc(c.date)} 第${c.session}部</p><p><b>公式：${LABELS[c.status]}</b></p>${c.source?`<p>第${c.source.applicationRound}次受付で確認：${esc(date(c.source.observedAt))}</p><p>${esc(c.source.evidence)}</p>`:''}${source?`<p><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">公式の確認元</a></p>`:''}${c.evidence?`<p>保存済み予想：${LABELS[c.evidence.label]}</p><p>報告 ${c.evidence.authors}アカウント / 落選あり ${c.evidence.lossAuthors}アカウント</p><p>報告された応募 ${c.evidence.applied}枚 / 当選 ${c.evidence.won}枚</p><p class="muted">自己申告の偏った標本です。実際の当選確率・残り枠数は分かりません。</p>`:'<p>この枠の当落報告は未集計です。</p>'}<p><a href="https://x.com/search?q=${encodeURIComponent(xquery)}&f=live" target="_blank" rel="noopener noreferrer">Xで関連報告を確認</a></p>`;
  $('detail').showModal();
});
$('csv').onclick=()=>{
  const output=[['作品','結果次数','メンバー','日付','部','公式状態','完売初確認次数','予想','報告アカウント数'],...rows.flatMap(m=>m.cells.map(c=>[release.label,view.resultRound,m.name,c.date,c.session,LABELS[c.status],c.firstConfirmedRound,c.predicted?LABELS[c.predicted]:'',c.evidence?.authors??0]))];
  const url=URL.createObjectURL(new Blob([csv(output)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`meet-greet-round-${view.resultRound}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('group').onchange=()=>chooseRelease();$('format').onchange=()=>chooseRelease();$('release').onchange=chooseRound;
$('round').onchange=render;$('member').oninput=render;$('predictions').onchange=render;
try {
  if(query.get('demo')==='1'){data=(await import('./demo.mjs')).createDemo();$('demo-notice').hidden=false;}
  else {const response=await fetch('../v1/meet-greet.json',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();}
  validateData(data);
  if(!data.releases.length){$('message').innerHTML='公式データはまだ登録されていません。未取得を完売0として表示しません。<br><a href="?demo=1">架空データで画面を確認</a>';}
  else {$('message').textContent='';$('content').hidden=false;$('group').value=query.get('group')||data.releases.at(-1).group;$('format').value=query.get('format')||'online';chooseRelease(query.get('release'));}
} catch(e) {fail(`データを表示できません。完売状態は更新していません。\n${e.message}`);}
