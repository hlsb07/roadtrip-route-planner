FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app

COPY ./publish/ .

ENV ASPNETCORE_URLS=http://+:5166
EXPOSE 5166

ENTRYPOINT ["dotnet", "RoutePlanner.API.dll"]
