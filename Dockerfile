FROM postgis/postgis:14-3.2

RUN apt-get update && apt-get install -y \
    postgresql-14-pgrouting \
    postgis \
    && rm -rf /var/lib/apt/lists/*