# DeployHub

Automated CI/CD platform: sign in with GitHub, pick a repository, and DeployHub clones it, generates a Dockerfile (if needed), builds and pushes the image, and deploys it to a managed Kubernetes cluster. A GitHub webhook redeploys on every push.

```
Browser ──> Express (DeployHub)
              │  1. GitHub OAuth ───────────────> GitHub (login, repo list, branches)
              │  2. git clone (token in URL, redacted in logs)
              │  3. detect stack -> generate Dockerfile
              │  4. docker build + push ────────> Docker Hub
              │  5. kubectl apply (Deployment + Service) ──> Kubernetes (EKS/GKE/AKS/minikube)
              │  6. resolve LoadBalancer / NodePort URL
GitHub push ──> POST /webhook/github (HMAC verified) ──> steps 2-6 again (rolling update)
```

## Build phases (one git commit each: `git log --oneline`)

| Phase | What it adds | Key files |
|---|---|---|
| 1 | Foundation, dark UI shell, login page, in-memory store, safe shell runner | `server.js`, `services/store.js`, `services/shell.js`, `public/css/style.css` |
| 2 | GitHub OAuth (state/CSRF check), repo listing with search + language filter | `routes/auth.js`, `routes/repos.js`, `services/github.js` |
| 3 | Stack detector, Dockerfile templates, k8s manifest generator, 7-stage pipeline | `services/detector.js`, `dockerfiles.js`, `manifest.js`, `pipeline.js` |
| 4 | Deploy API, deploy dialog, deployments table, live detail page (stepper + logs) | `routes/deploy.js`, `public/js/*.js`, `views/*.ejs` |
| 5 | Signed push webhook, auto-registration, auto-redeploy | `routes/webhook.js`, `services/github.js` |
| 6 | Samples, smoke test, this README | `sample-repos/`, `scripts/smoke.js` |
| 7 | Per-user namespaces and image names (multi-user isolation) | `services/pipeline.js` |
| 8 | Restart-safe state (tokens encrypted), optional sign-in allow-list, preflight checker, VM setup scripts | `services/store.js`, `services/access.js`, `scripts/preflight.js`, `scripts/setup-ec2.sh`, `scripts/start.sh` |

## Prerequisites
Node 20+, `git`, `docker` (running), `kubectl` with a working kubeconfig, a Docker Hub account (+ access token), a Kubernetes cluster, and a GitHub OAuth App.

## Setup
1. `npm install`
2. Create a GitHub OAuth App: Settings > Developer settings > OAuth Apps. Callback URL: `<BASE_URL>/auth/callback` (default `http://localhost:3000/auth/callback`).
3. `cp .env.example .env` and fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DOCKER_USER`, `DOCKER_PASS` (or run `docker login` once), `SESSION_SECRET`, `WEBHOOK_SECRET`.
4. Check the cluster: `kubectl get nodes`. Each GitHub user's apps go into their own namespace (`deployhub-<github-login>`), created automatically.
5. `npm start`, then open http://localhost:3000.

### Cloud cluster (EKS/GKE/AKS)
Keep `CLUSTER_MODE=cloud`. Services are type `LoadBalancer`; the URL appears once the cloud assigns an address (up to 2 min). Building on Apple Silicon for an x86 cluster: set `DOCKER_PLATFORM=linux/amd64`.

### Local cluster (no cloud cost)
Use **minikube** (recommended): `minikube start`, then in `.env` set `CLUSTER_MODE=local` and `LOCAL_HOST=$(minikube ip)`. Services become `NodePort`. Local clusters pull images from Docker Hub, so the push step still needs a valid Docker login. With **kind**, NodePorts are not reachable from the host; use `kubectl port-forward svc/<app> 8080:80 -n deployhub` (the log prints this tip).

### Webhook (auto-redeploy)
GitHub cannot reach localhost. Run `ngrok http 3000`, set `BASE_URL` to the https URL (also update the OAuth App callback URL), restart, and deploy once. DeployHub registers the webhook on the first successful deploy. Pushing to the deployed branch then redeploys (Trigger = `webhook`).

## Run on a VM (no laptop needed at the exam)
Ubuntu 22.04 VM (EC2 t3.medium, Elastic IP). Security group: 22 (your IP only), 3000, 30000-32767.
```
git clone <your-repo-url> deployhub && cd deployhub
bash scripts/setup-ec2.sh     # Docker, Node 20, k3s, pm2, deps, .env with generated secrets + detected public IP
nano .env                     # fill GITHUB_CLIENT_ID/SECRET, DOCKER_USER, DOCKER_PASS
# set the GitHub OAuth App callback to http://<public-ip>:3000/auth/callback, log out/in once, then:
bash scripts/start.sh         # runs `npm run preflight`, starts under pm2, enables start-on-boot
```
`npm run preflight` any time to see what is still missing. `ALLOWED_GITHUB_USERS=alice,bob` restricts sign-in (empty = any GitHub user).

## Custom domain and per-app subdomains
Set `APP_DOMAIN=yourdomain.in`. Every deployed repo is served at `http://<repo>.yourdomain.in` through the Ingress (k3s ships Traefik on ports 80/443); the Service stays internal.
1. In your DNS provider add two **A records** pointing to the server's Elastic IP: `deploy` and `*` (wildcard), TTL 300.
2. Security group: allow inbound **80** (and 443 if you add TLS later).
3. `.env`: `APP_DOMAIN=yourdomain.in`, `BASE_URL=http://deploy.yourdomain.in:3000`, then `pm2 restart deployhub --update-env`. Update the GitHub OAuth App callback to `http://deploy.yourdomain.in:3000/auth/callback`.
4. `npm run preflight` verifies Traefik and the wildcard DNS.
Naming: `<repo>.domain`; if another user already owns that name it becomes `<repo>-<user>.domain`; reserved names (`www`, `deploy`, `mail`, ...) get `-app`. A user's app keeps its hostname across redeploys. Without `APP_DOMAIN` the old IP:port URLs are used.

