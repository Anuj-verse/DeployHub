const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const store = require('../services/store');
const gh = require('../services/github');

const router = express.Router();
const NAME_RE = /^[\w.-]+$/;

router.get('/repos', requireAuth, (req, res) => {
  res.render('repos', { title: 'Repositories', active: 'repos', scripts: ['/js/repos.js'] });
});

function ghError(res, e) {
  if (e.status === 401) return res.status(401).json({ error: 'GitHub rejected your token. Please log in again.' });
  if (e.status === 404) return res.status(404).json({ error: 'Not found on GitHub (or no access).' });
  console.error('GitHub API error:', e.status, e.message);
  return res.status(502).json({ error: 'GitHub API error. Try again in a moment.' });
}

router.get('/api/repos', requireAuth, async (req, res) => {
  try {
    const repos = await gh.listRepos(req.session.token);
    const login = req.session.user.login;
    res.json({
      repos: repos.map((r) => {
        const d = store.latestFor(login, r.fullName);
        return { ...r, deployment: d ? { id: d.id, status: d.status, url: d.url } : null };
      }),
    });
  } catch (e) { ghError(res, e); }
});

// @@REPO_API@@

module.exports = router;
