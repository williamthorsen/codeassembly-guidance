import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var ae=Object.defineProperty;var o=(e,t)=>ae(e,"name",{value:t,configurable:!0});import{mkdir as Ge,readFile as oe,writeFile as Ye}from"node:fs/promises";import I from"node:path";import E from"node:process";function L(e){return e instanceof Error||Object.prototype.toString.call(e)==="[object Error]"}o(L,"isError");function x(e){try{return L(e)&&typeof e.message=="string"&&e.message!==""?e.message:String(e)}catch{return"[unstringifiable value]"}}o(x,"describeError");import{realpathSync as V}from"node:fs";import F from"node:process";import{fileURLToPath as de}from"node:url";function W(e,t){let r=F.argv[1];if(r===void 0)return!1;try{return V(de(e))===V(r)}catch(s){return F.stderr.write(`${t}: warning: could not determine entry point: ${x(s)}
`),!0}}o(W,"isEntryPoint");function ce(e,t){return U(e)&&e.code===t}o(ce,"isErrorCode");function b(e){return ce(e,"ENOENT")}o(b,"isEnoent");function g(e){return U(e)&&!Array.isArray(e)}o(g,"isRecord");function U(e){return typeof e=="object"&&e!==null}o(U,"isObject");var q=String.raw`() => {
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
}`;function l(e,t){return{ok:!1,error:e,message:t}}o(l,"fail");import{mkdir as le,readFile as ue,rename as fe,rm as me,writeFile as pe}from"node:fs/promises";import D from"node:path";import ge from"node:process";var z="manifest.json",he=/^[a-z0-9][a-z0-9-]{0,39}$/;function N(e,t){return`${e}.${t}`}o(N,"formatId");function P(e){return he.test(e)}o(P,"isValidSlug");function B(e){let t=new Map;for(let r of e.entries){let s=t.get(r.slug);(s===void 0||r.version>s.version)&&t.set(r.slug,r)}return t.values().toArray()}o(B,"listLatestEntries");function M(e,t){let r=e?.entries??[],s=0;for(let n of r)n.slug===t&&n.version>s&&(s=n.version);return s+1}o(M,"nextVersion");async function y(e){let t=G(e),r;try{r=await ue(t,"utf8")}catch(n){if(b(n))return{kind:"missing"};throw n}let s;try{s=JSON.parse(r)}catch{return{kind:"invalid",message:`${t} is not valid JSON`}}return we(s)?{kind:"ok",manifest:ve(s)}:{kind:"invalid",message:`${t} does not have the manifest layout`}}o(y,"readManifest");function K(e,t){let r=e?.entries??[],s=new Map,n=0;for(let i of r)s.set(i.slug,i.number),n=Math.max(n,i.number);return t.map(i=>{let d=s.get(i);d===void 0&&(n+=1,d=n,s.set(i,d));let a=M(e,i);return{slug:i,number:d,version:a,id:N(d,a)}})}o(K,"resolveIds");function G(e){return D.join(e,z)}o(G,"resolveManifestPath");function Y(e,t){let r=e?.entries??[],s=0;for(let n of r){if(n.slug===t)return n.number;s=Math.max(s,n.number)}return s+1}o(Y,"resolveNumber");async function k(e,t){await le(e,{recursive:!0});let r=G(e),s=D.join(e,`.${z}.${ge.pid}.${Date.now()}.tmp`);try{await pe(s,`${JSON.stringify(t,null,2)}
`,"utf8"),await fe(s,r)}catch(n){throw await me(s,{force:!0}),n}return r}o(k,"writeManifest");function be(e){return g(e)&&typeof e.label=="string"&&typeof e.value=="string"}o(be,"isNote");function v(e){return e===null||typeof e=="string"}o(v,"isNullableString");function ye(e){return g(e)?typeof e.shared=="string"&&v(e.changes)&&Array.isArray(e.try)&&e.try.every(t=>typeof t=="string"):!1}o(ye,"isSetSummary");function xe(e){return g(e)?typeof e.slug=="string"&&(e.number===void 0||typeof e.number=="number"&&Number.isSafeInteger(e.number)&&e.number>0)&&typeof e.version=="number"&&Number.isSafeInteger(e.version)&&typeof e.registeredAt=="string"&&typeof e.title=="string"&&typeof e.url=="string"&&v(e.source)&&v(e.lens)&&Array.isArray(e.inputs)&&e.inputs.every(t=>typeof t=="string")&&v(e.description)&&(e.notes===void 0||Array.isArray(e.notes)&&e.notes.every(t=>be(t)))&&v(e.shot):!1}o(xe,"isStoredEntry");function we(e){return g(e)?typeof e.title=="string"&&(e.indexUrl===null||typeof e.indexUrl=="string")&&(e.summary===void 0||e.summary===null||ye(e.summary))&&Array.isArray(e.entries)&&e.entries.every(t=>xe(t)):!1}o(we,"isStoredManifest");function ve(e){let t=new Map;for(let n of e.entries){let i=t.get(n.slug);n.number!==void 0&&(i===void 0||n.version>i.version)&&t.set(n.slug,{version:n.version,number:n.number})}let r=new Map(t.entries().map(([n,{number:i}])=>[n,i])),s=Math.max(0,...r.values());for(let n of e.entries)r.has(n.slug)||(s+=1,r.set(n.slug,s));return{...e,summary:e.summary??null,entries:e.entries.map(n=>{let i=r.get(n.slug);if(i===void 0)throw new Error(`slug "${n.slug}" was not numbered`);return{...n,number:i,notes:n.notes??[]}})}}o(ve,"normalizeManifest");import Se from"node:path";function H(e,t){let r=[],s=[];for(let n=0;n<e.length;n+=1){let i=e[n];if(i===void 0)continue;if(!i.startsWith("--")){r.push(i);continue}let d=ke(i,t);if(d===null)throw new Error(`unknown flag: ${i}`);let{spec:a,inlineValue:c}=d;if(!a.takesValue){if(c!==null)throw new Error(`--${a.name} does not take a value`);s.push({name:a.name,value:null});continue}if(c!==null){s.push({name:a.name,value:c});continue}let f=e[n+1]??null;if(f===null||f.startsWith("--"))throw new Error(`--${a.name} requires a value`);s.push({name:a.name,value:f}),n+=1}return{positionals:r,flags:s}}o(H,"scanFlags");function J(e){let t={};for(let{name:r,value:s}of e)s!==null&&(t[r]=s);return t}o(J,"valueFlagMap");function ke(e,t){for(let r of t)for(let s of[r.name,...r.aliases??[]]){let n=`--${s}`;if(e===n)return{spec:r,inlineValue:null};if(e.startsWith(`${n}=`))return{spec:r,inlineValue:e.slice(n.length+1)}}return null}o(ke,"matchFlag");var T=["copy-probe","describe-set","probe-targets","record-index","register","render","resolve-ids"],Ee=new Set(T),$e=[{name:"description",takesValue:!0},{name:"endpoint",takesValue:!0},{name:"file",takesValue:!0},{name:"inputs",takesValue:!0},{name:"lens",takesValue:!0},{name:"note",takesValue:!0},{name:"number",takesValue:!0},{name:"out",takesValue:!0},{name:"screenshot",takesValue:!0},{name:"set-dir",takesValue:!0},{name:"set-title",takesValue:!0},{name:"slug",takesValue:!0},{name:"slugs",takesValue:!0},{name:"source",takesValue:!0},{name:"title",takesValue:!0},{name:"url",takesValue:!0}],Ne={"copy-probe":{required:[],optional:[]},"describe-set":{required:["file","set-dir"],optional:[]},"probe-targets":{required:["endpoint"],optional:[]},"record-index":{required:["set-dir","url"],optional:[]},register:{required:["set-dir","slug","title","url"],optional:["description","inputs","lens","note","number","screenshot","set-title","source"]},render:{required:["out","set-dir"],optional:[]},"resolve-ids":{required:["set-dir","slugs"],optional:[]}};function X(e){let{positionals:t,flags:r}=H(e,$e),[s,n]=t;if(s===void 0)throw new Error(`a command is required: ${T.join(", ")}`);if(!Pe(s))throw new Error(`unknown command "${s}"; expected one of ${T.join(", ")}`);if(n!==void 0)throw new Error(`unexpected argument: ${n}`);let i=r.filter(u=>u.name==="note"),d=J(r.filter(u=>u.name!=="note")),{required:a,optional:c}=Ne[s];if(i.length>0&&!c.includes("note"))throw new Error(`${s} does not take --note`);for(let[u,h]of Object.entries(d)){if(!a.includes(u)&&!c.includes(u))throw new Error(`${s} does not take --${u}`);if(h==="")throw new Error(`--${u} requires a value`)}for(let u of a)if(d[u]===void 0)throw new Error(`${s} requires --${u}`);let f=i.map(u=>Re(u.value??""));return{command:s,values:d,notes:f}}o(X,"parseArgs");function R(e){return e===void 0?[]:e.split(",").map(t=>t.trim()).filter(t=>t!=="")}o(R,"parseInputs");function p(e,t){let r=e[t];if(r===void 0)throw new Error(`--${t} is missing after parsing`);return r}o(p,"requireFlag");function w(e){return Se.resolve(p(e,"set-dir"))}o(w,"resolveSetDir");function Pe(e){return Ee.has(e)}o(Pe,"isCommand");function Re(e){let t=e.indexOf(":"),r=t===-1?"":e.slice(0,t).trim(),s=t===-1?"":e.slice(t+1).trim();if(r===""||s==="")throw new Error(`--note "${e}" must have the form "<label>: <value>"`);return{label:r,value:s}}o(Re,"parseNote");import Me from"node:path";import{copyFile as Ae,mkdir as je,readFile as Ie}from"node:fs/promises";import C from"node:path";var Q=Buffer.from([137,80,78,71,13,10,26,10]);async function Z(e){let t;try{t=await Ie(e.sourcePath)}catch(n){if(b(n))return{ok:!1,error:"screenshot-not-found",message:`the screenshot ${e.sourcePath} does not exist`};throw n}if(!t.subarray(0,Q.length).equals(Q))return{ok:!1,error:"not-png",message:`${e.sourcePath} is not a PNG file`};let r=C.join("shots",`${e.slug}-v${e.version}.png`),s=C.join(e.setDir,r);return await je(C.dirname(s),{recursive:!0}),await Ae(e.sourcePath,s),{ok:!0,shot:r}}o(Z,"intakeScreenshot");function S(e){try{let{protocol:t}=new URL(e);return t==="https:"||t==="http:"}catch{return!1}}o(S,"isWebUrl");async function ee(e,t,r,s){let n=p(t,"slug");if(!P(n))return l("invalid-slug",`slug "${n}" must match [a-z0-9][a-z0-9-]{0,39}`);let i=p(t,"url");if(!S(i))return l("invalid-url",`--url "${i}" is not an http or https URL`);let d=await y(e);if(d.kind==="invalid")return l("invalid-manifest",d.message);let a=d.kind==="ok"?d.manifest:null,c=t["set-title"]??a?.title;if(c===void 0)return l("missing-set-title","the first registration in a set requires --set-title");let f=Te(a,n,t.number);if(typeof f!="number")return f;let u=M(a,n),h=null,O=t.screenshot;if(O!==void 0){let $=await Z({sourcePath:Me.resolve(O),setDir:e,slug:n,version:u});if(!$.ok)return l($.error,$.message);h=$.shot}let _={slug:n,number:f,version:u,registeredAt:s.toISOString(),title:p(t,"title"),url:i,source:t.source??null,lens:t.lens??null,inputs:R(t.inputs),description:t.description??null,notes:r,shot:h},ie={title:c,indexUrl:a?.indexUrl??null,summary:a?.summary??null,entries:[...a?.entries??[],_]};return{ok:!0,command:"register",manifestPath:await k(e,ie),entry:_}}o(ee,"register");function Te(e,t,r){let s=Y(e,t);if(r===void 0)return s;let n=Number(r);if(!Number.isSafeInteger(n)||n<1)return l("number-conflict",`--number "${r}" must be a positive integer`);let i=e?.entries??[];if(i.some(a=>a.slug===t))return s===n?n:l("number-conflict",`slug "${t}" is number ${s}, not ${n}`);let d=i.find(a=>a.number===n);return d===void 0?n:l("number-conflict",`number ${n} belongs to slug "${d.slug}"`)}o(Te,"resolveRegistrationNumber");var Ce=5e3,Oe={fetch,evaluate:_e};async function te(e,t=Oe){if(!S(e))return l("invalid-url",`--endpoint "${e}" is not an http or https URL`);let r=e.replace(/\/+$/,""),s;try{s=await(await t.fetch(`${r}/json/list`)).json()}catch{return l("endpoint-unreachable",`${r}/json/list did not return a target list`)}let n=Le(s),i=await Promise.all(n.map(async c=>({target:c,answered:await t.evaluate(c.webSocketUrl,Ce)}))),d=[],a=[];for(let{target:c,answered:f}of i){let u={id:c.id,url:c.url};if(f){d.push(u);continue}try{await t.fetch(`${r}/json/close/${encodeURIComponent(c.id)}`)}catch{return l("endpoint-unreachable",`${r}/json/close/${c.id} did not answer`)}a.push(u)}return{ok:!0,command:"probe-targets",closed:a,answered:d}}o(te,"probeTargets");async function _e(e,t,r=s=>new WebSocket(s)){return new Promise(s=>{let n=r(e),i=setTimeout(()=>d(!1),t);function d(a){clearTimeout(i),n.close(),s(a)}o(d,"settle"),n.addEventListener("open",()=>{n.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"1"}}))}),n.addEventListener("message",a=>{let c=Ve(a);c!==void 0&&c.id===1&&d(!c.isError)}),n.addEventListener("error",()=>d(!1))})}o(_e,"evaluateOverWebSocket");function Le(e){if(!Array.isArray(e))return[];let t=[];for(let r of e){if(!g(r)||r.type!=="page")continue;let{id:s,url:n,webSocketDebuggerUrl:i}=r;typeof s=="string"&&typeof i=="string"&&t.push({id:s,url:typeof n=="string"?n:"",webSocketUrl:i})}return t}o(Le,"parsePageTargets");function Ve(e){if(typeof e.data!="string")return;let t;try{t=JSON.parse(e.data)}catch{return}if(g(t))return{id:t.id,isError:t.error!==void 0}}o(Ve,"parseReply");var Fe="verdicts";var re=`(() => {
  'use strict';
  const COLLECTION = '${Fe}';
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
`;var We=["accent","chip","control-border","on-accent","page","reject-bg","reject-text","surface","text","text-muted","winner-bg","winner-border","winner-text"],Ue={dark:{accent:"#8cb6ff",chip:"#2a2f39","control-border":"#8790a3","on-accent":"#0b1730",page:"#111317","reject-bg":"#3f1717","reject-text":"#ffb8b8",surface:"#1b1e25",text:"#e7e9ee","text-muted":"#b0b6c3","winner-bg":"#3b2d06","winner-border":"#d9a43a","winner-text":"#ffd98a"},light:{accent:"#1d5bbf",chip:"#e9ecf1","control-border":"#6b7385","on-accent":"#ffffff",page:"#f4f5f7","reject-bg":"#fbe4e4","reject-text":"#8f1d1d",surface:"#ffffff",text:"#1b1f27","text-muted":"#4a5160","winner-bg":"#fff1c9","winner-border":"#a06c00","winner-text":"#5c3d00"}};function A(e){return We.map(t=>`--${t}: ${Ue[e][t]};`).join(" ")}o(A,"renderTokenDeclarations");var ne=12e6,j=16e6;function se(e){let t=m(e.title),r=e.cards.length;return[`<title>${t}</title>`,`<style>${Be()}</style>`,"<main>","<header>",`<h1>${t}</h1>`,...e.summary===null?[]:[Ke(e.summary)],`<p class="summary" id="summary">${r} ${r===1?"prototype":"prototypes"}</p>`,"</header>",'<div class="toolbar">','<label class="toggle" id="rejected-toggle" hidden><input type="checkbox" id="show-rejected" checked> Show rejected</label>','<p class="hint" id="shortcuts" hidden>On a focused card: <kbd>\u2190</kbd> <kbd>\u2192</kbd> <kbd>\u2191</kbd> <kbd>\u2193</kbd> move between cards \xB7 <kbd>x</kbd> reject \xB7 <kbd>w</kbd> winner \xB7 <kbd>1\u20139</kbd> rank</p>','<p class="status" id="status" role="status" aria-live="polite"></p>',"</div>",'<div class="grid" id="grid">',...e.cards.map(s=>De(s,r)),"</div>","</main>",`<script>${re}</script>`,""].join(`
`)}o(se,"renderIndexPage");function m(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}o(m,"escapeHtml");function qe(e){let t=Date.parse(e);if(Number.isNaN(t))return e;let r=new Date(t).toISOString();return`${r.slice(0,10)} ${r.slice(11,16)} UTC`}o(qe,"formatTimestamp");function De(e,t){let{entry:r}=e,s=m(r.slug),n=m(r.title),i=m(r.url),d=`title-${s}`,a=e.shot===null?`<span class="placeholder">No screenshot for v${r.version}</span>`:`<img src="data:image/png;base64,${e.shot.toString("base64")}" alt="Screenshot of ${n}">`,c=[...r.lens===null?[]:[`<li class="chip">Lens: ${m(r.lens)}</li>`],...r.inputs.map(u=>`<li class="chip">${m(u)}</li>`)],f=Array.from({length:t},(u,h)=>`<option value="${h+1}">${h+1}</option>`);return[`<article class="card" tabindex="0" aria-labelledby="${d}" data-slug="${s}" data-number="${r.number}" data-id="${N(r.number,r.version)}" data-title="${n}" data-registered="${m(r.registeredAt)}">`,`<a class="thumb" href="${i}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${a}</a>`,'<div class="body">','<div class="badges" data-role="badges"></div>',`<h2 id="${d}"><a href="${i}" target="_blank" rel="noopener">${N(r.number,r.version)} ${n}</a></h2>`,`<p class="meta">${s} \xB7 ${m(qe(r.registeredAt))}</p>`,...c.length===0?[]:[`<ul class="chips">${c.join("")}</ul>`],...r.description===null?[]:[`<p class="description">${m(r.description)}</p>`],...r.notes.length===0?[]:[ze(r.notes)],'<div class="controls" data-role="controls" hidden>',`<button type="button" data-action="reject" aria-pressed="false" aria-describedby="${d}">Reject</button>`,`<label class="rank">Rank <select data-action="rank" aria-describedby="${d}"><option value="">None</option>${f.join("")}</select></label>`,`<button type="button" data-action="winner" aria-pressed="false" aria-describedby="${d}">Winner</button>`,"</div>","</div>","</article>"].join(`
`)}o(De,"renderCard");function ze(e){return`<dl class="notes">${e.map(r=>`<dt>${m(r.label)}</dt><dd>${m(r.value)}</dd>`).join("")}</dl>`}o(ze,"renderNotes");function Be(){return`
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
`}o(Be,"renderStyles");function Ke(e){let t=e.try.map(s=>`<li>${m(s)}</li>`);return`<section class="set-summary" aria-label="Set summary"><dl>${[`<dt>Shared</dt><dd>${m(e.shared)}</dd>`,...e.changes===null?[]:[`<dt>Changed in this round</dt><dd>${m(e.changes)}</dd>`],...t.length===0?[]:[`<dt>Try in each</dt><dd><ol>${t.join("")}</ol></dd>`]].join("")}</dl></section>`}o(Ke,"renderSummary");async function He(){try{let e=await Je({argv:E.argv.slice(2),now:new Date});E.stdout.write(`${JSON.stringify(e,null,2)}
`),e.ok||(E.exitCode=1)}catch(e){E.stderr.write(`index-prototypes: ${x(e)}
`),E.exit(1)}}o(He,"main");W(import.meta.url,"index-prototypes")&&await He();async function Je(e){let t;try{t=X(e.argv)}catch(r){return l("invalid-args",x(r))}switch(t.command){case"copy-probe":return{ok:!0,command:"copy-probe",function:q};case"describe-set":return Xe(w(t.values),I.resolve(p(t.values,"file")));case"probe-targets":return te(p(t.values,"endpoint"));case"record-index":return et(w(t.values),p(t.values,"url"));case"register":return ee(w(t.values),t.values,t.notes,e.now);case"render":return tt(w(t.values),I.resolve(p(t.values,"out")));case"resolve-ids":return rt(w(t.values),p(t.values,"slugs"));default:{let r=t.command;throw new Error(`unhandled command: ${String(r)}`)}}}o(Je,"runIndexPrototypes");async function Xe(e,t){let r;try{r=await oe(t,"utf8")}catch(a){if(b(a))return l("summary-not-found",`${t} does not exist`);throw a}let s;try{s=JSON.parse(r)}catch{return l("invalid-summary",`${t} is not valid JSON`)}let n=Qe(s);if(typeof n=="string")return l("invalid-summary",`${t}: ${n}`);let i=await y(e);return i.kind==="missing"?l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):i.kind==="invalid"?l("invalid-manifest",i.message):{ok:!0,command:"describe-set",manifestPath:await k(e,{...i.manifest,summary:n}),summary:n}}o(Xe,"describeSet");function Qe(e){if(!g(e))return'expected an object with "shared", "changes", and "try"';let{shared:t,changes:r,try:s}=e;if(typeof t!="string"||t.trim()==="")return'"shared" must be a non-empty string';if(r!=null&&typeof r!="string")return'"changes" must be a string or null';if(!Array.isArray(s)||s.some(i=>!(typeof i=="string"&&i.trim()!=="")))return'"try" must be a list of non-empty strings';let n=typeof r=="string"?r.trim():"";return{shared:t.trim(),changes:n===""?null:n,try:s.map(i=>i.trim())}}o(Qe,"parseSummary");async function Ze(e){try{return await oe(e)}catch(t){if(b(t))return null;throw t}}o(Ze,"readShot");async function et(e,t){if(!S(t))return l("invalid-url",`--url "${t}" is not an http or https URL`);let r=await y(e);return r.kind==="missing"?l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`):r.kind==="invalid"?l("invalid-manifest",r.message):{ok:!0,command:"record-index",manifestPath:await k(e,{...r.manifest,indexUrl:t}),indexUrl:t}}o(et,"recordIndex");async function tt(e,t){let r=await y(e);if(r.kind==="missing")return l("manifest-not-found",`${e} does not contain a manifest; register a prototype first`);if(r.kind==="invalid")return l("invalid-manifest",r.message);let{manifest:s}=r,n=[],i=[];for(let c of B(s)){let f=c.shot===null?null:await Ze(I.join(e,c.shot));c.shot!==null&&f===null&&i.push(c.slug),n.push({entry:c,shot:f})}let d=se({title:s.title,summary:s.summary,cards:n}),a=Buffer.byteLength(d,"utf8");return a>j?l("page-too-large",`the page is ${a} bytes, over the ${j}-byte artifact cap`):(await Ge(I.dirname(t),{recursive:!0}),await Ye(t,d,"utf8"),{ok:!0,command:"render",path:t,bytes:a,cards:n.length,title:s.title,indexUrl:s.indexUrl,missingShots:i,...a>ne&&{warning:`the page is ${a} bytes, approaching the ${j}-byte artifact cap`}})}o(tt,"render");async function rt(e,t){let r=R(t);if(r.length===0)return l("invalid-args","--slugs requires at least one slug");let s=r.find(d=>!P(d));if(s!==void 0)return l("invalid-slug",`slug "${s}" must match [a-z0-9][a-z0-9-]{0,39}`);if(new Set(r).size!==r.length)return l("invalid-args","--slugs names a slug twice");let n=await y(e);if(n.kind==="invalid")return l("invalid-manifest",n.message);let i=n.kind==="ok"?n.manifest:null;return{ok:!0,command:"resolve-ids",ids:K(i,r)}}o(rt,"resolveIdsForSlugs");export{Je as runIndexPrototypes};
