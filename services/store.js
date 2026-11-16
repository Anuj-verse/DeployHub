// In-memory state (no database by design). Resets when the server restarts.
const crypto = require('crypto');

const STAGES = ['Cloning', 'Detecting', 'Generating', 'Building', 'Pushing', 'Deploying', 'Live'];
const deployments = new Map(); // id -> deployment
const links = new Map();       // "owner/repo" -> config used by webhook redeploys
const MAX_LOG_LINES = 5000;

function create({ fullName, branch, ownerLogin, trigger = 'manual', port = null, replicas = 2 }) {
  const id = crypto.randomBytes(5).toString('hex');
  const dep = {
    id, fullName, repo: fullName.split('/')[1], branch, ownerLogin, trigger,
    requestedPort: port, port, replicas,
    status: 'running',          // running | live | failed
    stage: 'Queued', stageIndex: -1, failedIndex: null, error: null,
    commit: null, stack: null, image: null, url: null, appName: null, namespace: null,
    logs: [], startedAt: Date.now(), finishedAt: null,
  };
  deployments.set(id, dep);
  return dep;
}

function log(dep, line) {
  if (dep.logs.length >= MAX_LOG_LINES) return;
  const ts = new Date().toTimeString().slice(0, 8);
  dep.logs.push(`${ts}  ${line}`);
  if (dep.logs.length === MAX_LOG_LINES) dep.logs.push(`${ts}  ... log truncated`);
}

const get = (id) => deployments.get(id);
const key = (fullName) => fullName.toLowerCase();

function listByOwner(login) {
  return [...deployments.values()]
    .filter((d) => d.ownerLogin === login)
    .sort((a, b) => b.startedAt - a.startedAt);
}
function latestFor(login, fullName) {
  return listByOwner(login).find((d) => key(d.fullName) === key(fullName));
}
function isRunning(fullName) {
  return [...deployments.values()].some((d) => d.status === 'running' && key(d.fullName) === key(fullName));
}
function removeApp(login, fullName) {
  for (const [id, d] of deployments) {
    if (d.ownerLogin === login && key(d.fullName) === key(fullName)) deployments.delete(id);
  }
}
const publicView = ({ logs, ...rest }) => rest; // never leaks logs list in listings

const setLink = (fullName, v) => links.set(key(fullName), { ...(links.get(key(fullName)) || {}), fullName, ...v });
const getLink = (fullName) => links.get(key(fullName));
const deleteLink = (fullName) => links.delete(key(fullName));

module.exports = {
  STAGES, create, log, get, listByOwner, latestFor, isRunning, removeApp, publicView,
  setLink, getLink, deleteLink,
};
