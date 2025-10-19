# Nginx Installation Guide

## Step 1: Download Nginx
1. Go to: http://nginx.org/en/download.html
2. Download the **Stable version** (e.g., nginx/Windows-1.24.0)
3. Download the ZIP file (e.g., `nginx-1.24.0.zip`)

## Step 2: Extract to C:\nginx
1. Extract the downloaded ZIP file
2. Move the contents to `C:\nginx`
3. You should have:
   - `C:\nginx\nginx.exe`
   - `C:\nginx\conf\nginx.conf`
   - `C:\nginx\html\`
   - `C:\nginx\logs\`

## Step 3: Test Installation
Open PowerShell or Command Prompt and run:
```bash
cd C:\nginx
.\nginx.exe -v
```

You should see output like: `nginx version: nginx/1.24.0`

## Step 4: Start Nginx
```bash
cd C:\nginx
start nginx
```

## Step 5: Test Default Page
Open browser and go to: http://localhost

You should see "Welcome to nginx!" page.

## Common Commands

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

## Troubleshooting

**Port 80 already in use?**
- Check if IIS or another web server is running
- Stop IIS: Open Services, find "World Wide Web Publishing Service", stop it
- Or change Nginx port in nginx.conf

**Permission errors?**
- Run Command Prompt or PowerShell as Administrator

## Next Steps
After installation, replace `C:\nginx\conf\nginx.conf` with the configuration file for this project.
