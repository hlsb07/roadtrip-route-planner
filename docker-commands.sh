#!/bin/bash

# ============================================
# Docker Compose Quick Reference
# ============================================

# START SERVICES
# ============================================
# Start all services (detached mode)
docker-compose up -d

# Start specific service
docker-compose up -d backend

# Start with build (rebuild images)
docker-compose up -d --build

# Start with production env file
docker-compose --env-file .env.production up -d


# STOP SERVICES
# ============================================
# Stop all services (keep data)
docker-compose down

# Stop and remove volumes (WARNING: deletes database!)
docker-compose down -v


# RESTART SERVICES
# ============================================
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart backend


# VIEW LOGS
# ============================================
# Follow logs (all services)
docker-compose logs -f

# Follow logs (specific service)
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend

# Save logs to file
docker-compose logs backend > backend.log


# STATUS & MONITORING
# ============================================
# Check container status
docker-compose ps

# Resource usage (CPU, memory)
docker stats

# Inspect container
docker-compose exec backend env | grep ASPNETCORE


# DATABASE OPERATIONS
# ============================================
# Access PostgreSQL
docker-compose exec postgres psql -U routeplanner_user -d routeplanner

# Run SQL file
docker-compose exec -T postgres psql -U routeplanner_user -d routeplanner < script.sql

# Backup database
docker-compose exec postgres pg_dump -U routeplanner_user routeplanner > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
docker-compose exec -T postgres psql -U routeplanner_user routeplanner < backup.sql

# Check database size
docker-compose exec postgres psql -U routeplanner_user -d routeplanner -c "SELECT pg_size_pretty(pg_database_size('routeplanner'));"


# BACKEND OPERATIONS
# ============================================
# Execute command in backend container
docker-compose exec backend bash

# Run EF migrations
docker-compose exec backend dotnet ef database update

# Check backend health
curl http://localhost:5166/health


# CLEANUP
# ============================================
# Remove unused containers, images, networks
docker system prune

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune


# BUILD & PUSH
# ============================================
# Build images
docker-compose build

# Build specific service
docker-compose build backend

# Build without cache
docker-compose build --no-cache


# TROUBLESHOOTING
# ============================================
# Check if containers are running
docker-compose ps

# Check container logs for errors
docker-compose logs backend | grep -i error

# Check port bindings
docker-compose ps | grep -i "5166"

# Access backend shell
docker-compose exec backend bash

# Check environment variables
docker-compose exec backend printenv

# Test database connection
docker-compose exec postgres pg_isready -U routeplanner_user -d routeplanner

# Restart with fresh build
docker-compose down && docker-compose up -d --build


# MIGRATION WORKFLOW
# ============================================
# 1. Get all users
curl http://localhost:5166/api/admin/users

# 2. Migrate user data (sourceUserId: 1, targetUserId: 3)
curl -X POST http://localhost:5166/api/admin/migrate-user-data \
  -H "Content-Type: application/json" \
  -d '{"sourceUserId": 1, "targetUserId": 3}'

# 3. Verify migration
curl http://localhost:5166/api/admin/users/3
