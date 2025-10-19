# Roadtrip Route Planner - Nginx Production Setup

This guide explains how to run your application with Nginx reverse proxy for professional static file serving.

## Architecture Overview

```
User Browser
    ↓
Nginx (Port 80) - http://localhost
    ├─→ /api/*          → Backend API (localhost:5166)
    ├─→ /images/*       → Shared Images Directory
    └─→ /*              → Frontend Static Files
```

## Directory Structure

```
RoadtripRoutPlanner/
├── src/
│   ├── backend/
│   │   └── RoutePlanner.API/      (Backend runs on port 5166)
│   ├── frontend/
│   │   └── public/                 (Frontend served by Nginx)
│   └── shared/
│       └── images/                 (Images served by Nginx)
│           └── campsites/
│               ├── types/          (SVG icons for campsite types)
│               ├── services/       (SVG icons for services)
│               ├── activities/     (SVG icons for activities)
│               └── *.jpg           (Campsite photos)
├── nginx/
│   ├── nginx.conf                  (Nginx configuration)
│   └── setup-nginx.bat             (Setup script)
└── docs/
    └── nginx-installation.md       (Installation guide)
```

## Setup Steps

### 1. Install Nginx (One-time)

See `docs/nginx-installation.md` for detailed instructions.

**Quick steps:**
1. Download Nginx from http://nginx.org/en/download.html
2. Extract to `C:\nginx`
3. Test: `cd C:\nginx && .\nginx.exe -v`

### 2. Configure Nginx (One-time)

Run the setup script:
```bash
cd C:\Users\JanHu\Documents\Coding\RoadtripRoutPlanner\nginx
.\setup-nginx.bat
```

This will:
- Backup existing nginx.conf
- Copy the project's nginx.conf to C:\nginx\conf\
- Test the configuration

### 3. Start the Application

**Step 1: Start the Backend API**
```bash
cd C:\Users\JanHu\Documents\Coding\RoadtripRoutPlanner\src\backend\RoutePlanner.API
dotnet run
```

Backend will start on: `http://localhost:5166`

**Step 2: Start Nginx**
```bash
cd C:\nginx
start nginx
```

**Step 3: Access the Application**

Open your browser to: **http://localhost**

That's it! Nginx is now:
- Serving your frontend from `/src/frontend/public/`
- Proxying API calls to your backend at `localhost:5166`
- Serving images from `/src/shared/images/`

## How It Works

### Frontend Requests:

1. **HTML/CSS/JS Files**
   - Request: `http://localhost/index.html`
   - Nginx serves from: `C:/Users/JanHu/Documents/Coding/RoadtripRoutPlanner/src/frontend/public/index.html`

2. **API Calls**
   - Frontend calls: `/api/campsites/all`
   - Browser sends: `http://localhost/api/campsites/all`
   - Nginx proxies to: `http://localhost:5166/api/campsites/all`
   - Backend responds

3. **Campsite Images**
   - Database has: `/images/campsites/types/camping.svg`
   - Browser requests: `http://localhost/images/campsites/types/camping.svg`
   - Nginx serves from: `C:/Users/JanHu/Documents/Coding/RoadtripRoutPlanner/src/shared/images/campsites/types/camping.svg`

### Backend Image Saving:

When scraping Park4Night:
1. Backend downloads images
2. Saves to: `C:/Users/JanHu/.../src/shared/images/campsites/`
3. Stores path in database: `/images/campsites/types/camping.svg`
4. Frontend requests: `http://localhost/images/campsites/types/camping.svg`
5. Nginx serves the file

## Common Nginx Commands

**Start Nginx:**
```bash
cd C:\nginx
start nginx
```

**Stop Nginx:**
```bash
cd C:\nginx
.\nginx.exe -s stop
```

**Reload configuration (after changes):**
```bash
cd C:\nginx
.\nginx.exe -s reload
```

**Test configuration:**
```bash
cd C:\nginx
.\nginx.exe -t
```

**Check if Nginx is running:**
```bash
tasklist /FI "IMAGENAME eq nginx.exe"
```

## Troubleshooting

### Issue: Port 80 already in use

**Symptoms:** Nginx fails to start or "Address already in use"