## Demo script (5 minutes)
1. Log in with GitHub, show the repo list (search, language filter).
2. Deploy `sample-repos/node-sample` (push it to your GitHub first). Watch the stepper and logs, then open the live URL.
3. Show the generated Dockerfile in the Generating step logs.
4. Deploy `sample-repos/python-sample` the same way (Flask on 8000).
5. Edit the Node app, `git push`, and show the automatic webhook redeploy and rolling update (`kubectl get pods -A -l managed-by=deployhub -w`).

## Pipeline stages
Clone > Detect > Generate > Build > Push > Deploy > Live. Per-stage timeouts: clone 60s, build 600s, push 300s, rollout 150s, load balancer 120s. One running deployment per repo (409 otherwise). Failures stop the run, mark the failing step, and show the error banner.

## Supported stacks
| Detected by | Result |
|---|---|
| `Dockerfile` | Used as-is (port from `EXPOSE`) |
| `package.json` with a `start` script | `node:20-alpine`, `npm ci`/`npm install`, `npm start`, port 3000 |
| `requirements.txt` + `app.py`/`main.py` | `python:3.12-slim`; gunicorn if listed (needs `app` object); port 8000 |
| `index.html` in root | `nginx:alpine`, port 80 |

The app must listen on `0.0.0.0` and honor the `PORT` env var (set to the container port).

## Security notes
- OAuth `state` check; session regenerated on login; `httpOnly` + `sameSite=lax` cookie (`secure` on https).
- GitHub token stays server-side, never sent to the browser, and is redacted from every log line and error.
- Commands run via `spawn` with argument arrays (no shell). Repo and branch names are validated by regex; k8s names are sanitized; manifest values are JSON-quoted.
- Repo access is confirmed with the user's own token before cloning. Deployments are visible only to their creator.
- Webhook payloads are verified with HMAC-SHA256 (`timingSafeEqual`) over the raw body. `/api/deploy` is rate-limited (10/min per session).

## Known limitations
- State is a JSON file (`data/state.json`), not a database. GitHub tokens in it are AES-256-GCM encrypted with a key derived from `SESSION_SECRET`; changing that secret drops webhook links. Logins (sessions) are in memory, so users sign in again after a restart. A deployment running during a restart is marked failed.
- The clone URL carries the token, so a local `ps` could expose it for the clone's duration. Production fix: Git credential helper or GitHub App installation tokens.
- The server needs Docker socket access, which is effectively root on the host. Production fix: build in-cluster with Kaniko/BuildKit jobs.
- Multi-user: apps are isolated per GitHub user (own namespace, user-prefixed image names), but all users share one cluster and one Docker Hub account. Anyone with a GitHub account can sign in, so restrict access (firewall or an allow-list) on a public server.
- Node apps needing a build step (React, TypeScript) are not supported; Dockerfile repos are.

## Future scope
Database persistence, multi-user RBAC, Helm, Ingress + TLS + custom domains, in-cluster builds (Kaniko), secrets/env-var UI, autoscaling, rollbacks, monitoring dashboards, more languages (Java, Go), monorepo support, Terraform for the cluster.

## Viva Q&A
1. **Why OAuth instead of a personal access token?** The user grants scoped, revocable access without sharing credentials; the secret stays on our server. Scope `repo` allows reading/cloning private repos and creating webhooks.
2. **Why is the image tag the commit SHA?** Immutable and traceable: every running image maps to exact source, and rollback is just redeploying an older tag. `latest` is mutable and hides what is running.
3. **How does a rolling update work?** A new image tag changes the pod template; `kubectl apply` makes the Deployment create new pods (maxSurge 1) and retire old ones only when readiness probes pass (maxUnavailable 0), so there is no downtime. A deploy timestamp annotation forces a rollout even for the same commit.
4. **Why `spawn` over `exec`?** `exec` runs a shell string, so a crafted repo or branch name could inject commands. `spawn` takes an argument array with no shell, and inputs are also validated.
5. **How is the webhook secured?** GitHub signs the raw body with our shared secret; we recompute HMAC-SHA256 and compare in constant time before acting. Only pushes to the deployed branch trigger a run.
6. **Managed vs self-managed Kubernetes?** With EKS/GKE/AKS the provider runs and patches the control plane; we own workloads, images, and manifests. Self-managed means you also operate etcd, API server, and upgrades.
7. **Why no database?** Scope and speed for a demo; state is process memory. Production would persist deployments and webhook links (Postgres) and keep tokens encrypted.
8. **How would this scale?** Move builds to a job queue with in-cluster Kaniko workers, store state in a database, run multiple stateless API replicas behind a load balancer, and use GitHub App tokens instead of user tokens for webhook redeploys.
