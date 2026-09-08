# Deploying Viduthalai

## First-time setup on the VPS

```bash
git clone <your-repo-url> viduthalai
cd viduthalai
cp .env.prod.example .env.prod
```

Fill in `.env.prod`: `POSTGRES_PASSWORD`, `JWT_SECRET` (`openssl rand -hex 32`), `ENCRYPTION_KEY`
(`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`),
`CORS_ORIGINS`, and `NEXT_PUBLIC_API_URL` — all to match your real domain.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This runs Postgres, Redis, the backend API (`127.0.0.1:8000`), the frontend
(`127.0.0.1:3000`), and the RQ worker that processes GitLab webhooks. Nothing
is exposed publicly except through your own nginx.

## Point your VPS nginx at it

Proxy the frontend at `/` and the backend at `/api/` (matching `NEXT_PUBLIC_API_URL`
in `.env.prod` — use a subdomain instead if you'd rather not split by path):

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

GitLab webhooks land on `/api/webhooks/gitlab/{org_id}` — the org's GitLab
settings page shows the exact URL and secret to paste into each GitLab
project's webhook config once this is live.

## Redeploying after a code change

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Migrations run automatically on backend container start (`alembic upgrade head`).

## Logs / troubleshooting

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f worker
```
