FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
COPY . /src/
RUN dotnet publish /src/Nutri.csproj -c Release -o /publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN mkdir -p /var/lib/nutri && chown app:app /var/lib/nutri
COPY --from=build --chown=app:app /publish/ /app/
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Nutri__DataPath=/var/lib/nutri
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "/app/Nutri.dll", "--contentRoot", "/app"]
