import { marked } from './vendor/marked.esm.js';

const TYPES = ['user', 'feedback', 'project', 'reference', 'other'];
const SEVERITIES = ['error', 'warn', 'info'];
const ALL = '*';
const INDEX = 'MEMORY.md';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const typeOf = (m) => (TYPES.includes(m.type) ? m.type : 'other');
const color = (t) => `var(--t-${t})`;
const keyOf = (pid, file) => `${pid}:${file}`;
const splitKey = (k) => {
  const i = k.indexOf(':');
  return [k.slice(0, i), k.slice(i + 1)];
};

const state = {
  data: null,
  sig: null,
  project: ALL,
  mem: null,
  tab: 'list',
  q: '',
  types: new Set(TYPES),
  sev: new Set(['error', 'warn']),
  sort: 'modified',
  labels: false,
};
let idx = null;
let ignoredOpen = false;

// ---------- URL hash <-> state ----------

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.project = p.get('p') || ALL;
  state.mem = p.get('m') || null;
  state.tab = ['list', 'graph', 'lint'].includes(p.get('t')) ? p.get('t') : 'list';
  state.q = p.get('q') || '';
  state.types = new Set(p.has('ty') ? p.get('ty').split(',').filter(Boolean) : TYPES);
  state.sev = new Set(p.has('sv') ? p.get('sv').split(',').filter(Boolean) : ['error', 'warn']);
  state.sort = p.get('s') === 'name' ? 'name' : 'modified';
}

