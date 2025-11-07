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

  function normalize(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function renderProblem(viewEl, p, trackKey, progress) {
    viewEl.innerHTML = `
      <h2>${p.title}</h2>
      <p class="muted">${p.topic} • ${p.difficulty}</p>
      <p>${p.statement}</p>
      <details class="roadmap"><summary>Hint/Idea</summary><p>${p.explain || ''}</p></details>
      <form id="attemptForm" class="attempt">
        ${p.tests.map((t, i) => `
          <div class="case">
            <label>Test ${i + 1}: <code>${t.input}</code></label>
            <input class="input" data-i="${i}" placeholder="Your output"/>
            <div class="expected muted">Expected format: <code>${t.expected}</code></div>
          </div>
        `).join('')}
        <button class="btn" type="submit">Submit</button>
      </form>
      <div id="verdict" class="panel" style="margin-top:12px;"></div>
    `;

    const form = viewEl.querySelector('#attemptForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const answers = [...form.querySelectorAll('input')].map(i => i.value);
      let passAll = true;
      const results = [];
      for (let i = 0; i < p.tests.length; i++) {
        const ok = normalize(answers[i]) === normalize(p.tests[i].expected);
        results.push(ok);
        if (!ok) passAll = false;
      }
      const ver = viewEl.querySelector('#verdict');
      ver.innerHTML = passAll
        ? `<b>All tests passed ✅</b>`
        : `<b>Some tests failed ❌</b><br/>` + results.map((ok, idx) => `Test ${idx + 1}: ${ok ? '✅' : '❌'}`).join(' • ');

      // update progress
      const stat = progress[p.id] || { attempts: 0, passes: 0, last: null };
      stat.attempts += 1;
      if (passAll) stat.passes += 1;
      stat.last = Date.now();
      progress[p.id] = stat;
      Store.set(trackKey, progress);
    });
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

  return { initPractice, renderDashboard };
})();
