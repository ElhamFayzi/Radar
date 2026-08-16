/* Radar — coursework & deadline tracker (baseline front-end)
 * Vanilla JS, no build step. Rendering is full-redraw into #view-root:
 * change state, call render(). Swap in a framework later; the data model,
 * urgency computation and view markup below are the parts worth keeping.
 * ---------------------------------------------------------------- */

/* ── model ───────────────────────────────────────────────── */

const COURSES = {
  'CS 251':   '#7aa2f7',
  'MATH 340': '#6fcfb0',
  'PHIL 210': '#e0b060',
  'HIST 118': '#e0707c',
  'BIO 221':  '#9ac96a',
  'Personal': '#9b9fb5'
};

const TYPES     = ['Homework', 'Exam', 'Project', 'Reading', 'Paper', 'Other'];
const STATUSES  = ['Not Started', 'In Progress', 'Done'];
const REMINDERS = ['No reminder', 'Day of', '1 day before', '2 days before', '1 week before'];

const BAND_COLOR = { Critical: '#e05f6f', Urgent: '#e0904f', Watch: '#d9b25f', Calm: '#8fd6b4', Done: '#9397ab' };
const BAND_ICON  = { Critical: '▲', Urgent: '◆', Watch: '●', Calm: '○', Done: '✓' };
const OVERDUE    = '#e05f6f';

/* Workload → estimated hours, and the working window a lane block spans. */
const WORKLOAD_HOURS = { Light: 1.5, Moderate: 3.5, Heavy: 7 };
const WORKLOAD_DAYS  = { Light: 1,   Moderate: 2,   Heavy: 3 };

/* `off` is a day offset from today, so the seed data never goes stale.
 * A real backend would send an ISO due date; see toOffset()/toISO(). */
const SEED = [
  task(1,  'CS 251',   'Problem Set 6 — heaps & tries',    'Homework', -1, '23:59', 'High',   'Moderate', 8,    'In Progress', { subtasks: [s('Part A: heapify proof', true), s('Part B: trie insert')], notes: 'Submit on Gradescope' }),
  task(2,  'HIST 118', 'Response paper: Reconstruction',   'Paper',     0, '17:00', 'Medium', 'Moderate', 10,   'In Progress'),
  task(3,  'BIO 221',  'Chapter 9 reading + quiz',         'Reading',   1, '09:00', 'Low',    'Light',    2,    'Not Started', { recurring: true }),
  task(4,  'MATH 340', 'Midterm 1 (Ch. 1–4)',              'Exam',      3, '10:30', 'High',   'Heavy',    25,   'In Progress', { subtasks: [s('Redo PS 1–3', true), s('Practice exam'), s('Office hours Weds')], spent: 4.5 }),
  task(5,  'CS 251',   'Project 2 — B-tree index',         'Project',   5, '23:59', 'High',   'Heavy',    20,   'Not Started', { subtasks: [s('Design doc'), s('Split/merge')], notes: 'Pairs allowed' }),
  task(6,  'PHIL 210', 'Weekly discussion post',           'Homework',  2, '22:00', 'Low',    'Light',    3,    'Not Started', { recurring: true }),
  task(7,  'Personal', 'Renew passport — photo + form',    'Other',     6, '12:00', 'Medium', 'Light',    null, 'Not Started'),
  task(8,  'MATH 340', 'PS 5 — eigenvectors',              'Homework',  4, '23:59', 'Medium', 'Moderate', 6,    'Not Started', { recurring: true }),
  task(9,  'PHIL 210', 'Essay 2 draft: Rawls',             'Paper',     9, '23:59', 'Medium', 'Heavy',    15,   'Not Started'),
  task(10, 'BIO 221',  'Lab report — gel electrophoresis', 'Homework',  7, '20:00', 'Medium', 'Moderate', 7,    'Not Started'),
  task(11, 'HIST 118', 'Primary source annotations',       'Reading',   8, '23:59', 'Low',    'Light',    4,    'Not Started', { recurring: true }),
  task(12, 'CS 251',   'Quiz 4 — hashing',                 'Exam',     11, '09:30', 'Medium', 'Light',    5,    'Not Started'),
  task(13, 'Personal', 'TA shift swap request',            'Other',     2, '18:00', 'Low',    'Light',    null, 'Not Started'),
  task(14, 'BIO 221',  'Exam 2',                           'Exam',     15, '08:00', 'High',   'Heavy',    22,   'Not Started'),
  task(15, 'MATH 340', 'PS 6 — diagonalization',           'Homework', 11, '23:59', 'Medium', 'Moderate', 6,    'Not Started', { recurring: true }),
  task(16, 'HIST 118', 'Term paper proposal',              'Paper',    13, '23:59', 'High',   'Moderate', 10,   'Not Started'),
  task(17, 'CS 251',   'Problem Set 5 — graphs',           'Homework', -6, '23:59', 'High',   'Moderate', 8,    'Done', { spent: 6 }),
  task(18, 'PHIL 210', 'Essay 1: utilitarian calculus',    'Paper',    -9, '23:59', 'High',   'Heavy',    15,   'Done', { spent: 9.5 }),
  task(19, 'BIO 221',  'Chapter 8 reading',                'Reading',  -3, '09:00', 'Low',    'Light',    2,    'Done', { recurring: true, spent: 1 }),
  task(20, 'MATH 340', 'PS 4 — determinants',              'Homework', -4, '23:59', 'Medium', 'Moderate', 6,    'Done', { spent: 3 })
];

