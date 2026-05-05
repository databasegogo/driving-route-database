#!/bin/bash
set -e

CONTAINER="driving_route_db"
DB="gisdb"
USER="postgres"

echo "1. Run extensions..."
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/01_create_extensions.sql

echo "2. Import OSM adminareas..."
docker exec -i $CONTAINER bash -lc \
"shp2pgsql -I -s 4326 /data/gis_osm_adminareas_a_free_1.shp adminareas | psql -U $USER -d $DB"

echo "3. Import OSM roads..."
docker exec -i $CONTAINER bash -lc \
"shp2pgsql -I -s 4326 /data/gis_osm_roads_free_1.shp roads | psql -U $USER -d $DB"

echo "4. Run graph/table SQL..."
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/02_filter_guishan.sql
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/03_create_graph_tables.sql

echo "Base database setup completed."