function writeHash(push) {
  const p = new URLSearchParams();
  if (state.project !== ALL) p.set('p', state.project);
  if (state.mem) p.set('m', state.mem);
  if (state.tab !== 'list') p.set('t', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.types.size !== TYPES.length) p.set('ty', [...state.types].join(','));
  if (!(state.sev.size === 2 && state.sev.has('error') && state.sev.has('warn'))) p.set('sv', [...state.sev].join(','));
  if (state.sort !== 'modified') p.set('s', state.sort);
  const next = '#' + p.toString();
  if (next === location.hash || (next === '#' && !location.hash)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', next);
}

// `graph` forces a layout rebuild; a selection change only re-highlights.
function set(patch, { push = false, graph = false } = {}) {
  const rebuild = graph || 'tab' in patch || ('project' in patch && patch.project !== state.project);
  Object.assign(state, patch);
  writeHash(push);
  render({ graph: rebuild });
}

// ---------- data ----------

function buildIndex(data) {
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const mems = new Map();
  const backlinks = new Map();
  const lintByKey = new Map();
  const ignored = new Set(data.projects.filter((p) => p.ignored).map((p) => p.id));
  for (const p of data.projects) {
    for (const m of p.memories) mems.set(keyOf(p.id, m.file), { ...m, pid: p.id });
    for (const m of p.memories) {
      for (const l of m.links) {
        if (!l.resolved || l.resolved === m.file) continue;
        const k = keyOf(p.id, l.resolved);
        if (!backlinks.has(k)) backlinks.set(k, new Set());
        backlinks.get(k).add(keyOf(p.id, m.file));
      }
    }
  }
  for (const f of data.lint) {
    const k = keyOf(f.project, f.file);
    if (!lintByKey.has(k)) lintByKey.set(k, []);
    lintByKey.get(k).push(f);
  }
  return { projects, mems, backlinks, lintByKey, ignored };
}

async function load({ force = false } = {}) {
  const btn = $('#refresh');
  btn.disabled = true;
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    const sig = JSON.stringify(data.projects) + JSON.stringify(data.lint);
    $('#scanned').textContent = `scanned ${new Date(data.scannedAt).toLocaleTimeString()}`;
    $('#scanned').title = data.root;
    // A focus-triggered refresh with nothing changed must not restart the graph layout.
    if (!force && sig === state.sig) return;
    state.data = data;
    state.sig = sig;
    idx = buildIndex(data);
    if (state.project !== ALL && !idx.projects.has(state.project)) state.project = ALL;
    render({ graph: true });
  } catch (e) {
    $('#view').innerHTML = `<div class="empty">Could not load memory data: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

async function setIgnored(id, ignored) {
  const res = await fetch('/api/ignore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ignored }) });
  if (!res.ok) {
    $('#scanned').textContent = `could not update the ignore list: ${res.status} ${await res.text()}`;
    return;
  }
  load();
}

// ---------- filtering ----------

const inScope = (pid) => (state.project === ALL ? !idx.ignored.has(pid) : pid === state.project);

const terms = () => state.q.toLowerCase().split(/\s+/).filter(Boolean);

function matches(m, ts) {
  if (!state.types.has(typeOf(m))) return false;
  if (!ts.length) return true;
  const hay = `${m.name || ''}\n${m.description || ''}\n${m.file}\n${m.body}`.toLowerCase();
  return ts.every((t) => hay.includes(t));
}

function scopeMemories() {
  return state.data.projects
    .filter((p) => inScope(p.id))
    .flatMap((p) => p.memories.map((m) => idx.mems.get(keyOf(p.id, m.file))));
}

function visibleMemories() {
  const ts = terms();
  const list = scopeMemories().filter((m) => matches(m, ts));
  if (state.sort === 'name') list.sort((a, b) => (a.name || a.file).localeCompare(b.name || b.file));
  else list.sort((a, b) => b.modified.localeCompare(a.modified));
  return list;
}

function highlight(text, ts) {
  let out = esc(text);
  for (const t of ts) {
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, (x) => `<mark>${x}</mark>`);
  }
  return out;
}

function snippet(body, ts) {
  const lower = body.toLowerCase();
  const at = Math.min(...ts.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return '';
  const start = Math.max(0, at - 60);
  return (start ? '…' : '') + body.slice(start, at + 100).replace(/\s+/g, ' ') + '…';
}

// ---------- rendering: sidebar ----------

function lintCounts(pid) {
  const c = { error: 0, warn: 0, info: 0 };
  for (const f of state.data.lint) if (pid === ALL ? !idx.ignored.has(f.project) : f.project === pid) c[f.severity]++;
  return c;
}

function badges(c) {
  return SEVERITIES.filter((s) => s !== 'info' && c[s]).map((s) => `<span class="badge ${s}" title="${c[s]} ${s}">${c[s]}</span>`).join('');
}

function projectRow(r) {
  return `<button class="proj${r.id === state.project ? ' active' : ''}${r.ignored ? ' ignored' : ''}" data-project="${esc(r.id)}" title="${esc(r.title)}">
    <span class="name">${esc(r.label)}</span><span class="count">${r.n}</span>${badges(lintCounts(r.id))}</button>`;
}

// Collapsed by default, but an ignored project that is selected keeps it open so
// the active row never disappears.
function ignoredSection(rows) {
  const open = ignoredOpen || rows.some((r) => r.id === state.project);
  return `<button id="ignored-toggle" class="ign-head" aria-expanded="${open}" title="Saved in ${esc(state.data.config.path)}">${open ? '▾' : '▸'} Ignored (${rows.length})</button>${open ? rows.map(projectRow).join('') : ''}`;
}

function renderProjects() {
  const row = (p) => ({ id: p.id, label: p.label, title: `${p.id}\n${p.dir}`, n: p.memories.length, ignored: p.ignored });
  const active = state.data.projects.filter((p) => !p.ignored);
  const ignored = state.data.projects.filter((p) => p.ignored);
  const all = { id: ALL, label: 'All projects', title: state.data.root, n: active.reduce((n, p) => n + p.memories.length, 0) };
  $('#projects').innerHTML =
    '<div class="nav-head">Projects</div>' +
    [all, ...active.map(row)].map(projectRow).join('') +
    (ignored.length ? ignoredSection(ignored.map(row)) : '');
  $('#projects .proj.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- rendering: toolbar ----------

function renderToolbar() {
  const tb = $('#toolbar');
  if (state.tab === 'lint') {
    tb.innerHTML = SEVERITIES.map((s) => `<button class="chip" data-sev="${s}" aria-pressed="${state.sev.has(s)}"><span class="sev ${s}">${s}</span></button>`).join('');
    return;
  }
  const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const m of scopeMemories()) counts[typeOf(m)]++;
  const chips = TYPES.filter((t) => counts[t])
    .map((t) => `<button class="chip" data-type="${t}" aria-pressed="${state.types.has(t)}"><span class="dot" style="background:${color(t)}"></span>${t} ${counts[t]}</button>`)
    .join('');
  const extra =
    state.tab === 'list'
      ? `<select id="sort" title="Sort"><option value="modified"${state.sort === 'modified' ? ' selected' : ''}>Newest</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>Name</option></select>`
      : `<button class="chip" id="labels" aria-pressed="${state.labels}">labels</button>`;
  tb.innerHTML = chips + extra;
}

// ---------- rendering: list ----------

function renderList() {
  const view = $('#view');
  view.className = 'view';
  const ts = terms();
  const list = visibleMemories();
  if (!list.length) {
    view.innerHTML = `<div class="empty">No memories match.</div>`;
    return;
  }
  view.innerHTML = list
    .map((m) => {
      const k = keyOf(m.pid, m.file);
      const lint = idx.lintByKey.get(k) || [];
      const c = { error: 0, warn: 0 };
      for (const f of lint) if (f.severity in c) c[f.severity]++;
      const inDesc = ts.length && ts.every((t) => `${m.name} ${m.description}`.toLowerCase().includes(t));
      const snip = ts.length && !inDesc ? snippet(m.body, ts) : '';
      const proj = state.project === ALL ? `${esc(idx.projects.get(m.pid).label)} · ` : '';
      return `<button class="mem${k === state.mem ? ' active' : ''}" data-key="${esc(k)}">
        <div class="row"><span class="dot" style="background:${color(typeOf(m))}" title="${esc(m.type || 'no type')}"></span>
          <span class="title">${highlight(m.name || m.file, ts)}</span>${badges(c)}</div>
        <div class="desc">${highlight(m.description || m.parseError || '', ts)}</div>
        ${snip ? `<div class="desc">${highlight(snip, ts)}</div>` : ''}
        <div class="meta">${proj}${esc(m.file)} · ${new Date(m.modified).toLocaleDateString()}</div>
      </button>`;
    })
    .join('');
  view.querySelector('.mem.active')?.scrollIntoView({ block: 'nearest' });
}

// ---------- rendering: lint ----------

function renderLint() {
  const view = $('#view');
  view.className = 'view';
  const findings = state.data.lint.filter((f) => state.sev.has(f.severity) && inScope(f.project));
  if (!findings.length) {
    view.innerHTML = `<div class="empty">No findings at the selected severities.</div>`;
    return;
  }
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.rule)) groups.set(f.rule, []);
    groups.get(f.rule).push(f);
  }
  const order = [...groups.entries()].sort((a, b) => SEVERITIES.indexOf(a[1][0].severity) - SEVERITIES.indexOf(b[1][0].severity) || b[1].length - a[1].length);
  view.innerHTML = order
    .map(
      ([rule, fs]) => `<details class="lint-group" open><summary><span class="sev ${fs[0].severity}">${fs[0].severity}</span><code>${esc(rule)}</code><span class="count">${fs.length}</span></summary>
      ${fs
        .map((f) => {
          const where = state.project === ALL ? `${idx.projects.get(f.project).label}/${f.file}` : f.file;
          return `<button class="finding" data-key="${esc(keyOf(f.project, f.file))}" title="${esc(where)}"><span class="f">${esc(where)}</span><span>${esc(f.message)}</span></button>`;
        })
        .join('')}</details>`,
    )
    .join('');
}

// ---------- rendering: graph ----------

let graph = null;
const positions = new Map();

function graphData() {
  const ts = terms();
  const mems = scopeMemories().filter((m) => matches(m, ts));
  const keys = new Set(mems.map((m) => keyOf(m.pid, m.file)));
  const nodes = mems.map((m) => ({ id: keyOf(m.pid, m.file), label: m.name || m.file, type: typeOf(m) }));
  const links = [];
  const ghosts = new Map();
  for (const m of mems) {
    const src = keyOf(m.pid, m.file);
    for (const l of m.links) {
      if (l.resolved) {
        const tgt = keyOf(m.pid, l.resolved);
        if (tgt !== src && keys.has(tgt)) links.push({ source: src, target: tgt, kind: l.how === 'name' ? 'ok' : 'loose' });
      } else {
        const g = `ghost:${m.pid}:${l.target}`;
        if (!ghosts.has(g)) ghosts.set(g, { id: g, label: `[[${l.target}]]`, type: 'ghost', ghost: true });
        links.push({ source: src, target: g, kind: 'broken' });
      }
    }
  }
  nodes.push(...ghosts.values());
  const degree = new Map();
  for (const l of links) for (const e of [l.source, l.target]) degree.set(e, (degree.get(e) || 0) + 1);
  for (const n of nodes) {
    n.degree = degree.get(n.id) || 0;
    const p = positions.get(n.id);
    if (p) Object.assign(n, { x: p.x, y: p.y });
  }
  return { nodes, links };
}

function renderGraph() {
  const view = $('#view');
  view.className = 'view graph' + (state.labels ? ' labels' : '');
  graph?.sim.stop();
  view.innerHTML = `<div class="legend">${TYPES.map((t) => `<span><span class="dot" style="background:${color(t)}"></span> ${t}</span>`).join('')}<span style="color:var(--error)">◌ broken</span></div>`;
  const { nodes, links } = graphData();
  if (!nodes.length) {
    view.insertAdjacentHTML('afterbegin', `<div class="empty">No memories match.</div>`);
    graph = null;
    return;
  }
  const { width, height } = view.getBoundingClientRect();
  const svg = d3.select(view).insert('svg', ':first-child').attr('viewBox', [-width / 2, -height / 2, width, height]);
  const root = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.1, 6]).on('zoom', (e) => root.attr('transform', e.transform));
  svg.call(zoom);

  const link = root.append('g').selectAll('line').data(links).join('line').attr('class', (d) => `link ${d.kind}`);
  const node = root
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', (d) => `node${d.ghost ? ' ghost' : ''}`)
    .on('click', (e, d) => !d.ghost && set({ mem: d.id }, { push: true }));
  node
    .append('circle')
    .attr('r', (d) => 4 + Math.sqrt(d.degree) * 2)
    .attr('fill', (d) => (d.ghost ? 'none' : color(d.type)));
  node
    .append('text')
    .attr('x', (d) => 7 + Math.sqrt(d.degree) * 2)
    .attr('dy', '0.32em')
    .text((d) => d.label);
  node.append('title').text((d) => d.label);

  const draw = () => {
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  };
  const sim = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(50))
    .force('charge', d3.forceManyBody().strength(-90))
    .force('x', d3.forceX().strength(0.06))
    .force('y', d3.forceY().strength(0.06))
    .force('collide', d3.forceCollide().radius((d) => 6 + Math.sqrt(d.degree) * 2))
    .on('tick', draw)
    .on('end', () => nodes.forEach((n) => positions.set(n.id, { x: n.x, y: n.y })));
  // Settle a fresh layout before the first paint so it can be framed to fit;
  // animating from a random start leaves half the nodes off-screen.
  sim.stop();
  if (!nodes.every((n) => positions.has(n.id))) {
    sim.tick(300);
    nodes.forEach((n) => positions.set(n.id, { x: n.x, y: n.y }));
  }
  draw();
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(2, 0.9 * Math.min(width / (x1 - x0 + 80 || 1), height / (y1 - y0 + 80 || 1)));
  svg.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));

  node.call(
    d3
      .drag()
      .on('start', (e, d) => {
        if (!e.active) sim.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (e, d) => {
        d.fx = e.x;
        d.fy = e.y;
      })
      .on('end', (e, d) => {
        if (!e.active) sim.alphaTarget(0);
        d.fx = d.fy = null;
      }),
  );
  graph = { sim, node, link };
  highlightGraph();
}

function highlightGraph() {
  if (!graph) return;
  const sel = state.mem;
  const nb = new Set();
  graph.link.classed('hl', (d) => {
    const hit = sel && (d.source.id === sel || d.target.id === sel);
    if (hit) nb.add(d.source.id).add(d.target.id);
    return hit;
  });
  graph.node
    .classed('sel', (d) => d.id === sel)
    .classed('nb', (d) => nb.has(d.id) && d.id !== sel)
    .classed('dim', (d) => sel && nb.size > 0 && !nb.has(d.id));
}

// ---------- rendering: detail ----------

let linkCtx = null;
marked.use({
  gfm: true,
  renderer: {
    // Memory bodies are local files, but escaping raw HTML keeps a stray tag from
    // breaking the layout or running script.
    html: ({ text }) => esc(text),
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^[a-z][a-z0-9+.-]*:/i.test(href);
      if (!external && /\.md$/.test(href) && linkCtx) {
        const file = href.replace(/^\.\//, '');
        const k = keyOf(linkCtx.pid, file);
        const cls = idx.mems.has(k) || file === INDEX ? 'wikilink' : 'wikilink broken';
        return `<a class="${cls}" href="#" data-key="${esc(k)}">${text}</a>`;
      }
      return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    },
  },
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src) => src.indexOf('[['),
      tokenizer(src) {
        const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
        if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim() };
      },
      renderer({ target }) {
        const l = linkCtx?.links.find((x) => x.target === target);
        if (!l?.resolved) return `<a class="wikilink broken" title="matches no memory">[[${esc(target)}]]</a>`;
        const cls = l.how === 'name' ? 'wikilink' : 'wikilink loose';
        const title = l.how === 'name' ? l.resolved : `${l.resolved} (matched by ${l.how === 'file' ? 'filename' : 'folded spelling'})`;
        return `<a class="${cls}" href="#" data-key="${esc(keyOf(linkCtx.pid, l.resolved))}" title="${esc(title)}">[[${esc(target)}]]</a>`;
      },
    },
  ],
});

function renderMarkdown(text, ctx) {
  linkCtx = ctx;
  try {
    return marked.parse(text);
  } finally {
    linkCtx = null;
  }
}

function memLink(k) {
  const m = idx.mems.get(k);
  return `<a href="#" data-key="${esc(k)}">${esc(m?.name || splitKey(k)[1])}</a>`;
}

function findingsList(fs) {
  if (!fs?.length) return '';
  return `<ul class="findings">${fs.map((f) => `<li><span class="sev ${f.severity}">${f.severity}</span>${esc(f.message)}</li>`).join('')}</ul>`;
}

function renderDetail() {
  const el = $('#detail');
  if (!state.mem) {
    const p = state.project !== ALL && idx.projects.get(state.project);
    el.innerHTML = p
      ? `<div class="crumbs">${esc(p.dir)}</div><h2>${esc(p.label)}</h2><p class="desc">${p.memories.length} memories. <a href="#" data-key="${esc(keyOf(p.id, INDEX))}">Open MEMORY.md</a></p>
        <p class="ignore-ctl">${
          p.ignored
            ? `<button data-ignore="${esc(p.id)}" data-ignored="false">Stop ignoring</button><span class="muted">Ignored: left out of All projects.</span>`
            : `<button data-ignore="${esc(p.id)}" data-ignored="true">Ignore project</button><span class="muted">Leaves it out of All projects, search and lint totals.</span>`
        }</p>`
      : `<p class="muted">Select a memory.</p>`;
    return;
  }
  const [pid, file] = splitKey(state.mem);
  const p = idx.projects.get(pid);
  if (!p) {
    el.innerHTML = `<p class="muted">Unknown project.</p>`;
    return;
  }
  if (file === INDEX) {
    el.innerHTML = `<div class="crumbs">${esc(p.label)}</div><h2>MEMORY.md</h2>${findingsList(idx.lintByKey.get(state.mem))}
      <div class="body">${p.index ? renderMarkdown(p.index.raw, { pid, links: [] }) : '<p class="muted">This project has no MEMORY.md.</p>'}</div>`;
    return;
  }
  const m = idx.mems.get(state.mem);
  if (!m) {
    el.innerHTML = `<div class="crumbs">${esc(p.label)}</div><p class="muted">${esc(file)} no longer exists.</p>`;
    return;
  }
  const metadata = { ...(m.frontmatter?.metadata || {}) };
  delete metadata.type;
  const kv = Object.entries({ type: m.type || '—', file: m.file, modified: m.modified, ...metadata })
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`)
    .join('');
  const out = [...new Set(m.links.filter((l) => l.resolved && l.resolved !== m.file).map((l) => keyOf(pid, l.resolved)))];
  const back = [...(idx.backlinks.get(state.mem) || [])];
  const rel = (title, ks) => (ks.length ? `<h3>${title} (${ks.length})</h3><ul>${ks.map((k) => `<li>${memLink(k)}</li>`).join('')}</ul>` : `<h3>${title}</h3><p class="muted">none</p>`);
  el.innerHTML = `
    <div class="crumbs"><a href="#" data-project="${esc(pid)}">${esc(p.label)}</a> / ${esc(m.file)}</div>
    <h2><span class="dot" style="background:${color(typeOf(m))}"></span> ${esc(m.name || m.file)}</h2>
    <p class="desc">${marked.parseInline(m.description || '')}</p>
    ${findingsList(idx.lintByKey.get(state.mem))}
    <dl class="kv">${kv}</dl>
    <div class="body">${renderMarkdown(m.body, m)}</div>
    <div class="rel">${rel('Links to', out)}${rel('Linked from', back)}</div>`;
  el.scrollTop = 0;
}

