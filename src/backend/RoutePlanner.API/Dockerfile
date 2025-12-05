# ============================================
# Build Stage (klein & schnell dank Alpine)
# ============================================
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src

# Copy all source files into container
COPY . .

# Restore dependencies
RUN dotnet restore

# Publish the application (Release mode)
RUN dotnet publish -c Release -o /app/publish


# ============================================
# Runtime Stage (nur Runtime — sehr kleines Image)
# ============================================
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app

# Copy published output
COPY --from=build /app/publish .

# ASP.NET binds to this URL
ENV ASPNETCORE_URLS=http://0.0.0.0:5000
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5000

# Start the app
ENTRYPOINT ["dotnet", "RoutePlanner.API.dll"]
