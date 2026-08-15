# CLAUDE.md

## Deployment

### Production target

- Hosted on **AWS EC2**, not the home-lab server. Instance `i-0d3b8e61062dedab9` (`t4g.micro`, `ap-southeast-2`/Sydney), tagged `Name=urlchecker-app`.
- Static IP via Elastic IP `3.107.139.183` (AllocationId `eipalloc-0b403edea20acd771`) — this is what `urlchecker.nzweb.dev` A-records to (proxied through Cloudflare).
- Runs via Docker Compose on the instance at `/opt/urlchecker/app`, using **`docker-compose.aws.yml`** (tracked in this repo). This is *not* the same as the gitignored `docker-compose.yml` in the repo root — that's the old home-lab compose file, decommissioned (see below).
- TLS is terminated directly by `server.js` using a Cloudflare Origin CA certificate — no reverse proxy (no SWAG/nginx) in front of it on this instance. Cloudflare zone SSL mode is Full (strict).
- Cloudflare Access still gates the app (Google IdP, a single `allow`-decision app). The old per-path "Bypass" app is gone — not needed once the origin stopped being Tunnel-backed.
- `server.js` verifies the Cloudflare Access JWT server-side (`Cf-Access-Jwt-Assertion` against Cloudflare's JWKS) rather than trusting the `Cf-Access-Authenticated-User-Email` header alone — defense in depth, since this instance has a real public IP.
- Inbound network access is locked to Cloudflare's published IP ranges only, port 443 only (Security Group `urlchecker-web-sg` / `sg-0123d145a11711729`). Port 22 is not open — there is no SSH access to this instance.

### How to deploy

Push to `main` on GitHub (`joshmens/url_redirect_checker`). `.github/workflows/deploy.yml` handles the rest:

1. Assumes AWS role `urlchecker-github-deploy` via GitHub OIDC (no long-lived AWS keys stored in GitHub).
2. Runs `cd /opt/urlchecker/app && git pull && docker compose -f docker-compose.aws.yml up -d --build` on the instance via **AWS Systems Manager (SSM) Run Command** — not SSH.

No manual step should normally be needed beyond `git push origin main`.

### Access needed to manage this

- **AWS**: a scoped IAM user/role, not root — EC2/IAM/SSM/EventBridge Scheduler permissions restricted to `urlchecker-*`-named resources. All shell access to the instance goes through SSM Session Manager/Run Command (no SSH keys, no open port 22).
- **Cloudflare**: a scoped API token (DNS edit + Access apps read/edit, scoped to the `nzweb.dev` zone), not the Global API Key.
- Neither credential is stored anywhere persistent in this environment — request/regenerate short-lived credentials per work session and revoke them when done.

### Decommissioned home-lab setup — do not "fix"

- This app used to run on the home-lab Docker host, reverse-proxied by `swag-nzweb` (nginx) and reached via a dedicated Cloudflare Tunnel (`nzweb-tunnel`), gated by a two-app Cloudflare Access setup (a main `allow` app plus a per-path `bypass` app for `/static/*` and `/socket.io/*`).
- That Tunnel + Bypass combination was the site of a suspected Cloudflare platform bug (Access intermittently serving a different Tunnel-backed origin's content instead of this app's), which is what motivated migrating to AWS.
- As part of cutting over, the nginx reverse-proxy config for `urlchecker.nzweb.dev` was deliberately removed from `swag-nzweb` (`/config/nginx/proxy-confs/urlchecker.subdomain.conf` no longer exists there). **This is intentional, not broken.** Do not recreate it or try to restore routing for this app on the home-lab host.
- The local `url_redirect_checker` Docker container / gitignored `docker-compose.yml` on the home-lab host is a leftover pre-migration artifact, not the production target. Don't start, rebuild, or treat it as prod.
- `nzweb-tunnel` and `swag-nzweb` are still legitimately used by other apps on that host (e.g. `omniroute.nzweb.dev`) — don't remove the tunnel or the swag-nzweb container itself, just don't route this app through them again.

### Known gaps

- The planned cost-saving scheduled stop/start (6am–7pm NZT, to reduce running costs) is **not currently active** — no EventBridge Scheduler schedules exist for this instance yet, so it runs continuously.
- The instance is a `t4g.micro` (1 vCPU, ~1GB RAM) — fine for running the app, but slow for `docker compose build` (the React production build takes 2+ minutes here). This is the root cause of GitHub Actions occasionally reporting a deploy as "failed" via an SSM wait timeout even when it actually succeeded.

**Keep this section current**: whenever the deployment target or method changes, update this file (and the corresponding project memory) as part of that change, without waiting to be asked.
