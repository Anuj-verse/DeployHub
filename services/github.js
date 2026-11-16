// Thin wrapper around Octokit. The user's token is passed per call, never stored here.
const { Octokit } = require('@octokit/rest');

const client = (token) => new Octokit({ auth: token, userAgent: 'deployhub' });

async function listRepos(token) {
  const { data } = await client(token).rest.repos.listForAuthenticatedUser({
    per_page: 100, sort: 'pushed', direction: 'desc',
  });
  return data.map((r) => ({
    id: r.id, name: r.name, fullName: r.full_name, description: r.description,
    language: r.language, private: r.private, pushedAt: r.pushed_at,
    defaultBranch: r.default_branch, htmlUrl: r.html_url, archived: r.archived,
  }));
}

// Also serves as the access check: GitHub 404s if the token's user cannot see the repo.
async function getRepo(token, owner, repo) {
  const { data } = await client(token).rest.repos.get({ owner, repo });
  return data;
}

module.exports = { client, listRepos, getRepo };
