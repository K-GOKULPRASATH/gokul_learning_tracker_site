// Simple store
const Store = {
  get(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

const Core = (() => {
  async function loadJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  }

  function renderList(el, problems, progress) {
    el.innerHTML = '';
    problems.forEach(p => {
      const stat = progress[p.id] || { attempts: 0, passes: 0 };
      const badge = stat.passes > 0 ? '✅' : (stat.attempts > 0 ? '🟡' : '⬜');
      const li = document.createElement('li');
      li.innerHTML = `<button class="link" data-id="${p.id}">
        <span>${badge}</span> ${p.title} <small>• ${p.topic} • ${p.difficulty}</small>
      </button>`;
      el.appendChild(li);
    });
  }

  // kept for future use (not used after switching to editor panel)
  function normalize(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }


  function renderProblem(viewEl, p, trackKey, progress) {
    // Build the problem view + code editor panel (no input boxes)
    viewEl.innerHTML = `
  <h2>${p.title}</h2>
  <p class="muted">${p.topic} • ${p.difficulty}</p>
  <p>${p.statement}</p>
  <details class="roadmap"><summary>Hint/Idea</summary><p>${p.explain || ''}</p></details>

  <div class="code-editor-panel">
    <h2>Code Editor</h2>
    <div class="editor-wrap">
      <div id="editor" style="height:400px;border:1px solid #444;border-radius:10px;"></div>
      ${window.IS_OWNER ? '' : '<div id="editorLock" class="editor-lock">Owner can only access to solve the problems</div>'}
    </div>
    <button id="runBtn" class="btn" style="margin-top:10px;">Run Code</button>
    <div id="outputBox" class="panel" style="margin-top:10px;">Output will appear here...</div>
  </div>
`;
window.CURRENT_PROBLEM = p;

if (typeof window.setupEditor === 'function') window.setupEditor();

// if locked, clicking the overlay does nothing here (unlock is via brand)

  }

  function filterProblems(list, q) {
    if (!q) return list;
    q = q.toLowerCase();
    return list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.topic.toLowerCase().includes(q) ||
      p.difficulty.toLowerCase().includes(q)
    );
  }

  async function initPractice({ problemsUrl, listEl, viewEl, searchEl, trackKey }) {
    const problems = await loadJson(problemsUrl);
    const progress = Store.get(trackKey, {});
    const $list = document.querySelector(listEl);
    const $view = document.querySelector(viewEl);
    const $search = document.querySelector(searchEl);

    function refreshList() {
      const items = filterProblems(problems, $search.value);
      renderList($list, items, progress);
    }
    refreshList();

    $list.addEventListener('click', e => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const id = btn.dataset.id;
      const p = problems.find(x => x.id === id);
      if (p) renderProblem($view, p, trackKey, progress);
    });

    $search.addEventListener('input', refreshList);
  }

  function fmt(n) { return new Intl.NumberFormat().format(n); }
  function pct(passed, total) { return total ? Math.round((passed / total) * 100) : 0; }

  async function renderDashboard({ problemsUrl, trackKey, summaryEl, topicsEl, recentEl }) {
    const problems = await loadJson(problemsUrl);
    const progress = Store.get(trackKey, {});
    const map = new Map(problems.map(p => [p.id, p]));

    // totals
    let attempts = 0, passes = 0;
    Object.values(progress).forEach(s => { attempts += s.attempts; passes += s.passes; });

    const totalProblems = problems.length;
    const solved = Object.values(progress).filter(s => s.passes > 0).length;
    const accuracy = pct(passes, attempts);

    const $sum = document.querySelector(summaryEl);
    $sum.innerHTML = `
      <article class="card"><h3>Solved</h3><p><b>${fmt(solved)}</b> / ${totalProblems}</p></article>
      <article class="card"><h3>Attempts</h3><p><b>${fmt(attempts)}</b></p></article>
      <article class="card"><h3>Passes</h3><p><b>${fmt(passes)}</b></p></article>
      <article class="card"><h3>Accuracy</h3><p><b>${accuracy}%</b></p></article>
    `;

    // per topic
    const topicStats = {};
    problems.forEach(p => {
      topicStats[p.topic] ||= { total: 0, solved: 0 };
      topicStats[p.topic].total++;
      if ((progress[p.id]?.passes || 0) > 0) topicStats[p.topic].solved++;
    });
    const $topics = document.querySelector(topicsEl);
    $topics.innerHTML = Object.entries(topicStats).map(([topic, s]) => {
      const per = pct(s.solved, s.total);
      return `<article class="card">
        <h3>${topic}</h3>
        <div class="bar"><span style="width:${per}%">${per}%</span></div>
        <p class="muted">${s.solved}/${s.total} solved</p>
      </article>`;
    }).join('');

    // recent
    const pairs = Object.entries(progress)
      .filter(([, s]) => s.last)
      .sort((a, b) => b[1].last - a[1].last)
      .slice(0, 8);

    const $recent = document.querySelector(recentEl);
    $recent.innerHTML = pairs.length
      ? pairs.map(([id, s]) => {
          const p = map.get(id);
          const status = s.passes > 0 ? '✅ Solved' : '🟡 In progress';
          const when = new Date(s.last).toLocaleString();
          return `<li><span>${status}</span> ${p?.title || id} <small class="muted">• ${when}</small></li>`;
        }).join('')
      : `<li class="muted">No activity yet. Solve something in <a href="java-core.html">Java Core</a>.</li>`;
  }

  // ---- MULTI-TRACK DASHBOARD ----
async function renderDashboardMulti({ sections, overallEl, tracksEl, recentEl }) {
  // sections: [{title, problemsUrl, trackKey}]
  const overall = { totalProblems: 0, attempts: 0, passes: 0, solved: 0 };
  const recent = [];

  // render each track card
  const cards = await Promise.all(sections.map(async (s) => {
    const problems = await loadJson(s.problemsUrl);
    const progress = Store.get(s.trackKey, {});
    const total = problems.length;

    let attempts = 0, passes = 0, solved = 0;
    Object.values(progress).forEach(st => { attempts += st.attempts; passes += st.passes; if (st.passes > 0) solved++; });

    // recent per track
    Object.entries(progress)
      .filter(([, st]) => st.last)
      .forEach(([pid, st]) => {
        recent.push({ when: st.last, pid, track: s.title, passed: st.passes > 0,
          title: (problems.find(p=>p.id===pid)?.title) || pid });
      });

    // accumulate overall
    overall.totalProblems += total;
    overall.attempts += attempts;
    overall.passes += passes;
    overall.solved += solved;

    const acc = attempts ? Math.round((passes/attempts)*100) : 0;
    return `
      <article class="card">
        <h3>${s.title}</h3>
        <p><b>${solved}</b> / ${total} solved</p>
        <p class="muted">Attempts: ${attempts} • Passes: ${passes} • Acc: ${acc}%</p>
      </article>
    `;
  }));

  // overall summary
  const accOverall = overall.attempts ? Math.round((overall.passes/overall.attempts)*100) : 0;
  const $overall = document.querySelector(overallEl);
  if ($overall) {
    $overall.innerHTML = `
      <article class="card"><h3>Total Solved</h3><p><b>${overall.solved}</b> / ${overall.totalProblems}</p></article>
      <article class="card"><h3>Attempts</h3><p><b>${overall.attempts}</b></p></article>
      <article class="card"><h3>Passes</h3><p><b>${overall.passes}</b></p></article>
      <article class="card"><h3>Accuracy</h3><p><b>${accOverall}%</b></p></article>
    `;
  }

  // per-track cards
  const $tracks = document.querySelector(tracksEl);
  if ($tracks) $tracks.innerHTML = cards.join('');

  // unified recent (latest 10)
  recent.sort((a,b)=>b.when-a.when);
  const $recent = document.querySelector(recentEl);
  if ($recent) {
    $recent.innerHTML = recent.slice(0,10).map(r =>
      `<li><span>${r.passed?'✅':'🟡'}</span> ${r.title}
        <small class="muted">• ${r.track} • ${new Date(r.when).toLocaleString()}</small></li>`
    ).join('') || `<li class="muted">No activity yet.</li>`;
  }
}


  return { initPractice, renderDashboard };
})();
