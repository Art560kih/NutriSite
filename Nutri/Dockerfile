# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
RUN --mount=type=bind,target=/src,rw \
    dotnet publish /src/Nutri.csproj --configuration Release --output /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
RUN --mount=type=bind,from=build,source=/publish,target=/publish \
    mkdir -p /app /var/lib/nutri && \
    cp -R /publish/. /app/ && \
    chown -R app:app /app /var/lib/nutri
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Nutri__DataPath=/var/lib/nutri
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "/app/Nutri.dll", "--contentRoot", "/app"]