// ---------- top-level render ----------

let lastDetail = null;

function render({ graph: rebuildGraph = false } = {}) {
  if (!state.data) return;
  document.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  if ($('#search') !== document.activeElement) $('#search').value = state.q;
  renderProjects();
  renderToolbar();
  if (state.tab === 'list') renderList();
  else if (state.tab === 'lint') renderLint();
  else if (rebuildGraph || !graph || !$('#view svg')) renderGraph();
  else highlightGraph();
  const detailKey = `${state.mem}|${state.project}|${state.sig}`;
  if (detailKey !== lastDetail) {
    lastDetail = detailKey;
    renderDetail();
  }
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-key],[data-project],[data-ignore],[data-tab],[data-type],[data-sev],#labels,#refresh,#ignored-toggle');
  if (!t) return;
  if (t.matches('a')) e.preventDefault();
  if (t.id === 'refresh') return load({ force: true });
  if (t.id === 'ignored-toggle') {
    ignoredOpen = t.getAttribute('aria-expanded') !== 'true';
    return renderProjects();
  }
  if (t.id === 'labels') return set({ labels: !state.labels }, { graph: true });
  if (t.dataset.ignore) return setIgnored(t.dataset.ignore, t.dataset.ignored === 'true');
  if (t.dataset.tab) return set({ tab: t.dataset.tab }, { push: true });
  if (t.dataset.project) return set({ project: t.dataset.project, mem: null }, { push: true });
  if (t.dataset.type) {
    const types = new Set(state.types);
    types.has(t.dataset.type) ? types.delete(t.dataset.type) : types.add(t.dataset.type);
    return set({ types }, { graph: true });
  }
  if (t.dataset.sev) {
    const sev = new Set(state.sev);
    sev.has(t.dataset.sev) ? sev.delete(t.dataset.sev) : sev.add(t.dataset.sev);
    return set({ sev });
  }
  if (t.dataset.key) {
    set({ mem: t.dataset.key }, { push: true });
    // Stacked layout puts the detail below the list, out of sight.
    if (matchMedia('(max-width: 900px)').matches) $('#detail').scrollIntoView({ behavior: 'smooth' });
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') set({ sort: e.target.value });
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    set({ q: e.target.value.trim() }, { graph: true });
  }, 120);
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing) {
    e.preventDefault();
    $('#search').focus();
    $('#search').select();
  } else if (e.key === 'Escape' && typing) {
    document.activeElement.blur();
  } else if ((e.key === 'j' || e.key === 'k') && !typing && state.tab === 'list') {
    const list = visibleMemories().map((m) => keyOf(m.pid, m.file));
    if (!list.length) return;
    const i = list.indexOf(state.mem);
    const next = e.key === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    set({ mem: list[next] });
  }
});

window.addEventListener('popstate', () => {
  const prev = state.project;
  readHash();
  render({ graph: prev !== state.project });
});
window.addEventListener('focus', () => load());
window.addEventListener('resize', () => state.tab === 'graph' && renderGraph());

readHash();
load({ force: true });
