#!/bin/bash
# init_db.sh
# Step 1 of 2: Import OSM shapefiles and build road network.
# Run this BEFORE import_accidents.sh
#
# Required files in data/ folder:
#   gis_osm_roads_free_1.shp (+ .dbf .shx .prj)
#   gis_osm_adminareas_a_free_1.shp (+ .dbf .shx .prj)

set -e

CONTAINER="driving_route_db"
DB="gisdb"
USER="postgres"

echo "=== [1/5] Create extensions ==="
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/01_create_extensions.sql

echo "=== [2/5] Import OSM adminareas ==="
docker exec -i $CONTAINER bash -lc \
  "shp2pgsql -I -s 4326 /data/gis_osm_adminareas_a_free_1.shp adminareas | psql -U $USER -d $DB"

echo "=== [3/5] Import OSM roads ==="
docker exec -i $CONTAINER bash -lc \
  "shp2pgsql -I -s 4326 /data/gis_osm_roads_free_1.shp roads | psql -U $USER -d $DB"

echo "=== [4/5] Filter Guishan roads ==="
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/02_filter_guishan.sql

echo "=== [5/5] Build pgRouting topology ==="
docker exec -i $CONTAINER psql -U $USER -d $DB -f /sql/03_create_graph_tables.sql

echo ""
echo "✅ Base road network setup completed."
echo "Next: put accident CSV files in data/raw/ then run import_accidents.sh"
