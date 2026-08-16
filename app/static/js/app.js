/* Radar — coursework & deadline tracker
 * Vanilla JS, no build step. Data lives in the Flask/SQLite backend under
 * /api/courses and /api/tasks; state.tasks is a local cache refreshed after
 * every mutation. Rendering is still full-redraw into #view-root: refresh
 * state, call render(). The urgency computation and view markup below are
 * unchanged from the original client-only mock — only the data layer at
 * the top and the mutation handlers near the bottom talk to the backend.
 * ---------------------------------------------------------------- */

/* ── model ───────────────────────────────────────────────── */

/* Populated from GET /api/courses at startup (see init() below). */
let COURSES = {};      // name -> color, for rendering
let COURSE_IDS = {};   // name -> id, for API calls

const TYPES     = ['Homework', 'Exam', 'Project', 'Reading', 'Paper', 'Other'];
const STATUSES  = ['Not Started', 'In Progress', 'Done'];
const REMINDERS = ['No reminder', 'Day of', '1 day before', '2 days before', '1 week before'];

const BAND_COLOR = { Critical: '#e05f6f', Urgent: '#e0904f', Watch: '#d9b25f', Calm: '#8fd6b4', Done: '#9397ab' };
const BAND_ICON  = { Critical: '▲', Urgent: '◆', Watch: '●', Calm: '○', Done: '✓' };
const OVERDUE    = '#e05f6f';

/* Workload → estimated hours, and the working window a lane block spans. */
const WORKLOAD_HOURS = { Light: 1.5, Moderate: 3.5, Heavy: 7 };
const WORKLOAD_DAYS  = { Light: 1,   Moderate: 2,   Heavy: 3 };

const state = {
  view: 'dashboard',
  tlMode: 'week',
  tasks: [],
  filters: { Course: 'All', Type: 'All', Priority: 'All', Status: 'All', Urgency: 'All' },
  sortKey: 'due', sortDir: 1,
  quick: '',
  modal: false, editingId: null, form: null, subtaskDraft: '',
  courseModal: false, courseForm: null,
  deleteCourseModal: false, deleteCourseForm: null,
  dragId: null, dragOver: null,
  settings: { default_reminder: '2 days before' }
};

const COURSE_SWATCHES = [
  '#7aa2f7', '#6fcfb0', '#e0b060', '#e0707c', '#9ac96a',
  '#9b9fb5', '#c792ea', '#f78c6c', '#89ddff', '#f07178'
];

