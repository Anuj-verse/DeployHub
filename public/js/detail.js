// Deployment detail: stepper, live log console, summary + actions. Polls until the run finishes.
(function () {
  const id = document.getElementById('detail').dataset.id;
  const STEPS = ['Clone', 'Detect', 'Generate', 'Build', 'Push', 'Deploy', 'Live'];
  const $ = (x) => document.getElementById(x);
  let dep = null;
  let offset = 0;

  function stepState(i) {
    if (dep.status === 'live') return 'done';
    if (dep.status === 'failed') {
      const f = dep.failedIndex || 0;
      return i < f ? 'done' : i === f ? 'failed' : 'pending';
    }
    return i < dep.stageIndex ? 'done' : i === dep.stageIndex ? 'running' : 'pending';
  }

  function renderAll() {
    // Header
    const openBtn = dep.url
      ? '<a class="btn btn-primary btn-sm" href="' + esc(dep.url) + '" target="_blank" rel="noopener">Open Application ↗</a>'
      : '';
    $('head').innerHTML =
      '<div class="detail-head-left">' +
        '<h1 class="detail-title">' + esc(dep.fullName) + '</h1>' +
        '<span class="chip">' + esc(dep.branch) + '</span>' +
        (dep.commit ? '<span class="chip">' + esc(dep.commit.slice(0, 7)) + '</span>' : '') +
        statusPill(dep) +
      '</div>' +
      '<div>' + openBtn + '</div>';

    // Error banner
    $('banner').innerHTML = dep.status === 'failed'
      ? '<div class="banner banner-error"><strong>Failed at ' + esc(STEPS[dep.failedIndex || 0]) + ':</strong> ' + esc(dep.error) + '</div>'
      : '';

    // Stepper
    $('stepper').innerHTML = STEPS.map(function (s, i) {
      const st = stepState(i);
      const icon = st === 'done' ? '✓' : st === 'failed' ? '✕' : st === 'running' ? '●' : String(i + 1);
      return '<div class="step ' + st + '" role="listitem">' +
        '<div class="dot">' + icon + '</div>' +
        '<span class="step-title">' + esc(s) + '</span>' +
        '</div>';
    }).join('');

    // Live pill visibility
    const pill = $('live-pill');
    if (pill) pill.style.display = dep.status === 'running' ? '' : 'none';

    // Summary card
    const dash = '<span class="muted">—</span>';
    const running = dep.status === 'running';
    $('summary').innerHTML =
      '<h3>Deployment Spec</h3>' +
      '<dl>' +
        row('Runtime Stack',   dep.stack     ? esc(dep.stack) : dash) +
        row('Container Image', dep.image     ? '<span class="mono" style="font-size:.78rem;word-break:break-all">' + esc(dep.image) + '</span>' : dash) +
        row('k8s Namespace',   dep.namespace ? esc(dep.namespace) : dash) +
        row('Pod Replicas',    esc(String(dep.replicas))) +
        row('Target Port',     dep.port      ? esc(String(dep.port)) : dash) +
        row('Trigger Source',  esc(dep.trigger)) +
        row('Started At',      new Date(dep.startedAt).toLocaleString()) +
        row('Total Duration',  fmtDuration((dep.finishedAt || Date.now()) - dep.startedAt)) +
        row('Cluster Route',   dep.url ? '<a class="endpoint-link" href="' + esc(dep.url) + '" target="_blank" rel="noopener">' + esc(dep.url) + '</a>' : dash) +
      '</dl>' +
      '<div class="actions">' +
        '<button class="btn btn-secondary btn-sm" data-act="redeploy"' + (running ? ' disabled' : '') + '>' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' +
          ' Redeploy' +
        '</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete"' + (running ? ' disabled' : '') + '>' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
          ' Tear Down' +
        '</button>' +
      '</div>';
  }

  function row(k, v) {
    return '<dt>' + k + '</dt><dd>' + v + '</dd>';
  }

  function lineHtml(raw) {
    const m = /^(\d\d:\d\d:\d\d)\s\s([\s\S]*)$/.exec(raw) || [null, '', raw];
    const msg = m[2];
    let cls = '';
    if (msg.startsWith('$ '))      cls = 'cmd';
    else if (msg.startsWith('▶'))  cls = 'stage';
    else if (msg.startsWith('ERROR')) cls = 'err';
    else if (msg.startsWith('Warning')) cls = 'warn';
    else if (msg.startsWith('✔'))  cls = 'ok';
    return '<div class="ln ' + cls + '"><span class="ts">' + esc(m[1]) + '</span><span class="ln-body">' + esc(msg) + '</span></div>';
  }

  function appendLogs(lines, isFirst) {
    if (!lines.length && !isFirst) return;
    const c = $('log-console');
    const stick = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    if (isFirst) c.innerHTML = '';
    if (lines.length) c.insertAdjacentHTML('beforeend', lines.map(lineHtml).join(''));
    if (stick) c.scrollTop = c.scrollHeight;
  }

  async function poll() {
    try {
      const isFirst = offset === 0;
      const d = await api('/api/deployments/' + id + '?since=' + offset);
      dep = d;
      offset = d.logCount;
      appendLogs(d.logs, isFirst);
      renderAll();
      if (d.status === 'running') setTimeout(poll, 1500);
    } catch (e) {
      if (/not found/i.test(e.message)) { location.href = '/deployments'; return; }
      toast(e.message, 'error');
      setTimeout(poll, 4000);
    }
  }

  $('summary').addEventListener('click', async function (e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    b.disabled = true;
    try {
      if (b.dataset.act === 'redeploy') {
        const d = await api('/api/deployments/' + id + '/redeploy', { method: 'POST', body: '{}' });
        location.href = '/deployments/' + d.deploymentId;
      } else if (confirm('Remove this app from the cluster and delete its deployment history?')) {
        await api('/api/deployments/' + id, { method: 'DELETE' });
        toast('App deleted', 'success');
        setTimeout(function () { location.href = '/deployments'; }, 1200);
      } else {
        b.disabled = false;
      }
    } catch (err) {
      toast(err.message, 'error');
      b.disabled = false;
    }
  });

  poll();
})();
