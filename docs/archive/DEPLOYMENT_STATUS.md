# Sutaeru Deployment Status

## ✅ Successfully Deployed

**URL:** http://localhost:5000  
**Status:** Running  
**Health:** 200 OK

### Infrastructure
- **Container:** sutaeru:latest (Docker)
- **Database:** PostgreSQL (Coolify's coolify-db container)
- **Network:** coolify
- **Port:** 5000

### Database
- Database: sutaeru
- User: sutaeru
- Tables: 25+ tables created (users, blocks, memories, skills, etc.)

### Environment Variables
```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://sutaeru:<REDACTED>@coolify-db:5432/sutaeru
APP_URL=http://localhost:5000
VITE_APP_ID=sutaeru
```

### Services
- Sutaeru Web App: http://localhost:5000
- Coolify UI: http://localhost:8000 (admin@localhost / 1234rfv)
- Traefik Proxy: http://localhost:8080

### Next Steps
1. Configure domain/SSL in Coolify
2. Add API keys (Anthropic, OpenAI, etc.)
3. Set up email service
4. Configure file storage (S3)
5. Test Kemma agent

### Useful Commands
```bash
# View logs
sudo docker logs sutaeru -f

# Restart
sudo docker restart sutaeru

# Update (rebuild and restart)
cd /home/ubuntu/S1PRONTO-main
sudo docker build -t sutaeru:latest .
sudo docker stop sutaeru && sudo docker rm sutaeru
sudo docker run -d --name sutaeru --network coolify -p 5000:5000 \
  -e DATABASE_URL="postgresql://sutaeru:<REDACTED>@coolify-db:5432/sutaeru" \
  -e SESSION_SECRET="your-secret" \
  -e APP_URL="http://localhost:5000" \
  sutaeru:latest
```