/* ── backend API ─────────────────────────────────────────── */

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `${method} ${path} failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/* Backend tasks store a real due_date/due_time; the view layer below works
 * in day-offsets from today (`off`), so this adapter derives `off` via
 * toOffset() and otherwise renames fields 1:1 onto the shape the original
 * client-only mock used internally. */
function fromApi(t) {
  return {
    id: t.id,
    course: t.course.name,
    name: t.name,
    type: t.type,
    off: toOffset(t.due_date),
    time: t.due_time,
    priority: t.priority,
    workload: t.workload,
    weight: t.weight,
    status: t.status,
    notes: t.notes || '',
    subtasks: (t.subtasks || []).map(st => ({ id: st.id, text: st.text, done: st.done })),
    recurring: t.recurring,
    reminder: t.reminder,
    spent: t.spent_hours
  };
}

async function refreshCourses() {
  const courses = await api('GET', '/courses');
  COURSES = {}; COURSE_IDS = {};
  courses.forEach(c => { COURSES[c.name] = c.color; COURSE_IDS[c.name] = c.id; });
}

async function refreshTasks() {
  const tasks = await api('GET', '/tasks');
  state.tasks = tasks.map(fromApi);
}

async function refreshSettings() {
  state.settings = await api('GET', '/settings');
}

async function withErrorAlert(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Something went wrong talking to the server.');
  }
}

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

function filterDefs() {
  return [
    ['Course',   ['All', ...Object.keys(COURSES)]],
    ['Type',     ['All', ...TYPES]],
    ['Priority', ['All', 'High', 'Medium', 'Low']],
    ['Status',   ['All', ...STATUSES]],
    ['Urgency',  ['All', 'Overdue', 'Critical', 'Urgent', 'Watch', 'Calm']]
  ];
}

function filterBar(trailing) {
  return `<div class="filters">
    ${filterDefs().map(([label, opts]) => `<label>${label}
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
  const act = filtered();

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
  const act = filtered().filter(t => t.off < LANE_SPAN);
  const trackW = LANE_SPAN * LANE_DAY_W;

  const ticks = Array.from({ length: LANE_SPAN }, (_, off) =>
    `<span class="lane-tick${off === 0 ? ' today' : ''}" style="width:${LANE_DAY_W}px">${dateFor(off).getDate()}</span>`).join('');

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

function viewSettings() {
  const feedUrl = `${location.origin}/export.ics`;
  const reminderOptions = REMINDERS.filter(r => r !== 'No reminder');

  return `<div class="view-pad">
    <section class="settings-section">
      <h5>Calendar export</h5>
      <p class="muted-sm">A read-only iCal feed of every active task. Due date and time become the event; notes and weight travel in the description.</p>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="ics-url" readonly value="${esc(feedUrl)}" style="flex:1;color:color-mix(in srgb,var(--color-text) 70%,transparent)">
        <button type="button" class="btn btn-secondary" data-action="copy-ics">Copy</button>
        <a class="btn btn-primary" href="/export.ics" download="coursework.ics">Download .ics</a>
      </div>
    </section>

    <hr class="hr">

    <section class="settings-section">
      <h5>Default reminder lead time</h5>
      <div class="choice-row" style="max-width:480px;margin-top:10px">
        ${reminderOptions.map(r => `<button type="button" class="choice" data-action="set-default-reminder"
          data-value="${r}" aria-pressed="${state.settings.default_reminder === r}">${r}</button>`).join('')}
      </div>
    </section>

    <hr class="hr">

    <section class="settings-section">
      <h5>Urgency weighting</h5>
      <p class="muted-sm">Urgency is computed, not set. Due proximity carries the most weight, then estimated workload, then your priority and the item's share of the grade — which is why a low-priority paper due tomorrow can outrank a high-priority midterm next week.</p>
    </section>

    <hr class="hr">

    <section class="settings-section">
      <h5>Delete a course</h5>
      <p class="muted-sm">Removing a course also removes every task under it. This can't be undone.</p>
      <button type="button" class="btn btn-danger" style="margin-top:10px" data-action="open-delete-course">Delete a course</button>
    </section>
  </div>`;
}

/* ── add / edit dialog ───────────────────────────────────── */

function blankForm() {
  return { name: '', course: Object.keys(COURSES)[0] || '', type: 'Homework', date: toISO(2), time: '23:59',
           priority: 'Medium', workload: 'Moderate', weight: '', status: 'Not Started',
           reminder: state.settings.default_reminder, recurring: false, notes: '', subtasks: [] };
}

function renderModal() {
  const root = document.getElementById('modal-root');
  if (state.modal) { root.innerHTML = taskDialogHtml(); return; }
  if (state.courseModal) { root.innerHTML = courseDialogHtml(); return; }
  if (state.deleteCourseModal) { root.innerHTML = deleteCourseDialogHtml(); return; }
  root.innerHTML = '';
}

function taskDialogHtml() {
  const f = state.form;
  const preview = enrich({ ...f, off: toOffset(f.date), weight: +f.weight || null, subtasks: f.subtasks });
  const sel = (name, opts, value) => `<select class="input" data-form="${name}">${opts.map(o => `<option${o === value ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  const choices = (name, opts) => `<div class="choice-row">${opts.map(o =>
    `<button type="button" class="choice" data-choice="${name}" data-value="${o}" aria-pressed="${f[name] === o}">${o}</button>`).join('')}</div>`;

  return `<div class="dialog-backdrop" data-action="close-modal">
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

function courseDialogHtml() {
  const f = state.courseForm;
  const editing = !!f.id;
  return `<div class="dialog-backdrop" data-action="close-course-modal">
    <div class="dialog elev-lg" data-stop style="width:min(360px,100%)">
      <span class="dialog-title">${editing ? 'Edit course' : 'Add course'}</span>
      <div class="field">
        <label>Course name</label>
        <input class="input" id="course-name-input" data-course-form="name" value="${esc(f.name)}" placeholder="e.g. CS 251">
      </div>
      <div class="field">
        <label>Color</label>
        <div class="swatch-row">
          ${COURSE_SWATCHES.map(c => `<button type="button" class="swatch" data-swatch="${c}" style="--c:${c}" aria-pressed="${f.color === c}" title="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-secondary" data-action="close-course-modal">Cancel</button>
        <button class="btn btn-primary" data-action="save-course">${editing ? 'Save changes' : 'Add course'}</button>
      </div>
    </div></div>`;
}

async function saveCourse() {
  await withErrorAlert(async () => {
    const name = (state.courseForm.name || '').trim();
    if (!name) { alert('Course name is required.'); return; }
    const id = state.courseForm.id;
    if (id) {
      await api('PATCH', `/courses/${id}`, { name, color: state.courseForm.color });
    } else {
      await api('POST', '/courses', { name, color: state.courseForm.color });
    }
    state.courseModal = false; state.courseForm = null;
    await refreshCourses();
    render();
  });
}

function deleteCourseDialogHtml() {
  const names = Object.keys(COURSES);
  const selected = state.deleteCourseForm.name;
  const taskCount = state.tasks.filter(t => t.course === selected).length;

  if (!names.length) {
    return `<div class="dialog-backdrop" data-action="close-delete-course-modal">
      <div class="dialog elev-lg" data-stop style="width:min(360px,100%)">
        <span class="dialog-title">Delete a course</span>
        <p class="muted-sm">There are no courses to delete.</p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" data-action="close-delete-course-modal">Close</button>
        </div>
      </div></div>`;
  }

  return `<div class="dialog-backdrop" data-action="close-delete-course-modal">
    <div class="dialog elev-lg" data-stop style="width:min(380px,100%)">
      <span class="dialog-title">Delete a course</span>
      <div class="field">
        <label>Course</label>
        <select class="input" id="delete-course-select" data-delete-course-form="name">
          ${names.map(name => `<option${name === selected ? ' selected' : ''}>${esc(name)}</option>`).join('')}
        </select>
      </div>
      <p class="muted-sm">This deletes <strong>${esc(selected)}</strong> and its ${taskCount} task${taskCount === 1 ? '' : 's'}. This can't be undone.</p>
      <div class="dialog-actions">
        <button class="btn btn-secondary" data-action="close-delete-course-modal">Cancel</button>
        <button class="btn btn-danger" data-action="confirm-delete-course">Delete course</button>
      </div>
    </div></div>`;
}

async function confirmDeleteCourse() {
  await withErrorAlert(async () => {
    const name = state.deleteCourseForm.name;
    const courseId = COURSE_IDS[name];
    if (!courseId) return;
    await api('DELETE', `/courses/${courseId}`);
    state.deleteCourseModal = false; state.deleteCourseForm = null;
    await Promise.all([refreshCourses(), refreshTasks()]);
    render();
  });
}

async function saveTask() {
  await withErrorAlert(async () => {
    const f = state.form;
    const payload = {
      course_id: COURSE_IDS[f.course],
      name: f.name || 'Untitled task',
      type: f.type,
      due_date: f.date,
      due_time: f.time,
      priority: f.priority,
      workload: f.workload,
      weight: f.weight === '' ? null : +f.weight,
      status: f.status,
      notes: f.notes,
      recurring: f.recurring,
      reminder: f.reminder
    };

    if (state.editingId) {
      await api('PATCH', `/tasks/${state.editingId}`, payload);
      /* Subtasks have no bulk-update endpoint: toggle/rename existing ones
       * by id, and create any the user added in this edit session. */
      for (const s of f.subtasks) {
        if (s.id) await api('PATCH', `/tasks/${state.editingId}/subtasks/${s.id}`, { done: s.done, text: s.text });
        else if (s.text.trim()) await api('POST', `/tasks/${state.editingId}/subtasks`, { text: s.text });
      }
    } else {
      payload.subtasks = f.subtasks.map(s => ({ text: s.text, done: s.done }));
      await api('POST', '/tasks', payload);
    }

    state.modal = false; state.editingId = null;
    await refreshTasks();
    render();
  });
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
  const courseName = p.course || 'Personal';
  const courseId = COURSE_IDS[courseName];
  if (!courseId) { alert(`No course named "${courseName}" yet — add it first.`); return; }

  withErrorAlert(async () => {
    await api('POST', '/tasks', {
      course_id: courseId,
      name: p.name || 'Untitled task',
      type: 'Homework',
      due_date: toISO(p.date == null ? 2 : p.date),
      due_time: p.time || '23:59',
      priority: p.priority || 'Medium',
      workload: p.workload || 'Moderate',
      status: 'Not Started'
    });
    state.quick = '';
    document.getElementById('quick').value = '';
    await refreshTasks();
    render();
  });
}

/* ── shell render ────────────────────────────────────────── */

const NAV = [['dashboard', 'Dashboard', '▤'], ['table', 'Table', '≡'], ['kanban', 'Kanban', '▦'], ['timeline', 'Timeline', '◷'], ['settings', 'Settings', '⚙']];
const TITLES = {
  dashboard: ['Dashboard', 'Overview'],
  table:     ['Table', 'Every active item, sortable and filterable'],
  kanban:    ['Kanban', 'Status board — drag to move'],
  timeline:  ['Timeline', 'Deadlines against the calendar'],
  archive:   ['Archive', 'Completed and cleared'],
  settings:  ['Settings', 'Calendar export, defaults, and course management']
};

function render() {
  const od = overdues();

  document.getElementById('nav').innerHTML = NAV.map(([v, label, icon]) => `
    <button type="button" class="nav-item" data-action="view" data-view="${v}" aria-current="${state.view === v}">
      <span class="nav-icon">${icon}</span><span class="nav-label">${label}</span>
      ${v === 'table' && od.length ? `<span class="nav-badge" style="--c-over:${OVERDUE}">${od.length}</span>` : ''}
    </button>`).join('');

  document.getElementById('course-legend').innerHTML = Object.keys(COURSES).map(name => `
    <div class="course-item-row">
      <button type="button" class="course-edit-btn" data-action="edit-course" data-course="${name}"
        title="Edit course" aria-label="Edit ${esc(name)}">✎</button>
      <button type="button" class="nav-item course-item" data-action="filter-course" data-course="${name}"
        aria-pressed="${state.filters.Course === name}">
        <span class="course-swatch" style="--c:${COURSES[name]}"></span>
        <span class="nav-label">${name}</span>
        <span class="muted-sm">${active().filter(t => t.course === name).length}</span>
      </button>
    </div>`).join('');

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
    state.view === 'timeline'  ? viewTimeline() :
    state.view === 'settings'  ? viewSettings() : viewArchive();

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
      /* Table/Kanban/Timeline already show a filtered task list in place;
       * any other view (dashboard, settings, archive) has nowhere to show
       * the filter, so jump to Table. */
      if (!['table', 'kanban', 'timeline'].includes(state.view)) state.view = 'table';
      return render();
    }
    case 'reset-filters':
      state.filters = { Course: 'All', Type: 'All', Priority: 'All', Status: 'All', Urgency: 'All' };
      return render();
    case 'filter-overdue': state.filters.Urgency = 'Overdue'; return render();
    case 'toggle-done': {
      const t = state.tasks.find(x => x.id === id);
      if (!t) return;
      return withErrorAlert(async () => {
        await api('PATCH', `/tasks/${id}`, { status: t.status === 'Done' ? 'In Progress' : 'Done' });
        await refreshTasks();
        render();
      });
    }
    case 'delete':
      return withErrorAlert(async () => {
        await api('DELETE', `/tasks/${id}`);
        await refreshTasks();
        render();
      });
    case 'restore':
      return withErrorAlert(async () => {
        await api('PATCH', `/tasks/${id}`, { status: 'In Progress' });
        await refreshTasks();
        render();
      });
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
    case 'add-course':
      state.courseModal = true;
      state.courseForm = { id: null, name: '', color: COURSE_SWATCHES[Object.keys(COURSES).length % COURSE_SWATCHES.length] };
      renderModal();
      return document.getElementById('course-name-input').focus();
    case 'edit-course': {
      const name = el.dataset.course;
      state.courseModal = true;
      state.courseForm = { id: COURSE_IDS[name], name, color: COURSES[name] };
      renderModal();
      return document.getElementById('course-name-input').focus();
    }
    case 'close-course-modal':
      if (el.classList.contains('dialog-backdrop') && e.target.closest('[data-stop]')) return;
      state.courseModal = false; state.courseForm = null; return renderModal();
    case 'save-course': return saveCourse();
    case 'set-default-reminder':
      return withErrorAlert(async () => {
        await api('PATCH', '/settings', { default_reminder: el.dataset.value });
        await refreshSettings();
        render();
      });
    case 'copy-ics':
      return withErrorAlert(async () => {
        const url = document.getElementById('ics-url').value;
        await navigator.clipboard.writeText(url);
      });
    case 'open-delete-course':
      state.deleteCourseModal = true;
      state.deleteCourseForm = { name: Object.keys(COURSES)[0] || '' };
      return renderModal();
    case 'close-delete-course-modal':
      if (el.classList.contains('dialog-backdrop') && e.target.closest('[data-stop]')) return;
      state.deleteCourseModal = false; state.deleteCourseForm = null; return renderModal();
    case 'confirm-delete-course': return confirmDeleteCourse();
    case 'close-modal':
      /* `el` only resolves to the backdrop when the click target has no
       * data-action of its own (Cancel/✕ resolve to themselves and always
       * close). A backdrop-resolved click still inside the dialog's
       * data-stop wrapper is a click on inert dialog content — ignore it. */
      if (el.classList.contains('dialog-backdrop') && e.target.closest('[data-stop]')) return;
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
  if (t.dataset.courseForm) { state.courseForm[t.dataset.courseForm] = t.value; }
  if (t.dataset.deleteCourseForm) { state.deleteCourseForm[t.dataset.deleteCourseForm] = t.value; return renderModal(); }
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
  if (e.target.id === 'course-name-input' && e.key === 'Enter') saveCourse();
  if (e.key === 'Escape' && state.modal) { state.modal = false; renderModal(); }
  if (e.key === 'Escape' && state.courseModal) { state.courseModal = false; state.courseForm = null; renderModal(); }
  if (e.key === 'Escape' && state.deleteCourseModal) { state.deleteCourseModal = false; state.deleteCourseForm = null; renderModal(); }
});

/* choice buttons (priority / workload) */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-choice]');
  if (!b) return;
  state.form[b.dataset.choice] = b.dataset.value;
  renderModal();
});

/* course color swatches */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-swatch]');
  if (!b) return;
  state.courseForm.color = b.dataset.swatch;
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
  state.dragId = null; state.dragOver = null;
  withErrorAlert(async () => {
    await api('PATCH', `/tasks/${id}`, { status });
    await refreshTasks();
    render();
  });
});

/* ── boot ────────────────────────────────────────────────── */

async function init() {
  try {
    await Promise.all([refreshCourses(), refreshTasks(), refreshSettings()]);
  } catch (err) {
    console.error(err);
    document.getElementById('view-root').innerHTML =
      `<div class="empty">Couldn't reach the server. Check the Flask app is running and reload.</div>`;
    return;
  }
  render();
}

init();
