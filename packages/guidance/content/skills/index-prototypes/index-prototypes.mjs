import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var me=Object.defineProperty;var o=(e,t)=>me(e,"name",{value:t,configurable:!0});import{mkdir as rt,readFile as ue,writeFile as nt}from"node:fs/promises";import j from"node:path";import N from"node:process";function F(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}o(F,"isError");function w(e){try{return F(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}o(w,"describeError");import{realpathSync as W}from"node:fs";import q from"node:process";import{fileURLToPath as pe}from"node:url";function U(e,t){let r=q.argv[1];if(r===void 0)return!1;try{return W(pe(e))===W(r)}catch(n){return q.stderr.write(`${t}: warning: could not determine entry point: ${w(n)}
`),!0}}o(U,"isEntryPoint");function ge(e,t){return D(e)&&e.code===t}o(ge,"isErrorCode");function y(e){return ge(e,"ENOENT")}o(y,"isEnoent");function g(e){return D(e)&&!Array.isArray(e)}o(g,"isRecord");function D(e){return typeof e=="object"&&e!==null}o(D,"isObject");var z=String.raw`() => {
  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, legend, caption, figcaption, summary';
  const INLINE = 'label, button, a, option';
  const SKIPPED = '[data-demo], script, style, template';
  const MIN_WORDS = ${4};

  const entries = [];
  const byContainer = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const placeholder = node.getAttribute('placeholder');
      if (placeholder !== null && node.closest(SKIPPED) === null) {
        entries.push([placeholder]);
      }
      continue;
    }
    const parent = node.parentElement;
    if (parent === null || parent.closest(SKIPPED) !== null) {
      continue;
    }
    const nearest = parent.closest(BLOCK + ', div');
    const inline = parent.closest(INLINE);
    const container =
      nearest !== null && nearest.matches(BLOCK)
        ? nearest
        : inline !== null && (nearest === null || nearest.contains(inline))
          ? inline
          : (nearest ?? parent);
    let parts = byContainer.get(container);
    if (parts === undefined) {
      parts = [];
      byContainer.set(container, parts);
      entries.push(parts);
    }
    parts.push(node.data);
  }

  const seen = new Set();
  const strings = [];
  for (const parts of entries) {
    const text = parts.join('').replace(/\s+/g, ' ').trim();
    if (text === '' || text.split(' ').length < MIN_WORDS || seen.has(text)) {
      continue;
    }
    seen.add(text);
    strings.push(text);
  }
  return strings;
}`;function l(e,t){return{ok:!1,error:e,message:t}}o(l,"fail");import{mkdir as he,readFile as be,rename as ye,rm as xe,writeFile as we}from"node:fs/promises";import B from"node:path";import ve from"node:process";var K="manifest.json",ke=/^[a-z0-9][a-z0-9-]{0,39}$/;function v(e,t){return`${e}.${t}`}o(v,"formatId");function P(e){return ke.test(e)}o(P,"isValidSlug");function G(e){let t=new Map;for(let r of e.entries){let n=t.get(r.slug);(n===void 0||r.version>n.version)&&t.set(r.slug,r)}return t.values().toArray()}o(G,"listLatestEntries");function T(e,t){let r=e?.entries??[],n=0;for(let s of r)s.slug===t&&s.version>n&&(n=s.version);return n+1}o(T,"nextVersion");async function x(e){let t=H(e),r;try{r=await be(t,"utf8")}catch(s){if(y(s))return{kind:"missing"};throw s}let n;try{n=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return Ne(n)?{kind:"ok",manifest:Pe(n)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}o(x,"readManifest");function Y(e,t){let r=e?.entries??[],n=new Map,s=0;for(let i of r)n.set(i.slug,i.number),s=Math.max(s,i.number);return t.map(i=>{let d=n.get(i);d===void 0&&(s+=1,d=s,n.set(i,d));let a=T(e,i);return{slug:i,number:d,version:a,id:v(d,a)}})}o(Y,"resolveIds");function H(e){return B.join(e,K)}o(H,"resolveManifestPath");function J(e,t){let r=e?.entries??[],n=0;for(let s of r){if(s.slug===t)return s.number;n=Math.max(n,s.number)}return n+1}o(J,"resolveNumber");async function E(e,t){await he(e,{recursive:!0});let r=H(e),n=B.join(e,`.${K}.${ve.pid}.${Date.now()}.tmp`);try{await we(n,`${JSON.stringify(t,null,2)}
`,"utf8"),await ye(n,r)}catch(s){throw await xe(n,{force:!0}),s}return r}o(E,"writeManifest");function Se(e){return g(e)&&typeof e.label=="string"&&typeof e.value=="string"}o(Se,"isNote");function S(e){return e===null||typeof e=="string"}o(S,"isNullableString");function Ee(e){return g(e)?typeof e.shared=="string"&&S(e.changes)&&Array.isArray(e.try)&&e.try.every(t=>typeof t=="string"):!1}o(Ee,"isSetSummary");function $e(e){return g(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&S(e.source)&&S(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&S(e.description)&&(e.notes===void 0||Array.isArray(e.notes)&&e.notes.every(t=>Se(t)))&&S(e.shot):!1}o($e,"isStoredEntry");function Ne(e){return g(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&(e.summary===void 0||e.summary===null||Ee(e.summary))&&Array.isArray(e.entries)&&e.entries.every(t=>$e(t)):!1}o(Ne,"isStoredManifest");function Pe(e){let t=new Map;for(let s of e.entries){let i=t.get(s.slug);s.number!==void 0&&(i===void 0||s.version>i.version)&&t.set(s.slug,{version:s.version,number:s.number})}let r=new Map(t.entries().map(([s,{number:i}])=>[s,i])),n=Math.max(0,...r.values());for(let s of e.entries)r.has(s.slug)||(n+=1,r.set(s.slug,n));return{...e,summary:e.summary??null,entries:e.entries.map(s=>{let i=r.get(s.slug);if(i===void 0)throw new Error(`slug "${s.slug}" was not numbered`);return{...s,number:i,notes:s.notes??[]}})}}o(Pe,"normalizeManifest");import Ae from"node:path";function X(e,t){let r=[],n=[];for(let s=0;s<e.length;s+=1){let i=e[s];if(i===void 0)continue;if(!i.startsWith("--")){r.push(i);continue}let d=Ie(i,t);if(d===null)throw new Error(`unknown flag: ${i}`);let{spec:a,inlineValue:c}=d;if(!a.takesValue){if(c!==null)throw new Error(`--${a.name} does not take a value`);n.push({name:a.name,value:null});continue}if(c!==null){n.push({name:a.name,value:c});continue}let f=e[s+1]??null;if(f===null||f.startsWith("--"))throw new Error(`--${a.name} requires a value`);n.push({name:a.name,value:f}),s+=1}return{positionals:r,flags:n}}o(X,"scanFlags");function Q(e){let t={};for(let{name:r,value:n}of e)n!==null&&(t[r]=n);return t}o(Q,"valueFlagMap");function Ie(e,t){for(let r of t)for(let n of[r.name,...r.aliases??[]]){let s=`--${n}`;if(e===s)return{spec:r,inlineValue:null};if(e.startsWith(`${s}=`))return{spec:r,inlineValue:e.slice(s.length+1)}}return null}o(Ie,"matchFlag");var C=["copy-probe","describe-set","probe-targets","record-index","register","render","resolve-ids"],Re=new Set(C),je=[{name:"description",takesValue:!0},{name:"endpoint",takesValue:!0},{name:"file",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"note",takesValue:!0},{name:"number",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"slugs",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],Me={"copy-probe":{required:[],optional:[]},"describe-set":{required:["file","set-dir"],optional:[]},"probe-targets":{required:["endpoint"],optional:[]},"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","note","number","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]},"resolve-ids":{required:["set-dir","slugs"],optional:[]}};function Z(e){let{positionals:t,flags:r}=X(e,je),[n,s]=t;if(n===void 0)throw new Error(`a command is required: ${C.join(", ")}`);if(!Te(n))throw new Error(`unknown command "${n}"; expected one of ${C.join(", ")}`);if(s!==void 0)throw new Error(`unexpected argument: ${s}`);let i=r.filter(u=>u.name==="note"),d=Q(r.filter(u=>u.name!=="note")),{required:a,optional:c}=Me[n];if(i.length>0&&!c.includes("note"))throw new Error(`${n} does not take --note`);for(let[u,h]of Object.entries(d)){if(!a.includes(u)&&!c.includes(u))throw new Error(`${n} does not take --${u}`);if(h==="")throw new Error(`--${u} requires a value`)}for(let u of a)if(d[u]===void 0)throw new Error(`${n} requires --${u}`);let f=i.map(u=>Ce(u.value??""));return{command:n,values:d,notes:f}}o(Z,"parseArgs");function I(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}o(I,"parseInputs");function p(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}o(p,"requireFlag");function k(e){return Ae.resolve(p(e,"set-dir"))}o(k,"resolveSetDir");function Te(e){return Re.has(e)}o(Te,"isCommand");function Ce(e){let t=e.indexOf(":"),r=t===-1?"":e.slice(0,t).trim(),n=t===-1?"":e.slice(t+1).trim();if(r===""||n==="")throw new Error(`--note "${e}" must have the form "<label>: <value>"`);return{label:r,value:n}}o(Ce,"parseNote");import{readFile as Fe}from"node:fs/promises";import oe from"node:path";import{copyFile as Oe,mkdir as _e,readFile as Le}from"node:fs/promises";import O from"node:path";var ee=Buffer.from([137,80,78,71,13,10,26,10]);async function te(e){let t;try{t=await Le(e.sourcePath)}catch(s){if(y(s))return{ok:!1,error:"screenshot-not-found",message:`the screenshot ${e.sourcePath} does not exist`};throw s}if(!t.subarray(0,ee.length).equals(ee))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=O.join("shots",`${e.slug}-v${e.version}.png`),n=O.join(e.setDir,r);return await _e(O.dirname(n),{recursive:!0}),await Oe(e.sourcePath,n),{ok:!0,shot:r}}o(te,"intakeScreenshot");var Ve={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"};function re(e){return`${e} - Prototypes`}o(re,"formatIndexTitle");function ne(e,t,r,n){return`${e} - ${v(t,r)} ${n}`}o(ne,"formatPrototypeTitle");function se(e){let t=e.replaceAll(/<!--[\s\S]*?-->/g,"").replaceAll(/<svg[\s>][\s\S]*?<\/svg\s*>/gi,""),r=/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(t);return r?.[1]===void 0?null:r[1].replaceAll(/&(?:amp|lt|gt|quot|#39);/g,n=>Ve[n]??n).replaceAll(/\s+/g," ").trim()}o(se,"readPageTitle");function $(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}o($,"isWebUrl");async function ie(e,t,r,n){let s=p(t,"slug");if(!P(s))return l("invalid-slug",`slug "${s}" must match [a-z0-9][a-z0-9-]{0,39}`);let i=p(t,"url");if(!$(i))return l("invalid-url",`--url "${i}" is not an http or https URL`);let d=await x(e);if(d.kind==="invalid")return l("invalid-manifest",d.message);let a=d.kind==="ok"?d.manifest:null,c=t["set-title"]??a?.title;if(c===void 0)return l("missing-set-title","the first registration in a set requires --set-title");let f=Ue(a,s,t.number);if(typeof f!="number")return f;let u=T(a,s),h=p(t,"title"),M=t.source;if(M!==void 0){let b=await We(M,ne(c,f,u,h));if(b!==null)return b}let _=null,L=t.screenshot;if(L!==void 0){let b=await te({sourcePath:oe.resolve(L),setDir:e,slug:s,version:u});if(!b.ok)return l(b.error,b.message);_=b.shot}let V={slug:s,number:f,version:u,registeredAt:n.toISOString(),title:h,url:i,source:M??null,lens:t.lens??null,inputs:I(t.inputs),description:t.description??null,notes:r,shot:_},fe={title:c,indexUrl:a?.indexUrl??null,summary:a?.summary??null,entries:[...a?.entries??[],V]};return{ok:!0,command:"register",manifestPath:await E(e,fe),entry:V}}o(ie,"register");async function We(e,t){let r;try{r=await Fe(oe.resolve(e),"utf8")}catch(i){if(qe(i))return l("source-not-found",`--source "${e}" is not a readable file`);throw i}let n=se(r);if(n===t)return null;let s=n===null?"found no <title>":`found "${n}"`;return l("title-mismatch",`the source's <title> must be "${t}"; ${s}`)}o(We,"checkSourceTitle");function qe(e){return e instanceof Error&&"code"in e&&(e.code==="ENOENT"||e.code==="EISDIR")}o(qe,"isFileAbsenceError");function Ue(e,t,r){let n=J(e,t);if(r===void 0)return n;let s=Number(r);if(!Number.isSafeInteger(s)||s<1)return l("number-conflict",`--number "${r}" must be a positive integer`);let i=e?.entries??[];if(i.some(a=>a.slug===t))return n===s?s:l("number-conflict",`slug "${t}" is number ${n}, not ${s}`);let d=i.find(a=>a.number===s);return d===void 0?s:l("number-conflict",`number ${s} belongs to slug "${d.slug}"`)}o(Ue,"resolveRegistrationNumber");var De=5e3,ze={fetch,evaluate:Be};async function ae(e,t=ze){if(!$(e))return l("invalid-url",`--endpoint "${e}" is not an http or https URL`);let r=e.replace(/\/+$/,""),n;try{n=await(await t.fetch(`${r}/json/list`)).json()}catch{return l("endpoint-unreachable",`${r}/json/list did not return a target list`)}let s=Ke(n),i=await Promise.all(s.map(async c=>({target:c,answered:await t.evaluate(c.webSocketUrl,De)}))),d=[],a=[];for(let{target:c,answered:f}of i){let u={id:c.id,url:c.url};if(f){d.push(u);continue}try{await t.fetch(`${r}/json/close/${encodeURIComponent(c.id)}`)}catch{return l("endpoint-unreachable",`${r}/json/close/${c.id} did not answer`)}a.push(u)}return{ok:!0,command:"probe-targets",closed:a,answered:d}}o(ae,"probeTargets");async function Be(e,t,r=n=>new WebSocket(n)){return new Promise(n=>{let s=r(e),i=setTimeout(()=>d(!1),t);function d(a){clearTimeout(i),s.close(),n(a)}o(d,"settle"),s.addEventListener("open",()=>{s.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"1"}}))}),s.addEventListener("message",a=>{let c=Ge(a);c!==void 0&&c.id===1&&d(!c.isError)}),s.addEventListener("error",()=>d(!1))})}o(Be,"evaluateOverWebSocket");function Ke(e){if(!Array.isArray(e))return[];let t=[];for(let r of e){if(!g(r)||r.type!=="page")continue;let{id:n,url:s,webSocketDebuggerUrl:i}=r;typeof n=="string"&&typeof i=="string"&&t.push({id:n,url:typeof s=="string"?s:"",webSocketUrl:i})}return t}o(Ke,"parsePageTargets");function Ge(e){if(typeof e.data!="string")return;let t;try{t=JSON.parse(e.data)}catch{return}if(g(t))return{id:t.id,isError:t.error!==void 0}}o(Ge,"parseReply");var Ye="verdicts";var de=`(() => {
  'use strict';
  const COLLECTION = '${Ye}';
  const grid = document.getElementById('grid');
  const summary = document.getElementById('summary');
  const status = document.getElementById('status');
  const showRejected = document.getElementById('show-rejected');
  const rejectedToggle = document.getElementById('rejected-toggle');
  const shortcuts = document.getElementById('shortcuts');
  const cards = Array.from(grid.querySelectorAll('.card'));
  const bySlug = new Map(cards.map((card) => [card.dataset.slug, card]));
  const rankLimit = cards.length;
  const queues = new Map();
  const state = { db: null, writable: false, refused: false, verdicts: new Map() };

  function readVerdict(slug) {
    return state.verdicts.get(slug) || { rejected: false, rank: null, winner: false, updatedAt: '' };
  }

  function normalizeVerdict(data) {
    const rank = Number.isInteger(data.rank) && data.rank >= 1 && data.rank <= rankLimit ? data.rank : null;
    return {
      rejected: data.rejected === true,
      rank,
      winner: data.winner === true,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    };
  }

  // Two documents can claim the win between the two writes of a winner change; the later claim wins.
  function resolveWinner() {
    let winner = null;
    for (const [slug, verdict] of state.verdicts) {
      if (verdict.winner && !verdict.rejected && (winner === null || verdict.updatedAt > winner.updatedAt)) {
        winner = { slug, updatedAt: verdict.updatedAt };
      }
    }
    return winner === null ? null : winner.slug;
  }

  function buildSortKey(card, winner) {
    const slug = card.dataset.slug;
    const verdict = readVerdict(slug);
    let group = 2;
    if (verdict.rejected) group = 3;
    else if (slug === winner) group = 0;
    else if (verdict.rank !== null) group = 1;
    return [group, verdict.rank === null ? 0 : verdict.rank, card.dataset.registered];
  }

  function compareKeys(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function renderBadges(card, verdict, isWinner) {
    const badges = card.querySelector('[data-role="badges"]');
    badges.replaceChildren();
    const add = (text, variant) => {
      const badge = document.createElement('span');
      badge.className = 'badge' + (variant ? ' ' + variant : '');
      badge.textContent = text;
      badges.append(badge);
    };
    if (isWinner) add('Winner', 'winner');
    if (verdict.rank !== null) add('Rank ' + verdict.rank, '');
    if (verdict.rejected) add('Rejected', 'rejected');
  }

  function render() {
    const winner = resolveWinner();
    const focused = document.activeElement;
    const shownOrder = Array.from(grid.children);
    const sorted = cards.slice().sort((left, right) => compareKeys(buildSortKey(left, winner), buildSortKey(right, winner)));
    for (const card of sorted) grid.append(card);
    if (focused instanceof HTMLElement && focused !== document.activeElement && grid.contains(focused)) {
      focused.focus({ preventScroll: true });
    }

    const showControls = state.db !== null && state.writable;
    let rejectedCount = 0;
    let rankedCount = 0;
    for (const card of cards) {
      const slug = card.dataset.slug;
      const verdict = readVerdict(slug);
      const isWinner = slug === winner;
      if (verdict.rejected) rejectedCount += 1;
      if (verdict.rank !== null && !verdict.rejected) rankedCount += 1;
      card.classList.toggle('is-winner', isWinner);
      card.classList.toggle('is-rejected', verdict.rejected);
      card.hidden = verdict.rejected && !showRejected.checked;
      renderBadges(card, verdict, isWinner);

      const controls = card.querySelector('[data-role="controls"]');
      controls.hidden = !showControls;
      for (const control of controls.querySelectorAll('button, select')) control.disabled = state.refused;
      controls.querySelector('[data-action="reject"]').setAttribute('aria-pressed', String(verdict.rejected));
      controls.querySelector('[data-action="winner"]').setAttribute('aria-pressed', String(isWinner));
      controls.querySelector('[data-action="rank"]').value = verdict.rank === null ? '' : String(verdict.rank);
    }

    // Keep keyboard focus where the viewer was when a verdict hides the focused card: on its neighbor in the order
    // shown before this render.
    const focusedCard = focused instanceof Element ? focused.closest('.card') : null;
    if (focusedCard && focusedCard.hidden) {
      const index = shownOrder.indexOf(focusedCard);
      const neighbor =
        shownOrder.slice(index + 1).find((card) => !card.hidden) ||
        shownOrder.slice(0, index).reverse().find((card) => !card.hidden);
      if (neighbor) neighbor.focus({ preventScroll: true });
    }

    const parts = [cards.length + (cards.length === 1 ? ' prototype' : ' prototypes')];
    if (state.db !== null) {
      const winnerCard = winner === null ? null : bySlug.get(winner);
      parts.push(winnerCard ? 'winner: ' + winnerCard.dataset.id + ' ' + winnerCard.dataset.title : 'no winner yet');
      parts.push(rankedCount + ' ranked', rejectedCount + ' rejected');
    }
    summary.textContent = parts.join(' \xB7 ');
  }

  function canAct() {
    return state.db !== null && state.writable && !state.refused;
  }

  function writeVerdict(slug, verdict) {
    const previous = queues.get(slug) || Promise.resolve();
    const next = previous.then(() => state.db.collection(COLLECTION).doc(slug).set(verdict));
    queues.set(slug, next.catch(() => undefined));
    return next;
  }

  function handleWriteError(error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') {
      state.refused = true;
      setStatus('This view cannot change verdicts, so they are shown read-only.');
    } else if (code === 'quota_exceeded') {
      setStatus('This verdict was not saved because the verdict store is full.');
    } else {
      setStatus('The verdict was not saved. Try again in a moment.');
    }
    render();
  }

  async function applyVerdict(slug, patch) {
    const verdict = Object.assign({}, readVerdict(slug), patch, { updatedAt: new Date().toISOString() });
    try {
      await writeVerdict(slug, verdict);
      return true;
    } catch (error) {
      handleWriteError(error);
      return false;
    }
  }

  async function toggleReject(slug) {
    if (!canAct()) return;
    const verdict = readVerdict(slug);
    await applyVerdict(slug, verdict.rejected ? { rejected: false } : { rejected: true, rank: null, winner: false });
  }

  async function setRank(slug, rank) {
    if (!canAct()) return;
    await applyVerdict(slug, { rank, rejected: false });
  }

  async function toggleWinner(slug) {
    if (!canAct()) return;
    if (resolveWinner() === slug) {
      await applyVerdict(slug, { winner: false });
      return;
    }
    if (!(await applyVerdict(slug, { winner: true, rejected: false }))) return;
    for (const [other, verdict] of state.verdicts) {
      if (other !== slug && verdict.winner) await applyVerdict(other, { winner: false });
    }
  }

  // A row is the run of visible cards that share the first card's top edge.
  function countColumns(visible) {
    const top = visible[0].offsetTop;
    return Math.max(1, visible.filter((card) => card.offsetTop === top).length);
  }

  function moveFocus(card, key) {
    const visible = Array.from(grid.querySelectorAll('.card')).filter((candidate) => !candidate.hidden);
    const index = visible.indexOf(card);
    if (index === -1) return;
    const columns = countColumns(visible);
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    const target = visible[index + steps[key]];
    if (target) target.focus();
  }

  grid.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;
    const slug = button.closest('.card').dataset.slug;
    if (button.dataset.action === 'reject') void toggleReject(slug);
    if (button.dataset.action === 'winner') void toggleWinner(slug);
  });

  grid.addEventListener('change', (event) => {
    const select = event.target instanceof Element ? event.target.closest('select[data-action="rank"]') : null;
    if (!select) return;
    void setRank(select.closest('.card').dataset.slug, select.value === '' ? null : Number(select.value));
  });

  showRejected.addEventListener('change', render);

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('input, select, textarea, [contenteditable]')) return;
    const card = target ? target.closest('.card') : null;
    const key = event.key;
    if (key.startsWith('Arrow')) {
      // Move focus between cards with the arrow keys only from a focused card, so that the page scrolls as usual
      // elsewhere.
      if (!event.shiftKey && target && target.classList.contains('card')) {
        event.preventDefault();
        moveFocus(target, key);
      }
      return;
    }
    if (!card || !canAct()) return;
    const slug = card.dataset.slug;
    if (key === 'x') void toggleReject(slug);
    else if (key === 'w') void toggleWinner(slug);
    else if (/^[1-9]$/.test(key) && Number(key) <= rankLimit) void setRank(slug, Number(key));
    else return;
    event.preventDefault();
  });

  async function connect() {
    const claude = window.claude;
    if (!claude || typeof claude.use !== 'function') {
      setStatus('Verdicts are available only in the Claude viewer.');
      return;
    }
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db) {
      setStatus('Verdicts are not available in this view.');
      return;
    }
    state.db = db;
    const canWrite = user ? await user.can('data.write') : null;
    state.writable = canWrite !== false;
    rejectedToggle.hidden = false;
    shortcuts.hidden = !state.writable;
    if (!state.writable) setStatus('You can see the verdicts but not change them.');
    db.collection(COLLECTION).onSnapshot(
      (snapshot) => {
        const verdicts = new Map();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (bySlug.has(doc.id) && data) verdicts.set(doc.id, normalizeVerdict(data));
        }
        state.verdicts = verdicts;
        render();
      },
      () => setStatus('Verdicts stopped updating. Reload the page to see the latest.'),
    );
    render();
  }

  render();
  connect().catch(() => setStatus('Verdicts could not be loaded.'));
})();
`;var He=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],Je={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function A(e){return He.map(t=>`--${t}: ${Je[e][t]};`).join(" ")}o(A,"renderTokenDeclarations");var ce=12e6,R=16e6;function le(e){let t=m(e.title),r=e.cards.length;return[`<title>${m(re(e.title))}</title>`,`<style>${et()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,...e.summary===null?[]:[tt(e.summary)],`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(n=>Qe(n,r)),"</div>","</main>",`<script>${de}</script>`,""].join(`
`)}o(le,"renderIndexPage");function m(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}o(m,"escapeHtml");function Xe(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}o(Xe,"formatTimestamp");function Qe(e,t){let{entry:r}=e,n=m(r.slug),s=m(r.title),i=m(r.url),d=`title-${n}`,a=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${s}">`,c=[...r.lens===null?[]:[`<li class="chip">Lens: ${m(r.lens)}</li>`],...r.inputs.map(u=>`<li class="chip">${m(u)}</li>`)],f=Array.from({length:t},(u,h)=>`<option value="${h+1}">${h+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${d}" data-slug="${n}" data-number="${r.number}" data-id="${v(r.number,r.version)}" data-title="${s}" data-registered="${m(r.registeredAt)}">`,`<a class="thumb" href="${i}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${a}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${d}"><a href="${i}" target="_blank" rel="noopener">${v(r.number,r.version)} ${s}</a></h2>`,`<p class="meta">${n} \xB7 ${m(Xe(r.registeredAt))}</p>`,...c.length===0?[]:[`<ul class="chips">${c.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${m(r.description)}</p>`],...r.notes.length===0?[]:[Ze(r.notes)],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${d}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${d}"><option value="">None</option>${f.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${d}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}o(Qe,"renderCard");function Ze(e){return`<dl class="notes">${e.map(r=>`<dt>${m(r.label)}</dt><dd>${m(r.value)}</dd>`).join("")}</dl>`}o(Ze,"renderNotes");function et(){return`
:root { color-scheme: light; ${A("light")} }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; ${A("dark")} }
}
:root[data-theme="dark"] { color-scheme: dark; ${A("dark")} }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 24px; line-height: 1.25; margin: 0 0 4px; }
img { max-width: 100%; }
[hidden] { display: none !important; }
.summary, .hint, .status { margin: 0; color: var(--text-muted); font-size: 13px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; margin: 12px 0 20px; }
.toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
.toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
kbd { font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); background: var(--chip); border-radius: 4px; padding: 0 4px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(480px, 100%), 1fr)); }
.card { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--control-border); border-radius: 10px; overflow: hidden; }
.card.is-winner { border: 3px solid var(--winner-border); }
.card:focus-visible, a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.thumb { display: block; aspect-ratio: 16 / 10; background: var(--chip); }
.thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.card.is-rejected .thumb img { opacity: 0.4; filter: grayscale(1); }
.placeholder { display: flex; align-items: center; justify-content: center; height: 100%; padding: 8px; color: var(--text-muted); font-size: 13px; }
.body { display: flex; flex: 1; flex-direction: column; gap: 6px; padding: 12px 14px 14px; }
.card h2 { margin: 0; font-size: 17px; line-height: 1.3; }
.card h2 a { color: var(--accent); }
.meta { margin: 0; color: var(--text-muted); font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.chip { padding: 2px 8px; border-radius: 999px; background: var(--chip); color: var(--text); font-size: 13px; }
.description { margin: 0; }
.set-summary { margin: 12px 0 8px; max-width: 72ch; }
.set-summary dl { margin: 0; }
.set-summary dt { margin-top: 8px; color: var(--text-muted); font-size: 13px; font-weight: 600; }
.set-summary dt:first-child { margin-top: 0; }
.set-summary dd { margin: 2px 0 0; }
.set-summary ol { margin: 0; padding-left: 1.5em; }
.notes { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; font-size: 14px; }
.notes dt { color: var(--text-muted); font-size: 13px; font-weight: 600; }
.notes dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 420px) { .notes { grid-template-columns: 1fr; } .notes dd { margin-bottom: 4px; } }
.badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badges:empty { display: none; }
.badge { padding: 2px 8px; border-radius: 6px; background: var(--chip); color: var(--text); font-size: 13px; font-weight: 600; }
.badge.winner { background: var(--winner-bg); color: var(--winner-text); }
.badge.rejected { background: var(--reject-bg); color: var(--reject-text); }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 8px; }
.rank { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
button, select { min-height: 32px; padding: 4px 10px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit; font-size: 14px; cursor: pointer; }
button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
button:disabled, select:disabled { cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
`}o(et,"renderStyles");function tt(e){let t=e.try.map(n=>`<li>${m(n)}</li>`);return`<section class="set-summary" aria-label="Set summary"><dl>${[`<dt>Shared</dt><dd>${m(e.shared)}</dd>`,...e.changes===null?[]:[`<dt>Changed in this round</dt><dd>${m(e.changes)}</dd>`],...t.length===0?[]:[`<dt>Try in each</dt><dd><ol>${t.join("")}</ol></dd>`]].join("")}</dl></section>`}o(tt,"renderSummary");async function st(){try{let e=await ot({argv:N.argv.slice(2),now:new Date});N.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(N.exitCode=1)}catch(e){N.stderr.write(`index-prototypes: ${w(e)}
`),N.exit(1)}}o(st,"main");U(import.meta.url,"index-prototypes")&&await st();async function ot(e){let t;try{t=Z(e.argv)}catch(r){return l("invalid-args",w(r))}switch(t.command){case"copy-probe":return{ok:!0,command:"copy-probe",function:z};case"describe-set":return it(k(t.values),j.resolve(p(t.values,"file")));case"probe-targets":return ae(p(t.values,"endpoint"));case"record-index":return ct(k(t.values),p(t.values,"url"));case"register":return ie(k(t.values),t.values,t.notes,e.now);case"render":return lt(k(t.values),j.resolve(p(t.values,"out")));case"resolve-ids":return ut(k(t.values),p(t.values,"slugs"));default:{let r=t.command;throw new Error(`unhandled command: ${String(r)}`)}}}o(ot,"runIndexPrototypes");async function it(e,t){let r;try{r=await ue(t,"utf8")}catch(a){if(y(a))return l("summary-not-found",`${t} does not exist`);throw a}let n;try{n=JSON.parse(r)}catch{return l("invalid-summary",`${t} is not valid JSON`)}let s=at(n);if(typeof s=="string")return l("invalid-summary",`${t}: ${s}`);let i=await x(e);return i.kind==="missing"?l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):i.kind==="invalid"?l("invalid-manifest",i.message):{ok:!0,command:"describe-set",manifestPath:await E(e,{...i.manifest,summary:s}),summary:s}}o(it,"describeSet");function at(e){if(!g(e))return'expected an object with "shared", "changes", and "try"';let{shared:t,changes:r,try:n}=e;if(typeof t!="string"||t.trim()==="")return'"shared" must be a non-empty string';if(r!=null&&typeof r!="string")return'"changes" must be a string or null';if(!Array.isArray(n)||n.some(i=>!(typeof i=="string"&&i.trim()!=="")))return'"try" must be a list of non-empty strings';let s=typeof r=="string"?r.trim():"";return{shared:t.trim(),changes:s===""?null:s,try:n.map(i=>i.trim())}}o(at,"parseSummary");async function dt(e){try{return await ue(e)}catch(t){if(y(t))return null;throw t}}o(dt,"readShot");async function ct(e,t){if(!$(t))return l("invalid-url",`--url "${t}" is not an http or https URL`);let r=await x(e);return r.kind==="missing"?l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):r.kind==="invalid"?l("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await E(e,{...r.manifest,indexUrl:t}),indexUrl:t}}o(ct,"recordIndex");async function lt(e,t){let r=await x(e);if(r.kind==="missing")return l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`);if(r.kind==="invalid")return l("invalid-manifest",r.message);let{manifest:n}=r,s=[],i=[];for(let c of G(n)){let f=c.shot===null?null:await dt(j.join(e,c.shot));c.shot!==null&&f===null&&i.push(c.slug),s.push({entry:c,shot:f})}let d=le({title:n.title,summary:n.summary,cards:s}),a=Buffer.byteLength(d,"utf8");return a>R?l("page-too-large",`the page is ${a} bytes, over the ${R}-byte artifact cap`):(await rt(j.dirname(t),{recursive:!0}),await nt(t,d,"utf8"),{ok:!0,command:"render",path:t,bytes:a,cards:s.length,title:n.title,indexUrl:n.indexUrl,missingShots:i,...a>ce&&{warning:`the page is ${a} bytes, approaching the ${R}-byte artifact cap`}})}o(lt,"render");async function ut(e,t){let r=I(t);if(r.length===0)return l("invalid-args","--slugs requires at least one slug");let n=r.find(d=>!P(d));if(n!==void 0)return l("invalid-slug",`slug "${n}" must match [a-z0-9][a-z0-9-]{0,39}`);if(new Set(r).size!==r.length)return l("invalid-args","--slugs names a slug twice");let s=await x(e);if(s.kind==="invalid")return l("invalid-manifest",s.message);let i=s.kind==="ok"?s.manifest:null;return{ok:!0,command:"resolve-ids",ids:Y(i,r)}}o(ut,"resolveIdsForSlugs");export{ot as runIndexPrototypes};
