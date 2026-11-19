(function () {
  const wrap = document.getElementById('wrap');

  function render(list) {
    if (!list.length) {
      wrap.innerHTML =
        '<div class="empty-state">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>' +
          '<h3>No deployments recorded yet</h3>' +
          '<p class="muted">Deploy a repository to see its build and rollout history here.</p>' +
          '<a class="btn btn-primary btn-sm" href="/repos">Deploy Your First Repository</a>' +
        '</div>';
      return;
    }

    wrap.innerHTML =
      '<div class="table-responsive"><table class="deploy-table">' +
        '<thead><tr>' +
          '<th>Repository</th>' +
          '<th>Branch</th>' +
          '<th>Commit</th>' +
          '<th>Pipeline Status</th>' +
          '<th>Trigger</th>' +
          '<th>Started</th>' +
          '<th>Duration</th>' +
          '<th>Endpoint</th>' +
        '</tr></thead>' +
        '<tbody>' +
          list.map(function (d) {
            return '<tr data-href="/deployments/' + esc(d.id) + '">' +
              '<td><strong>' + esc(d.fullName) + '</strong></td>' +
              '<td><span class="chip">' + esc(d.branch) + '</span></td>' +
              '<td>' + (d.commit ? '<span class="chip mono">' + esc(d.commit.slice(0, 7)) + '</span>' : '<span class="muted">—</span>') + '</td>' +
              '<td>' + statusPill(d) + '</td>' +
              '<td><span class="trigger-badge">' + esc(d.trigger) + '</span></td>' +
              '<td>' + timeAgo(d.startedAt) + '</td>' +
              '<td>' + fmtDuration((d.finishedAt || Date.now()) - d.startedAt) + '</td>' +
              '<td>' + (d.url ? '<a class="endpoint-link" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.url.replace(/^https?:\/\//, '')) + '</a>' : '<span class="muted">—</span>') + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table></div>';
  }

  wrap.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr[data-href]');
    if (tr) location.href = tr.dataset.href;
  });

  async function load() {
    try {
      const d = await api('/api/deployments');
      render(d.deployments);
      if (d.deployments.some(function (x) { return x.status === 'running'; })) {
        setTimeout(load, 3000);
      }
    } catch (e) {
      wrap.innerHTML = '<div class="empty-state error"><p>' + esc(e.message) + '</p></div>';
    }
  }

  load();
})();
