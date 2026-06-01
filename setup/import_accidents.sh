#!/bin/bash
# import_accidents.sh
# Step 2 of 2: Import accident data, build risk scores and all app tables.
# Run AFTER init_db.sh
#
# Required files in data/raw/ folder:
#   accidents_a1.csv
#   accidents_a2.csv

set -e

CONTAINER="driving_route_db"
DB="gisdb"
USER="postgres"

# Check CSV files exist
if [ ! -f "data/raw/accidents_a1.csv" ]; then
  echo "❌ Missing: data/raw/accidents_a1.csv"
  exit 1
fi
if [ ! -f "data/raw/accidents_a2.csv" ]; then
  echo "❌ Missing: data/raw/accidents_a2.csv"
  exit 1
fi

echo "=== [1/6] Import accident CSV ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/04_import_accidents.sql

echo "=== [2/6] Match accidents to road edges ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/05_match_accident_to_edge.sql

echo "=== [3/6] Build edge risk scores ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/06_edge_risk_v1.sql

echo "=== [4/6] Create normalized 3NF tables ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/07_create_3nf_tables.sql

echo "=== [5/6] Create user and route tables ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/08_create_user_route_tables.sql

echo "=== [6/6] Build routing helper tables ==="
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/09_routing_helpers.sql

echo ""
echo "✅ Full database setup completed. Ready to start backend."
