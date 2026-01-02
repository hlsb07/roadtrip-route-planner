# Deployment Guide

Guide for deploying the Roadtrip Route Planner to your server with Docker and external Nginx.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ External Nginx Reverse Proxy (proxy-network)   │
│ - Handles SSL/TLS                               │
│ - Routes /roadtriprouteplanner → Frontend      │
│ - Routes /roadtriprouteplanner/api → Backend   │
└─────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐              ┌───────▼────────┐
│   Frontend     │              │    Backend     │
│  (Static HTML) │              │   (.NET API)   │
│  Port: -       │              │  Port: 5166    │
└────────────────┘              └───────┬────────┘
                                        │
                                ┌───────▼────────┐
                                │   PostgreSQL   │
                                │   + PostGIS    │
                                │  Port: 5432    │
                                └────────────────┘
```

## Prerequisites

- Docker and Docker Compose installed
- External Nginx already configured with `proxy-network`
- Domain or subdomain configured

## Step 1: Prepare Production Environment

### On Your Local Machine

1. **Create production environment file:**
   ```bash
   cp .env.production.example .env.production
   ```

2. **Edit `.env.production` with production values:**
   ```bash
   nano .env.production
   ```

   Update these critical values:
   - `JwtSettings__Secret`: Generate with `openssl rand -base64 64`
   - `SmtpSettings__Password`: Your production email password
   - `GoogleMaps__ApiKey`: Your production API key
   - `FrontendUrl`: Your production domain
   - `PGADMIN_PASSWORD`: Strong password for pgAdmin

3. **Build the Docker image locally (optional):**
   ```bash
   docker-compose build
   ```

## Step 2: Transfer Files to Server

### Option A: Using Git (Recommended)

```bash
# On server
cd ~/docker
git clone https://github.com/yourusername/RoadtripRoutPlanner.git roadtripRoutePlanner
cd roadtripRoutePlanner

# Copy your production env file (from local machine)
scp .env.production your-server:~/docker/roadtripRoutePlanner/.env
```

### Option B: Using SCP

```bash
# From your local machine
scp -r RoadtripRoutePlanner your-server:~/docker/roadtripRoutePlanner

# Then on server, copy production env
cd ~/docker/roadtripRoutePlanner
cp .env.production .env
```

## Step 3: Deploy with Docker Compose

### On Your Server

1. **Navigate to deployment directory:**
   ```bash
   cd ~/docker/roadtripRoutePlanner
   ```

2. **Create required directories:**
   ```bash
   mkdir -p init-scripts
   ```

3. **Start the services:**
   ```bash
   # Using production environment file
   docker-compose --env-file .env.production up -d

   # Or if you copied to .env
   docker-compose up -d
   ```

4. **Check container status:**
   ```bash
   docker-compose ps
   ```

5. **View logs:**
   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f backend
   docker-compose logs -f postgres
   ```

## Step 4: Configure External Nginx

Add this to your existing Nginx configuration:

```nginx
# Frontend - Static files
location /roadtriprouteplanner {
    alias /path/to/roadtripRoutePlanner/src/frontend/public;
    index index.html;
    try_files $uri $uri/ /roadtriprouteplanner/index.html;
}

# Backend API - Reverse proxy to Docker container
location /roadtriprouteplanner/api {
    proxy_pass http://localhost:5166/api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection keep-alive;
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Shared images
location /roadtriprouteplanner/images {
    alias /path/to/roadtripRoutePlanner/src/shared;
}
```

Then reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5: Database Initialization

### First-time setup:

1. **Run migrations:**
   ```bash
   docker-compose exec backend dotnet ef database update
   ```

2. **Or access the database directly:**
   ```bash
   docker-compose exec postgres psql -U routeplanner_user -d routeplanner
   ```

3. **Access pgAdmin** (optional):
   - URL: `http://your-server-ip:8081`
   - Email: `override-with-env@example.com`
   - Password: (from your .env PGADMIN_PASSWORD)

## Step 6: Create Admin User

```bash
# Create first user via API
curl -X POST http://your-server-ip:5166/api/admin/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "override-with-env@example.com",
    "username": "jan",
    "password": "YourSecurePassword123!@#"
  }'
```

## Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

### Backup Database

```bash
# Manual backup
docker-compose exec postgres pg_dump -U routeplanner_user routeplanner > backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U routeplanner_user routeplanner < backup_20250101.sql
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend

# Rebuild and restart
docker-compose up -d --build
```

### Stop Services

```bash
# Stop all (keep data)
docker-compose down

# Stop and remove volumes (WARNING: deletes database)
docker-compose down -v
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Database not ready: Wait for postgres healthcheck
# - Port 5166 in use: Change port in docker-compose.yml
# - Missing .env file: Ensure .env exists with all required variables
```

### Database connection errors

```bash
# Check postgres is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U routeplanner_user -d routeplanner -c "SELECT version();"

# Check connection string in .env
# Should use 'postgres' as host (service name), not IP
```

### Cannot access API through Nginx

```bash
# Check backend is accessible directly
curl http://localhost:5166/api/health

# Check Nginx configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Out of disk space

```bash
# Clean up Docker
docker system prune -a

# Remove old images
docker image prune -a

# Check database size
docker-compose exec postgres du -sh /var/lib/postgresql/data
```

## Security Checklist

- [ ] Changed default passwords in `.env.production`
- [ ] Generated strong JWT secret (64+ characters)
- [ ] Enabled HTTPS in Nginx
- [ ] Firewall configured (only 80, 443 exposed externally)
- [ ] Database port 5432 only accessible from localhost
- [ ] pgAdmin protected with strong password
- [ ] Regular database backups configured
- [ ] Log rotation configured
- [ ] Monitoring setup (optional)

## Monitoring

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df

# Container health
docker-compose ps
```

### Application Health

```bash
# Check API health
curl http://localhost:5166/health

# Check database
docker-compose exec postgres pg_isready -U routeplanner_user
```

## Production Optimizations

1. **Use production logging level** (Warning instead of Information)
2. **Enable connection pooling** (default in EF Core)
3. **Consider self-hosting OSRM** for better routing performance
4. **Setup log aggregation** (e.g., ELK stack)
5. **Configure backups** (automated database backups)
6. **Setup monitoring** (Prometheus + Grafana)
7. **Use CDN** for static assets (optional)