**Solution:**
```bash
# Check what's using port 80
netstat -ano | findstr :80

# If it's IIS, stop it:
# Open Services → Find "World Wide Web Publishing Service" → Stop

# Or change Nginx port in nginx.conf:
# listen 8080;  # Instead of listen 80;
```

### Issue: 404 errors for frontend files

**Symptoms:** Browser shows 404 when loading index.html

**Check:**
1. Verify path in nginx.conf matches your actual path:
   ```nginx
   root C:/Users/JanHu/Documents/Coding/RoadtripRoutPlanner/src/frontend/public;
   ```
2. Check Nginx error log: `C:\nginx\logs\error.log`

### Issue: API calls fail (CORS or 502 errors)

**Check:**
1. Is backend running? Visit `http://localhost:5166/api/campsites/all` directly
2. Check Nginx error log: `C:\nginx\logs\error.log`
3. Verify backend URL in nginx.conf:
   ```nginx
   upstream backend_api {
       server localhost:5166;
   }
   ```

### Issue: Images not loading (404 errors)

**Check:**
1. Verify images exist in shared directory:
   ```bash
   dir C:\Users\JanHu\Documents\Coding\RoadtripRoutPlanner\src\shared\images\campsites\types
   ```
2. Check path in nginx.conf:
   ```nginx
   location /images/ {
       alias C:/Users/JanHu/Documents/Coding/RoadtripRoutPlanner/src/shared/images/;
   }
   ```
3. Check browser console for exact URL being requested
4. Visit directly: `http://localhost/images/` (should show directory listing if `autoindex on`)

### Issue: Backend still saving to wwwroot

**Solution:** Make sure you've updated `Park4NightScraperService.cs` and restarted the backend.

**Verify:**
```bash
# Check backend logs when scraping
# Should see: "Using shared images directory: C:\Users\...\shared\images\campsites"
```

## Development Mode (Without Nginx)

If you want to develop without Nginx:

1. **Update config.js:**
   ```javascript
   API_BASE: 'http://localhost:5166/api'
   ```

2. **Start backend:**
   ```bash
   cd src/backend/RoutePlanner.API
   dotnet run
   ```

3. **Serve frontend with any web server:**
   ```bash
   # Option 1: Python
   cd src/frontend/public
   python -m http.server 8080

   # Option 2: Node.js http-server
   npm install -g http-server
   cd src/frontend/public
   http-server -p 8080
   ```

4. **Access:** `http://localhost:8080`

**Note:** In dev mode, images will still be served from the shared directory by the backend's static files middleware (if you add it back).

## Production Deployment

For production on a real server:

1. **Use domain name** instead of localhost
2. **Enable HTTPS** in Nginx config
3. **Remove `autoindex on`** from images location
4. **Add proper logging** and monitoring
5. **Use environment variables** for configuration
6. **Consider Docker** for containerization

## File Manifest

**Created/Modified Files:**

1. ✅ `src/shared/images/campsites/` - Shared images directory
2. ✅ `nginx/nginx.conf` - Nginx configuration
3. ✅ `nginx/setup-nginx.bat` - Setup script
4. ✅ `docs/nginx-installation.md` - Installation guide
5. ✅ `src/backend/.../Park4NightScraperService.cs` - Updated to use shared directory
6. ✅ `src/frontend/public/js/config.js` - Updated to use Nginx paths
7. ✅ `src/frontend/public/js/map.js` - Updated icon URL handling
8. ✅ `README-NGINX-SETUP.md` - This file

## Support

If you encounter issues:

1. Check Nginx error log: `C:\nginx\logs\error.log`
2. Check Nginx access log: `C:\nginx\logs\access.log`
3. Check backend console output
4. Check browser developer console (F12)
5. Verify all paths in configuration files

## Summary

**With Nginx (Production):**
- ✅ Professional static file serving
- ✅ Single domain (no CORS issues)
- ✅ Fast image serving
- ✅ Easy HTTPS setup later
- ✅ Scalable architecture

**Key URLs:**
- Frontend: `http://localhost`
- API: `http://localhost/api/*` (proxied)
- Images: `http://localhost/images/*` (served by Nginx)
- Backend direct: `http://localhost:5166` (for testing)
