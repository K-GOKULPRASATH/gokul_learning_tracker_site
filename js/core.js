// js/core.js
// Full, corrected Core module with fixed 14-day activity chart behavior.

'use strict';

// Simple store
const Store = {
  get(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

const Core = (() => {
  /* -------------------------
     Basic helpers & practice
     ------------------------- */

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
    // expose current problem for editor.js to preload starter code
    window.CURRENT_PROBLEM = p;

    if (typeof window.setupEditor === 'function') window.setupEditor();
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

  /* ---- MULTI-TRACK DASHBOARD ---- */
  async function renderDashboardMulti({ sections, overallEl, tracksEl, recentEl }) {
    // sections: [{title, problemsUrl, trackKey, key, page}]
    const overall = { totalProblems: 0, attempts: 0, passes: 0, solved: 0 };
    const recent = [];

    const cards = await Promise.all(sections.map(async (s) => {
      const problems = await loadJson(s.problemsUrl);
      const progress = Store.get(s.trackKey, {});
      const total = problems.length;

      let attempts = 0, passes = 0, solved = 0;
      Object.values(progress).forEach(st => { attempts += st.attempts; passes += st.passes; if (st.passes > 0) solved++; });

      Object.entries(progress)
        .filter(([, st]) => st.last)
        .forEach(([pid, st]) => {
          recent.push({
            when: st.last,
            pid,
            track: s.title,
            passed: st.passes > 0,
            title: (problems.find(p => p.id === pid)?.title) || pid
          });
        });

      overall.totalProblems += total;
      overall.attempts += attempts;
      overall.passes += passes;
      overall.solved += solved;

      const acc = attempts ? Math.round((passes / attempts) * 100) : 0;
      const solvedPerc = total ? Math.round((solved / total) * 100) : 0;

      const keyAttr = s.key ? `data-track-key="${s.key}"` : '';
      const pageLink = s.page || '#';

      return `
      <article class="card" ${keyAttr} style="cursor:pointer">
        <h3>${s.title}</h3>
        <p><b>${solved}</b> / ${total} solved</p>
        <div class="bar"><span style="width:${solvedPerc}%">${solvedPerc}%</span></div>
        <p class="muted">Attempts: ${attempts} • Passes: ${passes} • Acc: ${acc}%</p>
        <div style="margin-top:8px;"><a href="${pageLink}" class="btn small" onclick="event.stopPropagation()">Open Track Page</a></div>
      </article>
    `;
    }));

    const accOverall = overall.attempts ? Math.round((overall.passes / overall.attempts) * 100) : 0;
    const solvedPercAll = overall.totalProblems ? Math.round((overall.solved / overall.totalProblems) * 100) : 0;
    const $overall = document.querySelector(overallEl);
    if ($overall) {
      $overall.innerHTML = `
      <article class="card big">
        <h3>Total Progress</h3>
        <div class="bar"><span style="width:${solvedPercAll}%">${solvedPercAll}%</span></div>
        <p><b>${overall.solved}</b> / ${overall.totalProblems} problems solved</p>
        <p class="muted">Attempts: ${overall.attempts} • Passes: ${overall.passes} • Accuracy: ${accOverall}%</p>
      </article>
    `;
    }

    const $tracks = document.querySelector(tracksEl);
    if ($tracks) $tracks.innerHTML = cards.join('');

    recent.sort((a, b) => b.when - a.when);
    const $recent = document.querySelector(recentEl);
    if ($recent) {
      $recent.innerHTML = recent.length
        ? recent.slice(0, 10).map(r =>
          `<li><span>${r.passed ? '✅' : '🟡'}</span> ${r.title}
            <small class="muted">• ${r.track} • ${new Date(r.when).toLocaleString()}</small></li>`
        ).join('')
        : `<li class="muted">No activity yet.</li>`;
    }
  }

  /* ====== Dashboard analytics helpers ====== */

  // get progress object for trackKey
  function getProgress(trackKey) {
    try { return JSON.parse(localStorage.getItem(trackKey) || '{}'); }
    catch { return {}; }
  }

  // Strictly build series for last `days` days (exact length)
  function buildDailySeries(trackKeys = ['jc_progress', 'mj_progress'], days = 14) {
    const today = new Date();
    const labels = [];
    const counts = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(key);
      counts[key] = 0;
    }

    trackKeys.forEach(k => {
      try {
        const p = JSON.parse(localStorage.getItem(k) || '{}');
        Object.values(p).forEach(s => {
          if (!s.last) return;
          const dayKey = new Date(s.last).toISOString().slice(0, 10);
          if (dayKey in counts) counts[dayKey] += (s.attempts || 1);
        });
      } catch (_) { /* ignore */ }
    });

    const series = labels.map(l => counts[l] || 0);
    return { labels, series };
  }

  function computeTrackAnalytics(track) {
    const pList = window.__problemsCache?.[track.trackKey] || null;
    const progress = getProgress(track.trackKey);

    const stats = { solved: 0, total: 0, attempts: 0, passes: 0, accuracy: 0, lastActive: null, streak: 0 };

    if (pList && Array.isArray(pList)) stats.total = pList.length;

    Object.values(progress).forEach(s => {
      stats.attempts += (s.attempts || 0);
      stats.passes += (s.passes || 0);
      if (s.passes && s.passes > 0) stats.solved += 1;
      if (s.last) {
        const d = new Date(s.last);
        if (!stats.lastActive || d > new Date(stats.lastActive)) stats.lastActive = d.toISOString();
      }
    });

    stats.accuracy = stats.attempts ? Math.round((stats.passes / stats.attempts) * 100) : 0;

    const daysSet = new Set();
    Object.values(progress).forEach(s => {
      if (!s.last) return;
      const day = new Date(s.last).toISOString().slice(0, 10);
      daysSet.add(day);
    });

    function calcStreak(set) {
      let streak = 0;
      const today = new Date();
      for (let offset = 0; offset < 365; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() - offset);
        const key = d.toISOString().slice(0, 10);
        if (set.has(key)) streak++;
        else {
          if (offset === 0) continue;
          break;
        }
      }
      return streak;
    }
    stats.streak = calcStreak(daysSet);

    return stats;
  }

  async function preloadProblemsForTracks(tracks) {
    window.__problemsCache = window.__problemsCache || {};
    await Promise.all(tracks.map(async t => {
      if (!t.problemsUrl) return;
      try {
        const r = await fetch(t.problemsUrl);
        if (!r.ok) throw new Error('fail');
        const j = await r.json();
        window.__problemsCache[t.trackKey] = j;
      } catch (e) {
        window.__problemsCache[t.trackKey] = null;
      }
    }));
  }

  // update chart data safely
  function updateActivityChart(labels, series) {
    if (!window.__activityChart) return;
    if (!Array.isArray(labels) || !Array.isArray(series)) return;
    // ensure lengths match and are exactly the requested number
    window.__activityChart.data.labels = labels;
    window.__activityChart.data.datasets[0].data = series;
    window.__activityChart.update();
  }

  // viewTrackChart used by per-card buttons
  function viewTrackChart(e) {
    e.stopPropagation();
    const key = e.currentTarget.dataset.track;
    if (!key) return;
    const t = (window.TRACKS || []).find(x => x.key === key);
    if (!t) return;
    const s = buildDailySeries([t.trackKey], 14);
    updateActivityChart(s.labels, s.series);
  }

  // simplified renderAnalytics — no chart, no "View Chart" button
async function renderAnalytics(tracks) {
  if (!Array.isArray(tracks)) return;
  await preloadProblemsForTracks(tracks);

  // populate cards (no View Chart button)
  const container = document.getElementById('analyticsCards');
  if (container) {
    container.innerHTML = tracks.map(t => {
      const st = computeTrackAnalytics(t);
      const last = st.lastActive ? new Date(st.lastActive).toLocaleString() : 'Never';
      return `
      <article class="stat-card">
        <div class="stat-row">
          <h4 style="margin:0">${t.title}</h4>
          <span class="badge">${st.streak}d</span>
        </div>

        <div style="margin-top:8px;">
          <div class="small-muted">Solved</div>
          <div style="font-weight:700">${st.solved} / ${st.total || '–'}</div>
        </div>

        <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
          <div class="small-muted">Attempts</div><div>${st.attempts}</div>
          <div class="small-muted" style="margin-left:8px">Acc</div><div>${st.accuracy}%</div>
        </div>

        <div style="margin-top:8px;" class="small-muted">Last active: ${last}</div>

        <div style="margin-top:8px;">
          <a href="${t.page}" class="btn small">Open Track</a>
        </div>
      </article>
    `;
    }).join('');
  }

  // No chart logic — function ends here.
}

  /* ---- Track detail rendering (used by dashboard drilldown) ---- */
  async function renderTrackDetail({ problemsUrl, trackKey, summaryEl, problemsEl, recentEl }) {
    const problems = await loadJson(problemsUrl);
    const progress = Store.get(trackKey, {});
    const total = problems.length;

    const solved = Object.values(progress).filter(s => s.passes > 0).length;
    let attempts = 0, passes = 0;
    Object.values(progress).forEach(s => { attempts += s.attempts; passes += s.passes; });
    const acc = attempts ? Math.round((passes / attempts) * 100) : 0;
    const solvedPerc = total ? Math.round((solved / total) * 100) : 0;

    const $sum = document.querySelector(summaryEl);
    if ($sum) {
      $sum.innerHTML = `<article class="card">
      <h3>Track Summary</h3>
      <div class="bar"><span style="width:${solvedPerc}%">${solvedPerc}%</span></div>
      <p><b>${solved}</b> / ${total} solved</p>
      <p class="muted">Attempts: ${attempts} • Passes: ${passes} • Acc: ${acc}%</p>
    </article>`;
    }

    const $problems = document.querySelector(problemsEl);
    if ($problems) {
      $problems.innerHTML = problems.map(p => {
        const stat = progress[p.id] || { attempts: 0, passes: 0 };
        const badge = stat.passes > 0 ? '✅' : (stat.attempts > 0 ? '🟡' : '⬜');
        return `<li class="problem-item"><strong>${badge} ${p.title}</strong> <small class="muted">• ${p.topic} • ${p.difficulty}</small></li>`;
      }).join('');
    }

    const pairs = Object.entries(progress).filter(([, s]) => s.last).sort((a, b) => b[1].last - a[1].last);
    const $recent = document.querySelector(recentEl);
    if ($recent) {
      $recent.innerHTML = pairs.length
        ? pairs.map(([id, s]) => {
          const p = problems.find(x => x.id === id);
          return `<li><span>${s.passes > 0 ? '✅' : '🟡'}</span> ${p?.title || id} <small class="muted">• ${new Date(s.last).toLocaleString()}</small></li>`;
        }).join('')
        : `<li class="muted">No activity yet for this track.</li>`;
    }
  }

  /* Initialize analytics if TRACKS global exists (helpful when dashboard includes TRACKS) */
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof TRACKS !== 'undefined' && Array.isArray(TRACKS)) {
      // avoid double-initialization: only run if analytics container exists
      if (document.getElementById('analyticsCards') && typeof renderAnalytics === 'function') {
        renderAnalytics(TRACKS).catch(() => { /* ignore */ });
      }
    }
  });

  // export public functions
  return { initPractice, renderDashboard, renderDashboardMulti, renderTrackDetail, renderAnalytics };
})();