function task(id, course, name, type, off, time, priority, workload, weight, status, extra) {
  return Object.assign({
    id, course, name, type, off, time, priority, workload, weight, status,
    notes: '', subtasks: [], recurring: false, reminder: '2 days before', spent: 0
  }, extra || {});
}
function s(text, done) { return { text, done: !!done }; }

const state = {
  view: 'dashboard',
  tlMode: 'week',
  tasks: SEED,
  filters: { Course: 'All', Type: 'All', Priority: 'All', Status: 'All', Urgency: 'All' },
  sortKey: 'due', sortDir: 1,
  quick: '',
  modal: false, editingId: null, form: null, subtaskDraft: '',
  dragId: null, dragOver: null
};

/* ── dates & derived fields ──────────────────────────────── */

const DOW  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON  = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function dateFor(off) { const d = today(); d.setDate(d.getDate() + off); return d; }
function fmt(off) { const d = dateFor(off); return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; }
function toISO(off) { const d = dateFor(off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function toOffset(iso) {
  const p = (iso || '').split('-'); if (p.length < 3) return 0;
  const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setHours(0, 0, 0, 0);
  return Math.round((d - today()) / 86400000);
}
function time12(t) {
  const [hh, mm] = (t || '23:59').split(':');
  let h = +hh; const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  return `${h}:${mm}${ap}`;
}

/* Urgency: due-date proximity dominates, priority and workload adjust it.
 * Deliberately allowed to disagree with priority — a Low-priority reading
 * due tomorrow outranks a High-priority paper three weeks out. */
function enrich(t) {
  const overdue = t.off < 0 && t.status !== 'Done';
  let score;
  if (t.status === 'Done') score = 0;
  else if (overdue) score = 100;
  else score = Math.max(0, 100 - t.off * 11) * 0.7
             + ({ High: 20, Medium: 9, Low: 0 })[t.priority]
             + ({ Heavy: 14, Moderate: 6, Light: 0 })[t.workload];
  score = Math.max(0, Math.min(100, Math.round(score)));

  const band = t.status === 'Done' ? 'Done'
    : score >= 80 ? 'Critical' : score >= 58 ? 'Urgent' : score >= 34 ? 'Watch' : 'Calm';
  const rel = t.status === 'Done' ? 'completed'
    : t.off < 0 ? (t.off === -1 ? '1 day overdue' : `${-t.off} days overdue`)
    : t.off === 0 ? 'today' : t.off === 1 ? 'tomorrow' : `${t.off} days left`;

  return Object.assign({}, t, {
    overdue, score, band, rel,
    color: COURSES[t.course] || COURSES.Personal,
    dueLabel: fmt(t.off), dueTime: time12(t.time), hoursEst: WORKLOAD_HOURS[t.workload]
  });
}

const all      = () => state.tasks.map(enrich);
const active   = () => all().filter(t => t.status !== 'Done');
const overdues = () => active().filter(t => t.overdue);

function filtered() {
  const f = state.filters;
  return active().filter(t => {
    if (f.Course   !== 'All' && t.course   !== f.Course)   return false;
    if (f.Type     !== 'All' && t.type     !== f.Type)     return false;
    if (f.Priority !== 'All' && t.priority !== f.Priority) return false;
    if (f.Status   !== 'All' && t.status   !== f.Status)   return false;
    if (f.Urgency === 'Overdue') return t.overdue;
    if (f.Urgency !== 'All' && t.band !== f.Urgency)       return false;
    return true;
  });
}

/* ── small view helpers ──────────────────────────────────── */

const esc = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const courseTag = t => `<span class="tag-course" style="--c:${t.color}">${esc(t.course)}</span>`;
const bandTag   = (t, sm) => `<span class="band${sm ? ' sm' : ''}" style="--c:${BAND_COLOR[t.band]}">${BAND_ICON[t.band]} ${t.band}</span>`;
const statusTag = t => `<span class="status" style="--c:${t.status === 'Done' ? '#8fd6b4' : t.status === 'In Progress' ? '#9184d9' : '#9397ab'}">${t.status}</span>`;
const prioTag   = t => {
  const c = { High: 'var(--color-text)', Medium: 'color-mix(in srgb,var(--color-text) 72%,transparent)', Low: 'color-mix(in srgb,var(--color-text) 45%,transparent)' }[t.priority];
  const b = { High: '.3', Medium: '.16', Low: '.08' }[t.priority];
  return `<span class="prio" style="--pc:${c};--pb:color-mix(in srgb,var(--color-text) ${(+b * 100)}%,transparent)">${t.priority}</span>`;
};
const loadTag   = t => `<span class="load"><span class="load-bar" style="--fill:${WORKLOAD_DAYS[t.workload] * 33}%"></span>${t.workload}</span>`;
const dueRel    = t => `<div class="due-rel" style="--c:${t.overdue ? OVERDUE : (t.off <= 1 && t.status !== 'Done') ? '#e0904f' : 'color-mix(in srgb,var(--color-text) 45%,transparent)'}">${t.rel}</div>`;

const FILTER_DEFS = [
  ['Course',   ['All', ...Object.keys(COURSES)]],
  ['Type',     ['All', ...TYPES]],
  ['Priority', ['All', 'High', 'Medium', 'Low']],
  ['Status',   ['All', ...STATUSES]],
  ['Urgency',  ['All', 'Overdue', 'Critical', 'Urgent', 'Watch', 'Calm']]
];

function filterBar(trailing) {
  return `<div class="filters">
    ${FILTER_DEFS.map(([label, opts]) => `<label>${label}
      <select class="input" data-filter="${label}">
        ${opts.map(o => `<option${o === state.filters[label] ? ' selected' : ''}>${o}</option>`).join('')}
      </select></label>`).join('')}
    <button type="button" class="btn btn-ghost" data-action="reset-filters">Reset</button>
    <span style="margin-left:auto" class="muted-sm">${trailing}</span>
  </div>`;
}

/* ── views ───────────────────────────────────────────────── */

function viewDashboard() {
  const week = active().filter(t => t.off >= 0 && t.off <= 6);
  const hrs  = Math.round(week.reduce((a, t) => a + t.hoursEst, 0) * 10) / 10;
  const od   = overdues();

  const soon = active().filter(t => t.off >= 0 && t.off <= 1);
  const soonHrs = Math.round(soon.reduce((a, t) => a + t.hoursEst, 0) * 10) / 10;

  const stats = [
    ['Due within 48 hrs', soon.length, soon.length === 1 ? 'task' : 'tasks',
      soon.length ? `${soonHrs} hrs of work` : 'Nothing imminent',
      soon.length ? '#e0904f' : '#8fd6b4'],
    ['Due this week', week.length, 'tasks', `${new Set(week.map(t => t.course)).size} courses affected`, ''],
    ['Overdue', od.length, od.length === 1 ? 'task' : 'tasks', od.length ? `Oldest: ${od[0].rel}` : 'All clear', od.length ? OVERDUE : '#8fd6b4'],
    ['Estimated workload', hrs, 'hrs this week', `≈ ${Math.round(hrs / 7 * 10) / 10} hrs/day`, '']
  ];

  const top = active().slice()
    .sort((a, b) => (b.score + (b.weight || 0) * 0.8) - (a.score + (a.weight || 0) * 0.8))
    .slice(0, 5);

  const bars = [0, 1, 2, 3, 4, 5, 6].map(off => {
    const h = active().filter(t => t.off === off).reduce((a, t) => a + t.hoursEst, 0);
    const c = h >= 7 ? 'var(--color-accent)' : h >= 3.5 ? 'color-mix(in srgb,var(--color-accent) 70%,transparent)'
            : h > 0 ? 'color-mix(in srgb,var(--color-accent) 42%,transparent)' : 'color-mix(in srgb,var(--color-text) 10%,transparent)';
    return `<div class="week-day">
      <span>${h || ''}</span>
      <div class="week-bar" style="--h:${Math.max(3, Math.min(56, h * 8))}px;--c:${c}"></div>
      <span${off === 0 ? ' style="color:var(--color-accent-400)"' : ''}>${['S','M','T','W','T','F','S'][dateFor(off).getDay()]}</span>
    </div>`;
  }).join('');

  return `<div class="dash">
    <div class="stat-grid">
      ${stats.map(([label, value, unit, note, c]) => `<div class="card elev-sm stat">
        <div class="stat-label">${label}</div>
        <div><span class="stat-value"${c ? ` style="--c:${c}"` : ''}>${value}</span> <span class="muted-sm">${unit}</span></div>
        <div class="muted-sm">${note}</div>
      </div>`).join('')}
    </div>

    <div class="dash-cols">
      <section class="card elev-sm panel">
        <div style="display:flex;align-items:baseline;gap:8px">
          <h5>On the radar</h5><span class="muted-sm">urgency × weight, next 5</span>
        </div>
        <div>${top.map(t => `<div class="urgent-row">
          <span class="urgent-stripe" style="--c:${t.color}"></span>
          <div class="urgent-main">
            <div class="urgent-name">${esc(t.name)}</div>
            <div class="muted-sm">${esc(t.course)} · ${t.type} · ${t.weight ? t.weight + '%' : '—'}</div>
          </div>
          <div style="text-align:right">${dueRel(t)}<div class="muted-sm">${t.dueLabel}</div></div>
          ${bandTag(t)}
        </div>`).join('')}</div>
      </section>

      <div style="display:flex;flex-direction:column;gap:var(--space-6)">
        <section class="card elev-sm panel">
          <h5>This week's load</h5>
          <div class="week-bars">${bars}</div>
          <div class="muted-sm">Estimated hours per day from workload tags.</div>
        </section>
        <section class="card elev-sm panel">
          <h5>Open a view</h5>
          ${[['table', 'Table', `${active().length} active rows`],
             ['kanban', 'Kanban', `${active().filter(t => t.status === 'In Progress').length} in progress`],
             ['timeline', 'Timeline', 'next 7 days']]
            .map(([v, label, hint]) => `<button type="button" class="view-link" data-action="view" data-view="${v}">
              <span class="nav-label">${label}</span><span class="muted-sm">${hint}</span></button>`).join('')}
        </section>
      </div>
    </div>
  </div>`;
}

const COLUMNS = [['name','Assignment'],['course','Course'],['type','Type'],['due','Due'],['priority','Priority'],
                 ['workload','Workload'],['weight','Weight'],['urgency','Urgency'],['status','Status']];

function sortValue(t, k) {
  const rank = { priority: { High: 3, Medium: 2, Low: 1 }, workload: { Heavy: 3, Moderate: 2, Light: 1 },
                 status: { 'Not Started': 1, 'In Progress': 2, Done: 3 } };
  switch (k) {
    case 'due': return t.off;
    case 'urgency': return t.score;
    case 'weight': return t.weight || 0;
    case 'priority': case 'workload': case 'status': return rank[k][t[k === 'status' ? 'status' : k]];
    default: return t[k];
  }
}

function viewTable() {
  const rows = filtered().sort((a, b) => {
    const x = sortValue(a, state.sortKey), y = sortValue(b, state.sortKey);
    return (x > y ? 1 : x < y ? -1 : 0) * state.sortDir;
  });

  return `<div class="view-pad">
    ${filterBar(`${rows.length} of ${active().length} active`)}
    <div class="table-scroll"><table class="table">
      <thead><tr>
        <th style="width:4px;padding:0"></th>
        ${COLUMNS.map(([k, label]) => `<th data-sort="${k}"${state.sortKey === k ? ' aria-sort="true"' : ''}>${label}${state.sortKey === k ? (state.sortDir > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}
        <th style="width:96px"></th>
      </tr></thead>
      <tbody>${rows.map(t => `<tr>
        <td class="stripe-cell" style="--c:${t.color}"></td>
        <td><span class="row-name${t.overdue ? ' is-over' : ''}">${esc(t.name)}</span>
          ${t.recurring ? ' <span class="muted-sm" title="Repeats weekly">↻</span>' : ''}
          ${t.subtasks.length ? ` <span class="sub-count">${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>` : ''}</td>
        <td>${courseTag(t)}</td>
        <td class="muted-sm">${t.type}</td>
        <td>${t.dueLabel} <span class="muted-sm">${t.dueTime}</span>${dueRel(t)}</td>
        <td>${prioTag(t)}</td>
        <td>${loadTag(t)}</td>
        <td class="muted-sm">${t.weight ? t.weight + '%' : '—'}</td>
        <td>${bandTag(t)}</td>
        <td>${statusTag(t)}</td>
        <td class="row-actions">
          <button class="btn btn-icon" data-action="toggle-done" data-id="${t.id}" title="Mark done">✓</button>
          <button class="btn btn-icon" data-action="edit" data-id="${t.id}" title="Edit">✎</button>
          <button class="btn btn-icon" data-action="delete" data-id="${t.id}" title="Delete">🗑</button>
        </td></tr>`).join('')}</tbody>
    </table></div>
    ${rows.length ? '' : '<div class="empty">Nothing matches these filters.</div>'}
  </div>`;
}

function viewKanban() {
  const od = overdues();
  const cols = STATUSES.map(status => {
    const list = status === 'Done'
      ? all().filter(t => t.status === 'Done').slice(-4)
      : filtered().filter(t => t.status === status);
    const dot = status === 'Done' ? '#8fd6b4' : status === 'In Progress' ? '#9184d9' : '#75798c';
    return `<section class="kcol${state.dragOver === status ? ' is-over' : ''}" data-drop="${status}">
      <div class="kcol-head">
        <span class="kcol-dot" style="--c:${dot}"></span>
        <span style="font-weight:500">${status}</span><span class="muted-sm">${list.length}</span>
        <button class="btn btn-ghost" data-action="add-task" style="margin-left:auto">+</button>
      </div>
      <div class="kcol-body">${list.map(t => `<article class="kcard${t.status === 'Done' ? ' done' : ''}" draggable="true"
          data-card="${t.id}" style="--c:${t.overdue ? OVERDUE : t.color}">
        <div style="display:flex;align-items:center;gap:6px">
          ${courseTag(t)}
          ${t.overdue ? `<span class="over-flag">▲ Overdue</span>` : ''}
          <span class="band-dot" style="--c:${BAND_COLOR[t.band]}" title="${t.band}"></span>
        </div>
        <div class="kcard-name">${esc(t.name)}</div>
        ${dueRel(Object.assign({}, t, { rel: `${t.dueLabel} · ${t.rel}` }))}
        <div class="kcard-foot">${prioTag(t)}${loadTag(t)}${bandTag(t, true)}</div>
      </article>`).join('')}</div>
    </section>`;
  }).join('');

  return `<div class="view-pad">
    ${filterBar('Drag a card between columns to change its status')}
    ${od.length ? `<div class="overdue-banner" style="--c-over:${OVERDUE}">
      <span>▲</span><span>${od.length} ${od.length === 1 ? 'item is' : 'items are'} past due and not marked done — ${od.map(t => esc(t.name)).join(', ')}</span>
      <button class="btn btn-ghost" data-action="filter-overdue" style="margin-left:auto">Show only overdue</button>
    </div>` : ''}
    <div class="kanban">${cols}</div>
  </div>`;
}

/* Timeline — day columns (rolling 7 / full 4 weeks) plus course lanes. */
const LANE_SPAN = 28, LANE_DAY_W = 58;

function viewTimeline() {
  const span = state.tlMode === 'week' ? 7 : LANE_SPAN;
  const act = active();

  const cols = Array.from({ length: span }, (_, off) => {
    const d = dateFor(off);
    const list = act.filter(t => off === 0 ? t.off <= 0 : t.off === off);
    const h = list.reduce((a, t) => a + t.hoursEst, 0);
    const heat = h ? `color-mix(in srgb,var(--color-accent) ${Math.round(18 + Math.min(1, h / 8) * 82)}%, color-mix(in srgb,var(--color-text) 6%,transparent))`
                   : 'color-mix(in srgb,var(--color-text) 6%,transparent)';
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return `<div class="tl-col${off === 0 ? ' today' : weekend ? ' weekend' : ''}">
      <div class="tl-col-head">
        <div class="tl-dow">${DOW[d.getDay()]}</div>
        <div class="tl-date">${(d.getDate() === 1 || off === 0) ? MON[d.getMonth()] + ' ' : ''}${d.getDate()}</div>
      </div>
      <div class="tl-heat" style="--c:${heat}" title="${h ? h + ' hrs est.' : 'clear'}"></div>
      <div class="tl-body">${list.map(t => `<div class="tl-block" style="--c:${t.overdue ? OVERDUE : t.color}" title="${esc(t.name)}">
        <div class="tl-block-name">${esc(t.name)}</div>
        <div class="tl-block-meta"><span>${t.dueTime}</span><span>·</span><span class="course">${esc(t.course)}</span></div>
        ${(t.band === 'Critical' || t.band === 'Urgent' || t.overdue) ? bandTag(t, true) : ''}
      </div>`).join('')}</div>
      <div class="tl-foot${h >= 7 ? ' heavy' : ''}">${h ? h + ' hrs est.' : 'clear'}</div>
    </div>`;
  }).join('');

  return `<div class="view-pad">
    <div class="tl-head">
      <div class="seg">
        ${[['week', 'Rolling 7 days'], ['full', 'Full timeline']].map(([m, label]) => `<label class="seg-opt">
          <input type="radio" name="tlmode" value="${m}"${state.tlMode === m ? ' checked' : ''}>${label}</label>`).join('')}
      </div>
      <span class="muted-sm">${state.tlMode === 'week'
        ? 'Today anchors the left edge and rolls forward each day.'
        : 'Four weeks out — scroll right. Overdue items stack on today.'}</span>
    </div>
    <div class="tl-scroll"><div class="tl-track ${state.tlMode}">${cols}</div></div>
    ${courseLanes()}
  </div>`;
}

/* One lane per course over 4 weeks. A block spans the estimated working
 * window ending on the due date; overlapping blocks pack into sub-rows. */
function courseLanes() {
  const act = active().filter(t => t.off < LANE_SPAN);
  const trackW = LANE_SPAN * LANE_DAY_W;

  const ticks = Array.from({ length: LANE_SPAN }, (_, off) =>
    `<span class="lane-tick${off === 0 ? ' today' : ''}" style="width:${LANE_DAY_W}px">${off % 2 === 0 ? dateFor(off).getDate() : ''}</span>`).join('');

  const heat = Array.from({ length: LANE_SPAN }, (_, off) => {
    const h = act.filter(t => off === 0 ? t.off <= 0 : t.off === off).reduce((a, t) => a + t.hoursEst, 0);
    const c = h ? `color-mix(in srgb,var(--color-accent) ${Math.round(16 + Math.min(1, h / 8) * 84)}%, color-mix(in srgb,var(--color-text) 5%,transparent))`
                : 'color-mix(in srgb,var(--color-text) 5%,transparent)';
    return `<span class="lane-heat" style="width:${LANE_DAY_W - 2}px;margin-right:2px;--c:${c}" title="${fmt(off)} — ${h ? h + ' hrs est.' : 'clear'}"></span>`;
  }).join('');

  const lanes = Object.keys(COURSES).map(name => {
    const blocks = act.filter(t => t.course === name).map(t => {
      const end = Math.max(0, t.off), start = Math.max(0, end - WORKLOAD_DAYS[t.workload] + 1);
      return { t, left: start * LANE_DAY_W, width: (end - start + 1) * LANE_DAY_W - 3 };
    }).sort((a, b) => a.left - b.left);
    if (!blocks.length) return '';

    const rowEnds = [];
    blocks.forEach(b => {
      let r = rowEnds.findIndex(end => b.left >= end + 4);
      if (r < 0) { r = rowEnds.length; rowEnds.push(0); }
      rowEnds[r] = b.left + b.width; b.row = r;
    });
    const height = Math.max(1, rowEnds.length) * 30 + 8;

    return `<div class="lane-row">
      <div class="lane-label" style="min-height:${height}px">
        <span class="course-swatch" style="--c:${COURSES[name]};height:15px;width:3px"></span>
        <span style="min-width:0"><span class="lane-name">${name}</span>
        <span class="lane-count">${blocks.length} ${blocks.length === 1 ? 'item' : 'items'}</span></span>
      </div>
      <div class="lane-track" style="width:${trackW}px;height:${height}px">
        ${blocks.map(({ t, left, width, row }) => {
          const flag = t.overdue || t.band === 'Critical';
          return `<div class="lane-block${flag ? ' flag' : ''}"
            style="left:${left}px;width:${width}px;top:${6 + row * 30}px;--c:${t.color};--f:${t.overdue ? OVERDUE : 'rgba(224,144,79,.7)'}"
            title="${esc(t.name)} — due ${t.dueLabel} ${t.dueTime} · ${t.band}">
            <span class="lane-bar" style="--c:${t.overdue ? OVERDUE : t.color}"></span>
            <span class="lane-block-name">${esc(t.name)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="lanes">
    <div class="lanes-head"><h5>Course lanes</h5>
      <span class="muted-sm">next 4 weeks · ${fmt(0)} — ${fmt(LANE_SPAN - 1)} — block length is the estimated working window ending on the due date</span>
    </div>
    <div class="lanes-scroll">
      <div class="lane-ticks"><span class="lane-gutter" style="height:16px"></span><div style="display:flex">${ticks}</div></div>
      ${lanes}
      <div class="lane-heat-row"><span class="lane-gutter">Workload</span><div style="display:flex">${heat}</div></div>
    </div>
    <div class="lanes-note">Shading is total estimated hours due that day — darker bands mark clustering. Outlined blocks are overdue or critical.</div>
  </div>`;
}

function viewArchive() {
  const done = all().filter(t => t.status === 'Done');
  return `<div class="view-pad" style="max-width:860px">
    <div class="muted-sm" style="margin-bottom:12px">Completed work, kept out of the active views. Restore anything you marked done by mistake.</div>
    ${done.map(t => `<div class="archive-row">
      <span style="color:#8fd6b4">✓</span>${courseTag(t)}
      <span class="archive-name">${esc(t.name)}</span>
      <span class="muted-sm">${t.spent ? t.spent + ' hrs logged' : '—'}</span>
      <span class="muted-sm">${t.dueLabel}</span>
      <button class="btn btn-ghost" data-action="restore" data-id="${t.id}">Restore</button>
    </div>`).join('')}
  </div>`;
}

/* ── add / edit dialog ───────────────────────────────────── */

function blankForm() {
  return { name: '', course: 'CS 251', type: 'Homework', date: toISO(2), time: '23:59',
           priority: 'Medium', workload: 'Moderate', weight: '', status: 'Not Started',
           reminder: '2 days before', recurring: false, notes: '', subtasks: [] };
}

function renderModal() {
  const root = document.getElementById('modal-root');
  if (!state.modal) { root.innerHTML = ''; return; }
  const f = state.form;
  const preview = enrich({ ...f, off: toOffset(f.date), weight: +f.weight || null, subtasks: f.subtasks });
  const sel = (name, opts, value) => `<select class="input" data-form="${name}">${opts.map(o => `<option${o === value ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  const choices = (name, opts) => `<div class="choice-row">${opts.map(o =>
    `<button type="button" class="choice" data-choice="${name}" data-value="${o}" aria-pressed="${f[name] === o}">${o}</button>`).join('')}</div>`;

  root.innerHTML = `<div class="dialog-backdrop" data-action="close-modal">
    <div class="dialog elev-lg task-dialog" data-stop>
      <div class="dialog-head">
        <span class="dialog-title">${state.editingId ? 'Edit task' : 'New task'}</span>
        <button class="btn btn-icon" data-action="close-modal" style="margin-left:auto">✕</button>
      </div>
      <div class="dialog-scroll">
        <div class="group-kicker">Basics</div>
        <div class="form-grid">
          <div class="field span-2"><label>Assignment name</label>
            <input class="input" data-form="name" value="${esc(f.name)}" placeholder="Problem Set 6"></div>
          <div class="field"><label>Course</label>${sel('course', Object.keys(COURSES), f.course)}</div>
          <div class="field"><label>Type</label>${sel('type', TYPES, f.type)}</div>
          <div class="field"><label>Due date</label><input class="input" type="date" data-form="date" value="${f.date}"></div>
          <div class="field"><label>Due time</label><input class="input" type="time" data-form="time" value="${f.time}"></div>
        </div>
        <hr class="hr">
        <div class="group-kicker">Details</div>
        <div class="form-grid">
          <div class="field"><label>Priority</label>${choices('priority', ['Low', 'Medium', 'High'])}</div>
          <div class="field"><label>Estimated workload</label>${choices('workload', ['Light', 'Moderate', 'Heavy'])}</div>
          <div class="field"><label>Weight (% of grade)</label><input class="input" data-form="weight" value="${esc(f.weight)}" placeholder="15"></div>
          <div class="field"><label>Status</label>${sel('status', STATUSES, f.status)}</div>
          <div class="field"><label>Reminder lead time</label>${sel('reminder', REMINDERS, f.reminder)}</div>
          <div class="field"><label>Repeat</label>
            <label class="radio" style="min-height:36px"><input type="checkbox" data-form="recurring"${f.recurring ? ' checked' : ''}>
              <span class="dot" style="border-radius:4px"></span><span>Weekly</span></label></div>
          <div class="field span-2"><label>Notes — links welcome</label>
            <textarea class="input" data-form="notes" placeholder="Rubric, readings, submission link…" style="min-height:64px">${esc(f.notes)}</textarea></div>
          <div class="field span-2"><label>Subtasks</label>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${f.subtasks.map((s, i) => `<label class="subtask${s.done ? ' done' : ''}">
                <input type="checkbox" data-subtask="${i}"${s.done ? ' checked' : ''}>
                <span class="dot" style="border-radius:4px"></span><span>${esc(s.text)}</span></label>`).join('')}
              <input class="input" id="subtask-draft" placeholder="Add a subtask, press ⏎" style="font-size:13px">
            </div></div>
        </div>
      </div>
      <div class="dialog-foot">
        ${bandTag(preview)}
        <span class="muted-sm">Urgency ${preview.score}/100 — computed from due date, priority and workload.</span>
        <button class="btn btn-secondary" data-action="close-modal" style="margin-left:auto">Cancel</button>
        <button class="btn btn-primary" data-action="save-task">${state.editingId ? 'Save changes' : 'Add task'}</button>
      </div>
    </div></div>`;
}

function saveTask() {
  const f = state.form;
  const rec = { course: f.course, name: f.name || 'Untitled task', type: f.type, off: toOffset(f.date),
                time: f.time, priority: f.priority, workload: f.workload,
                weight: f.weight === '' ? null : +f.weight, status: f.status, notes: f.notes,
                subtasks: f.subtasks, recurring: f.recurring, reminder: f.reminder, spent: 0 };
  state.tasks = state.editingId
    ? state.tasks.map(t => t.id === state.editingId ? { ...t, ...rec } : t)
    : state.tasks.concat([{ id: Date.now(), ...rec }]);
  state.modal = false; state.editingId = null;
  render();
}

/* ── quick add (natural language) ────────────────────────── */

function parseQuick(q) {
  if (!q.trim()) return null;
  let rest = ' ' + q + ' ';
  const out = { course: null, name: null, date: null, time: null, workload: null, priority: null };

  const cm = rest.match(/\b([A-Za-z]{2,4})\s?(\d{3})\b/);
  if (cm) { const key = `${cm[1].toUpperCase()} ${cm[2]}`; if (COURSES[key]) out.course = key; rest = rest.replace(cm[0], ' '); }

  const wm = rest.match(/\b(heavy|moderate|light)\b/i);
  if (wm) { out.workload = cap(wm[1]); rest = rest.replace(wm[0], ' '); }

  const pm = rest.match(/\b(high|medium|low)\s*(priority)?\b/i);
  if (pm) { out.priority = cap(pm[1]); rest = rest.replace(pm[0], ' '); }

  const tm = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i);
  if (tm) { let h = +tm[1] % 12; if (/pm/i.test(tm[3])) h += 12; out.time = `${String(h).padStart(2, '0')}:${tm[2] || '00'}`; rest = rest.replace(tm[0], ' '); }

  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dm = rest.match(/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (dm) {
    const w = dm[1].toLowerCase();
    out.date = w === 'today' ? 0 : w === 'tomorrow' ? 1 : ((days.indexOf(w) - today().getDay() + 7) % 7 || 7);
    rest = rest.replace(dm[0], ' ');
  }
  rest = rest.replace(/\bdue\b/i, ' ').replace(/\s+/g, ' ').trim();
  out.name = rest ? cap(rest) : null;
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function renderParseBar() {
  const bar = document.getElementById('parse-bar');
  const p = parseQuick(state.quick);
  if (!p) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  const chips = [
    ['Course', p.course || 'Personal'], ['Assignment', p.name || '—'],
    ['Due', `${p.date == null ? 'in 2 days' : fmt(p.date)} ${time12(p.time || '23:59')}`],
    ['Workload', p.workload || 'Moderate'], ['Priority', p.priority || 'Medium']
  ];
  bar.innerHTML = `<span class="parse-kicker">Parsed</span>
    <div class="parse-chips">${chips.map(([l, v]) => `<span class="chip"><b>${l}</b> ${esc(v)}</span>`).join('')}</div>
    <button class="btn btn-secondary" data-action="quick-clear">Discard</button>
    <button class="btn btn-primary" data-action="quick-confirm">Confirm ⏎</button>
    <button class="btn btn-ghost" data-action="quick-to-form">Edit in form</button>`;
}

function commitQuick() {
  const p = parseQuick(state.quick);
  if (!p) return;
  state.tasks = state.tasks.concat([task(Date.now(), p.course || 'Personal', p.name || 'Untitled task',
    'Homework', p.date == null ? 2 : p.date, p.time || '23:59', p.priority || 'Medium',
    p.workload || 'Moderate', null, 'Not Started')]);
  state.quick = '';
  document.getElementById('quick').value = '';
  render();
}

/* ── shell render ────────────────────────────────────────── */

const NAV = [['dashboard', 'Dashboard', '▤'], ['table', 'Table', '≡'], ['kanban', 'Kanban', '▥'], ['timeline', 'Timeline', '⌁']];
const TITLES = {
  dashboard: ['Dashboard', 'Overview — 5 courses, one passport'],
  table:     ['Table', 'Every active item, sortable and filterable'],
  kanban:    ['Kanban', 'Status board — drag to move'],
  timeline:  ['Timeline', 'Deadlines against the calendar'],
  archive:   ['Archive', 'Completed and cleared']
};

function render() {
  const od = overdues();

  document.getElementById('nav').innerHTML = NAV.map(([v, label, icon]) => `
    <button type="button" class="nav-item" data-action="view" data-view="${v}" aria-current="${state.view === v}">
      <span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>
      ${v === 'table' && od.length ? `<span class="nav-badge" style="--c-over:${OVERDUE}">${od.length}</span>` : ''}
    </button>`).join('');

  document.getElementById('course-legend').innerHTML = Object.keys(COURSES).map(name => `
    <button type="button" class="nav-item course-item" data-action="filter-course" data-course="${name}"
      aria-pressed="${state.filters.Course === name}">
      <span class="course-swatch" style="--c:${COURSES[name]}"></span>
      <span class="nav-label">${name}</span>
      <span class="muted-sm">${active().filter(t => t.course === name).length}</span>
    </button>`).join('');

  const archiveBtn = document.getElementById('archive-btn');
  archiveBtn.setAttribute('aria-current', state.view === 'archive');
  document.getElementById('archive-count').textContent = all().filter(t => t.status === 'Done').length;

  const [title, sub] = TITLES[state.view];
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-sub').textContent = sub;

  document.getElementById('view-root').innerHTML =
    state.view === 'dashboard' ? viewDashboard() :
    state.view === 'table'     ? viewTable() :
    state.view === 'kanban'    ? viewKanban() :
    state.view === 'timeline'  ? viewTimeline() : viewArchive();

  renderParseBar();
  renderModal();
}

/* ── events (delegated) ──────────────────────────────────── */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action], [data-sort]');
  if (!el) return;
  const id = +el.dataset.id;

  if (el.dataset.sort) {
    const k = el.dataset.sort;
    state.sortDir = state.sortKey === k ? -state.sortDir : 1;
    state.sortKey = k;
    return render();
  }

  switch (el.dataset.action) {
    case 'view': state.view = el.dataset.view; return render();
    case 'filter-course': {
      const c = el.dataset.course;
      state.filters.Course = state.filters.Course === c ? 'All' : c;
      if (state.view === 'dashboard') state.view = 'table';
      return render();
    }
    case 'reset-filters':
      state.filters = { Course: 'All', Type: 'All', Priority: 'All', Status: 'All', Urgency: 'All' };
      return render();
    case 'filter-overdue': state.filters.Urgency = 'Overdue'; return render();
    case 'toggle-done':
      state.tasks = state.tasks.map(t => t.id === id ? { ...t, status: t.status === 'Done' ? 'In Progress' : 'Done' } : t);
      return render();
    case 'delete': state.tasks = state.tasks.filter(t => t.id !== id); return render();
    case 'restore':
      state.tasks = state.tasks.map(t => t.id === id ? { ...t, status: 'In Progress' } : t);
      return render();
    case 'edit': {
      const t = state.tasks.find(x => x.id === id);
      state.modal = true; state.editingId = id;
      state.form = { name: t.name, course: t.course, type: t.type, date: toISO(t.off), time: t.time,
                     priority: t.priority, workload: t.workload, weight: t.weight == null ? '' : String(t.weight),
                     status: t.status, reminder: t.reminder, recurring: t.recurring, notes: t.notes,
                     subtasks: t.subtasks.map(s => ({ ...s })) };
      return renderModal();
    }
    case 'add-task':
      state.modal = true; state.editingId = null; state.form = blankForm();
      return renderModal();
    case 'close-modal':
      if (el.hasAttribute('data-stop')) return;
      state.modal = false; return renderModal();
    case 'save-task': return saveTask();
    case 'quick-clear':
      state.quick = ''; document.getElementById('quick').value = ''; return renderParseBar();
    case 'quick-confirm': return commitQuick();
    case 'quick-to-form': {
      const p = parseQuick(state.quick) || {};
      state.modal = true; state.editingId = null;
      state.form = Object.assign(blankForm(), {
        name: p.name || '', course: p.course || 'Personal', date: toISO(p.date == null ? 2 : p.date),
        time: p.time || '23:59', workload: p.workload || 'Moderate', priority: p.priority || 'Medium' });
      state.quick = ''; document.getElementById('quick').value = '';
      renderParseBar(); return renderModal();
    }
  }
});

/* clicks inside the dialog must not close it */
document.addEventListener('click', e => { if (e.target.closest('[data-stop]')) e.stopPropagation(); }, true);

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.filter) { state.filters[t.dataset.filter] = t.value; return render(); }
  if (t.name === 'tlmode') { state.tlMode = t.value; return render(); }
  if (t.dataset.subtask != null) {
    const i = +t.dataset.subtask;
    state.form.subtasks[i].done = t.checked;
    return renderModal();
  }
  if (t.dataset.form) {
    state.form[t.dataset.form] = t.type === 'checkbox' ? t.checked : t.value;
    if (['date', 'time', 'priority', 'workload'].includes(t.dataset.form)) renderModal();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'quick') { state.quick = e.target.value; renderParseBar(); }
});

document.addEventListener('keydown', e => {
  if (e.target.id === 'quick') {
    if (e.key === 'Enter') commitQuick();
    if (e.key === 'Escape') { state.quick = ''; e.target.value = ''; renderParseBar(); }
  }
  if (e.target.id === 'subtask-draft' && e.key === 'Enter' && e.target.value.trim()) {
    state.form.subtasks.push({ text: e.target.value.trim(), done: false });
    renderModal();
  }
  if (e.key === 'Escape' && state.modal) { state.modal = false; renderModal(); }
});

/* choice buttons (priority / workload) */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-choice]');
  if (!b) return;
  state.form[b.dataset.choice] = b.dataset.value;
  renderModal();
});

/* drag & drop between kanban columns */
document.addEventListener('dragstart', e => {
  const card = e.target.closest('[data-card]');
  if (!card) return;
  state.dragId = +card.dataset.card;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragend', () => { state.dragId = null; state.dragOver = null; render(); });
document.addEventListener('dragover', e => {
  const col = e.target.closest('[data-drop]');
  if (!col) return;
  e.preventDefault();
  if (state.dragOver !== col.dataset.drop) { state.dragOver = col.dataset.drop; render(); }
});
document.addEventListener('drop', e => {
  const col = e.target.closest('[data-drop]');
  if (!col || state.dragId == null) return;
  e.preventDefault();
  const status = col.dataset.drop, id = state.dragId;
  state.tasks = state.tasks.map(t => t.id === id ? { ...t, status } : t);
  state.dragId = null; state.dragOver = null;
  render();
});

render();
