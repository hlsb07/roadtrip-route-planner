# Configuration Guide

This project uses different configuration approaches depending on the environment:
- **Local Development**: .NET User Secrets (secure, not committed to Git)
- **Docker/Production**: Environment variables via `.env` file

## Setup for Local Development

This project uses .NET User Secrets to keep sensitive data secure during local development.

### 1. Initialize User Secrets (Already configured)

Your project already has User Secrets configured with ID: ``

### 2. Set your secrets using the .NET CLI:

Navigate to the project directory and run:

```bash
cd src/backend/RoutePlanner.API

# Database
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=routeplanner;Username=routeplanner_user;Password=YOUR_PASSWORD"

# JWT Settings
dotnet user-secrets set "JwtSettings:Secret" "YOUR_SECRET_KEY_AT_LEAST_32_CHARS"
dotnet user-secrets set "JwtSettings:Issuer" "RoutePlannerAPI"
dotnet user-secrets set "JwtSettings:Audience" "RoutePlannerClient"
dotnet user-secrets set "JwtSettings:AccessTokenExpirationMinutes" "15"
dotnet user-secrets set "JwtSettings:RefreshTokenExpirationDays" "7"

# SMTP Settings
dotnet user-secrets set "SmtpSettings:Host" "smtp.gmail.com"
dotnet user-secrets set "SmtpSettings:Port" "587"
dotnet user-secrets set "SmtpSettings:Username" "your-email@gmail.com"
dotnet user-secrets set "SmtpSettings:Password" "your-app-specific-password"
dotnet user-secrets set "SmtpSettings:FromEmail" "your-email@gmail.com"
dotnet user-secrets set "SmtpSettings:FromName" "Roadtrip Route Planner"

# Google Maps API
dotnet user-secrets set "GoogleMaps:ApiKey" "YOUR_GOOGLE_MAPS_API_KEY"

# Frontend URL
dotnet user-secrets set "FrontendUrl" "http://localhost/roadtriprouteplanner"
```

### 3. List your configured secrets:

```bash
dotnet user-secrets list
```

### 4. Run the application:

```bash
cd src/backend/RoutePlanner.API
dotnet run
```

User Secrets are automatically loaded in Development mode and override values from `appsettings.json`.

## Setup for Docker Production

1. **Edit `.env` with production values:**
   - Update database credentials
   - Set `ASPNETCORE_ENVIRONMENT=Production`
   - Use strong passwords and secrets

2. **Start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

3. **Check logs:**
   ```bash
   docker-compose logs -f
   ```

4. **Stop services:**
   ```bash
   docker-compose down
   ```

## Configuration Naming Convention

### User Secrets (Development)
Use colons (`:`) to represent nested configuration:
- `JwtSettings:Secret`
- `ConnectionStrings:DefaultConnection`

### Environment Variables (Docker/Production)
Use double underscores (`__`) to represent nested configuration:
- `JwtSettings__Secret` → `JwtSettings:Secret` in appsettings.json
- `ConnectionStrings__DefaultConnection` → `ConnectionStrings:DefaultConnection`

## Security Best Practices

1. **User Secrets are stored locally** in your user profile (not in the project directory)
2. **Never commit `.env` to Git** (already in `.gitignore`)
3. **Use strong, random secrets** for JWT and passwords
4. **Use app-specific passwords** for Gmail SMTP (not your regular password)
5. **Rotate secrets regularly** in production
6. **For production**: Consider using Docker secrets, Kubernetes secrets, or cloud provider secret management (Azure Key Vault, AWS Secrets Manager)

## Generating Secure JWT Secret

```bash
# Linux/Mac
openssl rand -base64 64

# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Docker Environment Variables

The `docker-compose.yml` automatically loads variables from `.env`. You can override specific variables:

```bash
ASPNETCORE_ENVIRONMENT=Production docker-compose up
```

## Troubleshooting

### User Secrets not loading (Development)
- Ensure you're running in Development mode: `ASPNETCORE_ENVIRONMENT=Development`
- Verify secrets are set: `dotnet user-secrets list`
- Check UserSecretsId in `.csproj` matches your configured secrets

### Docker can't read .env file
- Ensure `.env` is in the project root directory (same directory as `docker-compose.yml`)
- Verify the `env_file` directive in `docker-compose.yml`
- Check file permissions on Linux/Mac

### Database connection fails
- Check PostgreSQL is running: `docker-compose ps`
- Verify connection string in `.env`
- Check database credentials

### SMTP errors
- For Gmail: Use app-specific password, not your regular password
- Port 587 requires STARTTLS
- Port 465 requires SSL

### JWT token errors
- Ensure `JwtSettings__Secret` is at least 32 characters
- Verify all JWT settings are configured
- Check token expiration times
