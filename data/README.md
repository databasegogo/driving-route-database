# data/ 資料夾說明

此資料夾存放建置資料庫所需的原始資料檔案。
這些檔案因為太大，**不會被 git 追蹤**（已加入 .gitignore）。

---

## 需要準備的檔案

### OSM 空間資料（放在 data/ 根目錄）

| 檔案 | 說明 | 下載來源 |
|------|------|---------|
| `gis_osm_roads_free_1.shp` | 台灣道路資料 | Geofabrik |
| `gis_osm_roads_free_1.dbf` | 同上（配套） | Geofabrik |
| `gis_osm_roads_free_1.shx` | 同上（配套） | Geofabrik |
| `gis_osm_roads_free_1.prj` | 同上（配套） | Geofabrik |
| `gis_osm_adminareas_a_free_1.shp` | 台灣行政區資料 | Geofabrik |
| `gis_osm_adminareas_a_free_1.dbf` | 同上（配套） | Geofabrik |
| `gis_osm_adminareas_a_free_1.shx` | 同上（配套） | Geofabrik |
| `gis_osm_adminareas_a_free_1.prj` | 同上（配套） | Geofabrik |

**下載網址**：https://download.geofabrik.de/asia/taiwan.html  
下載 `taiwan-latest-free.shp.zip`，解壓縮後取出上述檔案。

---

### 事故資料（放在 data/raw/ 子資料夾）

| 檔案 | 說明 | 下載來源 |
|------|------|---------|
| `accidents_a1.csv` | A1 死亡事故資料 | 政府開放資料平台 |
| `accidents_a2.csv` | A2 受傷事故資料 | 政府開放資料平台 |

**下載網址**：https://data.gov.tw  
搜尋「道路交通事故」，下載桃園市或全台灣的 A1/A2 資料。

---

## 資料夾結構

```
data/
├── gis_osm_roads_free_1.shp        ← 放這裡
├── gis_osm_roads_free_1.dbf
├── gis_osm_roads_free_1.shx
├── gis_osm_roads_free_1.prj
├── gis_osm_adminareas_a_free_1.shp ← 放這裡
├── gis_osm_adminareas_a_free_1.dbf
├── gis_osm_adminareas_a_free_1.shx
├── gis_osm_adminareas_a_free_1.prj
└── raw/
    ├── accidents_a1.csv            ← 放這裡
    └── accidents_a2.csv            ← 放這裡
```
