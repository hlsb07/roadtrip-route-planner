# Nur Runtime – kein Build, kein Restore
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime
WORKDIR /app

# Wir kopieren nur das lokal veröffentlichte Publish-Output
COPY ./publish ./

ENV ASPNETCORE_URLS=http://0.0.0.0:5000
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5000

ENTRYPOINT ["dotnet", "RoutePlanner.API.dll"]
