/** Meet & greet domain logic. No network, framework or runtime dependencies. */
export const METHOD = 'independent-loss-reports-v1';
export const LABELS = {sold_out:'完売確認',available:'販売あり',closed:'受付終了',exempt:'不参加・免除',cancelled:'中止',unknown:'未確認',likely:'完売予想・強',possible:'完売予想',insufficient:'情報不足'};
const ok = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
export function time(value) {
  ok(typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value), 'Timezone required');
  const result = Date.parse(value); ok(Number.isFinite(result), 'Invalid timestamp'); return result;
}
export function safeUrl(value, official = false) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (official && !['fortunemusic.jp','www.fortunemusic.jp','main.fortunemusic.jp','www.nogizaka46.com','nogizaka46.com','sakurazaka46.com','www.hinatazaka46.com','hinatazaka46.com'].includes(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
function unique(items, key, label) {
  ok(Array.isArray(items), `${label}: array required`);
  const keys = items.map(x => x[key]);
  ok(keys.every(x => typeof x === 'string' && x.length > 0) && new Set(keys).size === keys.length, `${label}: duplicate/empty ID`);
}
export function validateSnapshot(release, snapshot, now = Date.now()) {
  const round = release.rounds.find(r => r.number === snapshot.applicationRound);
  ok(round && integer(snapshot.applicationRound, 2), 'Snapshot must identify the next application round (>= 2)');
  const observed = time(snapshot.observedAt);
  ok(observed <= now && observed >= time(round.opensAt) && observed < time(round.closesAt), 'Snapshot outside active reception window');
  ok(snapshot.receptionOpen === true, 'Closed reception is not evidence of sell-out');
  ok(safeUrl(snapshot.sourceUrl, true), 'Official source URL required');
  ok(/^[a-f0-9]{64}$/.test(snapshot.sourceHash), 'SHA-256 of source evidence required');
  unique(snapshot.cells, 'slotId', 'snapshot cells');
  for (const cell of snapshot.cells) {
    const slot = release.slots.find(s => s.id === cell.slotId);
    ok(slot && slot.firstRound <= snapshot.applicationRound - 1, 'Unknown or not-yet-offered slot');
    ok(['sold_out','available','closed','exempt','cancelled','unknown'].includes(cell.status), 'Invalid official status');
    ok(typeof cell.evidence === 'string' && cell.evidence.trim(), 'Explicit slot evidence required');
  }
  if (snapshot.complete === true) {
    const expected = release.slots.filter(s => s.firstRound <= snapshot.applicationRound - 1);
    ok(expected.every(s => snapshot.cells.some(c => c.slotId === s.id)), 'Incomplete snapshot marked complete');
  }
  return snapshot;
}
export function validateData(data, now = Date.now()) {
  ok(data?.schemaVersion === 1, 'Unsupported schemaVersion');
  if (data.generatedAt !== null) ok(time(data.generatedAt) <= now, 'Future generatedAt');
  unique(data.releases, 'id', 'releases');
  for (const r of data.releases) {
    ok(typeof r.label === 'string' && typeof r.group === 'string', 'Release label/group required');
    ok(['online','real'].includes(r.eventType), 'Invalid event type');
    unique(r.members, 'id', 'members'); unique(r.slots, 'id', 'slots');
    ok(Array.isArray(r.rounds) && r.rounds.length > 0, 'Rounds required');
    const rounds = [...r.rounds].sort((a,b) => a.number-b.number);
    rounds.forEach((x,i) => {
      ok(x.number === i+1, 'Round numbers must be contiguous from 1');
      ok(time(x.opensAt) < time(x.closesAt) && time(x.closesAt) <= time(x.resultsAt), 'Invalid round times');
      if (i) ok(time(rounds[i-1].resultsAt) < time(x.opensAt), 'Overlapping rounds');
    });
    const identities = new Set();
    for (const s of r.slots) {
      ok(r.members.some(m => m.id === s.memberId), 'Unknown member');
      ok(/^\d{4}-\d{2}-\d{2}$/.test(s.date) && new Date(s.date).toISOString().slice(0,10) === s.date, 'Invalid date');
      ok(integer(s.session,1) && integer(s.firstRound,1) && s.firstRound <= rounds.length, 'Invalid slot');
      ok(['offered','exempt','cancelled'].includes(s.initialStatus), 'Invalid initial participation');
      const identity = JSON.stringify([s.memberId,s.date,s.session,s.venue || '']);
      ok(!identities.has(identity), 'Duplicate member/date/session/venue'); identities.add(identity);
    }
    unique(r.officialSnapshots, 'id', 'snapshots');
    r.officialSnapshots.forEach(s => validateSnapshot(r,s,now));
    ok(Array.isArray(r.predictions), 'Predictions required');
    for (const p of r.predictions) {
      const round = rounds.find(x => x.number === p.round);
      const next = rounds.find(x => x.number === p.round+1);
      ok(round && time(p.generatedAt) >= time(round.resultsAt) && time(p.generatedAt) <= now, 'Invalid prediction time');
      ok(!next || time(p.generatedAt) < time(next.opensAt), 'Prediction cannot be created after confirmation window opens');
      ok(p.method === METHOD, 'Unknown prediction method'); unique(p.cells,'slotId','prediction cells');
      for (const c of p.cells) {
        ok(r.slots.some(s => s.id === c.slotId && s.firstRound <= p.round), 'Unknown prediction slot');
        ok(['likely','possible','insufficient'].includes(c.label), 'Invalid prediction label');
        ok(integer(c.authors) && integer(c.lossAuthors) && c.lossAuthors <= c.authors, 'Invalid evidence counts');
        ok(integer(c.applied) && integer(c.won) && c.won <= c.applied, 'Invalid reported counts');
      }
    }
    if (r.previousReleaseId) {
      const prev = data.releases.find(x => x.id === r.previousReleaseId);
      ok(prev && prev.id !== r.id && prev.group === r.group && prev.eventType === r.eventType, 'Previous release must match group and format');
    }
  }
  return data;
}
/** Application round N+1 reveals results through N; never use future snapshots. */
export function viewRelease(release, resultRound, asOf = Infinity) {
  ok(integer(resultRound,1) && release.rounds.some(r => r.number === resultRound), 'Unknown result round');
  const snapshots = release.officialSnapshots.filter(s => s.applicationRound <= resultRound+1 && time(s.observedAt) <= asOf)
    .sort((a,b) => a.applicationRound-b.applicationRound || time(a.observedAt)-time(b.observedAt));
  const prediction = release.predictions.filter(p => p.round === resultRound && time(p.generatedAt) <= asOf)
    .sort((a,b) => time(b.generatedAt)-time(a.generatedAt))[0];
  const cells = release.slots.filter(s => s.firstRound <= resultRound).map(slot => {
    let status = slot.initialStatus === 'offered' ? 'unknown' : slot.initialStatus;
    let observedRound = null, firstConfirmedRound = null, source = null;
    for (const snap of snapshots) {
      const cell = snap.cells.find(c => c.slotId === slot.id);
      if (!cell || cell.status === 'unknown') continue;
      const n = snap.applicationRound-1;
      if (cell.status === 'sold_out' && status !== 'sold_out') firstConfirmedRound = n;
      if (cell.status !== 'sold_out') firstConfirmedRound = null;
      status = cell.status; observedRound = n; source = {...cell, ...snap, cells:undefined};
    }
    // Old availability does not prove availability in a later round. Sell-out is
    // carried forward until an explicit reopening/correction, with last-seen round.
    if (status === 'available' && observedRound !== resultRound) status = 'unknown';
    const evidence = prediction?.cells.find(c => c.slotId === slot.id) || null;
    const predicted = status === 'unknown' && evidence && evidence.label !== 'insufficient' ? evidence.label : null;
    return {...slot,status,observedRound,firstConfirmedRound,source,predicted,evidence};
  });
  const members = release.members.map(member => {
    const all = cells.filter(c => c.memberId === member.id);
    const offered = all.filter(c => !['exempt','cancelled'].includes(c.status));
    const sold = offered.filter(c => c.status === 'sold_out').length;
    const known = offered.filter(c => ['sold_out','available'].includes(c.status)).length;
    const complete = offered.length > 0 && known === offered.length && snapshots.some(s => s.applicationRound === resultRound+1);
    return {...member,cells:all,total:offered.length,sold,known,complete,
      predicted:offered.filter(c => c.predicted).length,rate:offered.length ? sold/offered.length : null};
  });
  return {resultRound,cells,members,prediction,hasSnapshot:snapshots.some(s => s.applicationRound === resultRound+1)};
}
export function compareRelease(data, release, resultRound) {
  const current = viewRelease(release,resultRound);
  const prev = data.releases.find(r => r.id === release.previousReleaseId);
  const previous = prev?.rounds.some(r => r.number === resultRound) ? viewRelease(prev,resultRound) : null;
  return current.members.map(m => {
    const old = previous?.members.find(x => x.id === m.id);
    const comparable = !!(m.complete && old?.complete);
    return {...m,previous:old || null,delta:comparable ? m.sold-old.sold : null,
      deltaPp:comparable ? (m.rate-old.rate)*100 : null,
      denominatorChanged:!!old && m.total !== old.total};
  });
}
/** Heuristic evidence grade, NOT a probability or an estimate of population win rate. */
export function predict(release,reports,roundNumber,generatedAt) {
  const round = release.rounds.find(r => r.number === roundNumber);
  const next = release.rounds.find(r => r.number === roundNumber+1);
  const cutoff = time(generatedAt);
  ok(round && cutoff >= time(round.resultsAt) && (!next || cutoff < time(next.opensAt)), 'Outside prediction window');
  const latest = new Map();
  for (const r of reports) {
    if (r.releaseId !== release.id || r.round !== roundNumber || r.accepted !== true || r.basis !== 'round_total') continue;
    if (!r.authorKey || !r.postId || !release.slots.some(s => s.id === r.slotId && s.firstRound <= roundNumber)) continue;
    if (!integer(r.applied,1) || !integer(r.won) || r.won > r.applied) continue;
    let posted; try { posted = time(r.postedAt); } catch { continue; }
    if (posted < time(round.resultsAt) || posted > cutoff) continue;
    const key = `${r.slotId}:${r.authorKey}`;
    const old = latest.get(key);
    if (!old || posted > time(old.postedAt) || (posted === time(old.postedAt) && r.postId > old.postId)) latest.set(key,r);
  }
  const existingState = viewRelease(release,roundNumber,cutoff);
  const cells = release.slots.filter(s => s.firstRound <= roundNumber).map(s => {
    const sample = [...latest.values()].filter(r => r.slotId === s.id);
    const lossAuthors = sample.filter(r => r.won < r.applied).length;
    const allowed = existingState.cells.find(c => c.id === s.id)?.status === 'unknown';
    const label = !allowed ? 'insufficient' : lossAuthors >= 3 && lossAuthors/sample.length >= .75 ? 'likely' : lossAuthors >= 2 ? 'possible' : 'insufficient';
    return {slotId:s.id,label,authors:sample.length,lossAuthors,
      applied:sample.reduce((n,r) => n+r.applied,0),won:sample.reduce((n,r) => n+r.won,0)};
  });
  return {round:roundNumber,generatedAt,method:METHOD,cells};
}
export function predictionAccuracy(release,round) {
  const predicted = [...release.predictions].filter(p => p.round === round).sort((a,b) => time(b.generatedAt)-time(a.generatedAt))[0];
  const actual = viewRelease(release,round);
  if (!predicted || !actual.hasSnapshot) return null;
  const judged = predicted.cells.filter(c => c.label !== 'insufficient').map(c => ({guess:c,actual:actual.cells.find(a => a.id === c.slotId)}))
    .filter(x => x.actual?.observedRound === round && ['sold_out','available'].includes(x.actual.status));
  return {judged:judged.length,hits:judged.filter(x => x.actual.status === 'sold_out').length};
}
export function csv(rows) {
  const cell = x => { let s = String(x ?? ''); if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };
  return '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}
