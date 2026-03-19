# Sutaeru Deployment Guide

## Option 1: Coolify UI (Recommended)

1. Open Coolify UI: http://localhost:8000
2. Login with: admin@localhost / 1234rfv
3. Create new Project: "Sutaeru"
4. Add Resource → Git Repository
5. Repository: https://github.com/remyzardap/sr1
6. Branch: main
7. Build Pack: Docker
8. Port: 5000

### Environment Variables
Copy from `/home/ubuntu/S1PRONTO-main/.env`:
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL` (use Coolify managed PostgreSQL)
- `SESSION_SECRET` (generate new)
- `VITE_APP_ID=sutaeru`
- Add LLM API keys as needed

### Pre-deploy Command
```bash
npm run migrate
```

## Option 2: Docker Compose (Local)

```bash
cd /home/ubuntu/S1PRONTO-main
docker-compose up -d --build
```

Access at: http://localhost:5000

## Option 3: Manual Docker Build

```bash
cd /home/ubuntu/S1PRONTO-main
docker build -t sutaeru:latest .
docker run -d -p 5000:5000 --env-file .env sutaeru:latest
```

## Post-Deployment

1. Run database migrations
2. Configure domain/SSL
3. Set up email service
4. Add LLM API keys
5. Test Kemma agent
