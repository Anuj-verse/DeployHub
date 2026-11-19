(function () {
  const grid    = document.getElementById('grid');
  const search  = document.getElementById('search');
  const langSel = document.getElementById('lang');

  const colors = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    Java: '#b07219', Go: '#00ADD8', HTML: '#e34c26', CSS: '#563d7c',
    Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', Dart: '#00B4AB',
    Rust: '#dea584', Dockerfile: '#384d54',
  };

  let repos = [];

  function deployedBadge(d) {
    if (!d) return '';
    var map = {
      live:    ['pill-live',    'Deployed ✓'],
      running: ['pill-running', 'Deploying'],
      failed:  ['pill-failed',  'Last deploy failed'],
    };
    var m = map[d.status] || map.failed;
    return '<a class="pill ' + m[0] + '" href="/deployments/' + esc(d.id) + '">' + m[1] + '</a>';
  }

  // Book SVG icon
  var bookSvg =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>' +
      '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
    '</svg>';

  // Play SVG icon
  var playSvg =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">' +
      '<polygon points="5 3 19 12 5 21 5 3"/>' +
    '</svg>';

  function card(r) {
    var langChip = r.language
      ? '<span style="display:flex;align-items:center;gap:5px">' +
          '<span class="lang-dot" style="background:' + (colors[r.language] || '#8b949e') + '"></span>' +
          esc(r.language) +
        '</span>'
      : '';

    var branchChip = '<span class="chip">' + esc(r.defaultBranch) + '</span>';
    var pushed     = '<span>pushed ' + timeAgo(r.pushedAt) + '</span>';

    return '<article class="card repo-card">' +
      '<div class="card-top">' +
        '<div class="repo-title-row">' +
          bookSvg +
          '<a class="repo-name" href="' + esc(r.htmlUrl) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a>' +
        '</div>' +
        '<div class="repo-badges">' +
          '<span class="pill ' + (r.private ? 'pill-private' : 'pill-public') + '">' + (r.private ? 'Private' : 'Public') + '</span>' +
          deployedBadge(r.deployment) +
        '</div>' +
      '</div>' +
      '<div class="repo-desc">' + esc(r.description || 'No description provided.') + '</div>' +
      '<div class="card-meta">' + langChip + branchChip + pushed + '</div>' +
      '<div class="card-foot">' +
        '<span class="card-foot-name">' + esc(r.fullName) + '</span>' +
        '<button class="btn btn-primary btn-sm" data-deploy="' + esc(r.fullName) + '">' + playSvg + ' Deploy</button>' +
      '</div>' +
    '</article>';
  }

  function render() {
    var q    = search.value.trim().toLowerCase();
    var lang = langSel.value;
    var list = repos.filter(function (r) {
      return (!q || r.name.toLowerCase().includes(q)) && (!lang || r.language === lang);
    });
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><p class="muted">No repositories match your filter.</p></div>';
      return;
    }
    grid.innerHTML = list.map(card).join('');
  }

  grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-deploy]');
    if (!b) return;
    var repo = repos.find(function (r) { return r.fullName === b.dataset.deploy; });
    if (window.openDeployModal) window.openDeployModal(repo);
    else toast('Deploy dialog not available.', 'info');
  });

  search.addEventListener('input', render);
  langSel.addEventListener('change', render);

  api('/api/repos').then(function (d) {
    repos = d.repos;
    var langs = [...new Set(repos.map(function (r) { return r.language; }).filter(Boolean))].sort();
    langs.forEach(function (l) {
      langSel.insertAdjacentHTML('beforeend', '<option>' + esc(l) + '</option>');
    });
    render();
  }).catch(function (e) {
    grid.innerHTML = '<div class="empty-state error"><p>' + esc(e.message) + '</p></div>';
  });
})();
