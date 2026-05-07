#!/bin/bash
set -e

CONTAINER="driving_route_db"
DB="gisdb"
USER="postgres"

if [ ! -f "data/raw/accidents_a1.csv" ]; then
  echo "Missing file: data/raw/accidents_a1.csv"
  exit 1
fi

if [ ! -f "data/raw/accidents_a2.csv" ]; then
  echo "Missing file: data/raw/accidents_a2.csv"
  exit 1
fi

echo "1. Import accident CSV..."
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/04_import_accidents.sql

echo "2. Match accidents to road edges..."
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/05_match_accident_to_edge.sql

echo "3. Build edge risk score..."
docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U $USER -d $DB -f /sql/06_edge_risk_v1.sql

echo "Accident import and risk calculation completed."

