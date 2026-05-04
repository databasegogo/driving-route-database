# Database Setup Guide (macOS)

## Environment Requirements

* PostgreSQL 14.x
* PostGIS 3.2.x
* pgRouting (optional but recommended)
* macOS (Apple Silicon / Intel)

---

## 1. Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify:

```bash
brew -v
```

---

## 2. Install PostgreSQL 14

```bash
brew install postgresql@14
```

Add to PATH:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```bash
psql --version
```

---

## 3. Install PostGIS and pgRouting

```bash
brew install postgis
brew install pgrouting
```

---

## 4. Start PostgreSQL Service

```bash
brew services start postgresql@14
```

---

## 5. Create Database

```bash
psql postgres
```

```sql
CREATE DATABASE gisdb WITH ENCODING 'UTF8';
\c gisdb

CREATE EXTENSION postgis;
CREATE EXTENSION postgis_topology;
CREATE EXTENSION pgrouting;
```

Verify:

```sql
SELECT version();
SELECT PostGIS_Version();
```

---

## 6. Import OSM Data (SHP)

### Files

Place the following in the `data/` folder:

* gis_osm_roads_free_1.shp
* gis_osm_adminareas_a_free_1.shp

---

### Check SRID

```bash
cat data/gis_osm_roads_free_1.prj
```

If it shows **WGS84**, use:

```text
SRID = 4326
```

---

### Import Admin Areas

```bash
shp2pgsql -I -s 4326 data/gis_osm_adminareas_a_free_1.shp adminareas | psql -d gisdb
```

---

### Import Roads

```bash
shp2pgsql -I -s 4326 data/gis_osm_roads_free_1.shp roads | psql -d gisdb
```

---

## 7. Verify Data

```sql
SELECT COUNT(*) FROM roads;
SELECT COUNT(*) FROM adminareas;

SELECT DISTINCT ST_SRID(geom) FROM roads;
SELECT DISTINCT ST_SRID(geom) FROM adminareas;
```

Expected:

* Tables exist
* Data is not empty
* SRID is consistent (usually 4326)

---

## 8. Run SQL Pipeline

Execute SQL files in order:

```bash
psql -d gisdb -f sql/01_create_tables.sql
psql -d gisdb -f sql/02_filter_guishan.sql
psql -d gisdb -f sql/03_match_accident.sql
psql -d gisdb -f sql/04_risk.sql
```

---

## 9. Connect using DBeaver

Install:
DBeaver (Community Edition)

Connection settings:

* Host: localhost
* Port: 5432
* Database: gisdb
* Username: your mac username
* Password: (empty or configured)

---

## 10. Notes

* Do NOT import SHP using DBeaver (geometry may break)
* Always import using `shp2pgsql`
* Ensure SRID consistency before spatial operations
* SQL execution order matters

---

## 11. Common Errors

### geometry type not found

```sql
CREATE EXTENSION postgis;
```

### function pgr_dijkstra does not exist

```sql
CREATE EXTENSION pgrouting;
```

### SRID mismatch

Use:

```sql
SELECT ST_Transform(geom, 4326)
```

---

## 12. Project Workflow

```text
OSM Data (roads / adminareas)
        ↓
Import to PostGIS
        ↓
SQL Pipeline Processing
        ↓
Final Tables (roads_guishan, accident mapping, risk)
        ↓
DBeaver (query / visualization)
```

---
