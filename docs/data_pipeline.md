# Data Pipeline

## Overview

本專案資料流程主要分為三層：

1. 原始空間資料匯入
2. 道路 graph 建立
3. 交通事故資料對應與風險計算

## Pipeline Steps

### 1. Import OSM Data

匯入 OpenStreetMap 資料：

- roads
- adminareas

-> Filter Guishan District
-> Import Accident Data
-> Match Accidents to Road Edges
-> Build Edge Risk
### 2. Filter Guishan District

使用 adminareas 中的龜山區行政邊界篩選資料。

目前龜山區使用：

```text
adminareas.ogc_fid = 8066
name = 龜山

### 3. Build Road Grap
由 roads_guishan 建立 road_edges_guishan。

使用 pgRouting 建立 topology：

SQL:

SELECT pgr_createtopology(
  'road_edges_guishan',
  0.00001,
  'geom',
  'edge_id'
);

產生: 
road_edges_guishan.source
road_edges_guishan.target
road_edge_guishan_vertices_pgr

###4.Import Accident Data
匯入政府公開交通事故資料：
accident_records_a1
accident_records_a2

並建立geom:
ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)

###5.Filter Accident Data by Guishan
使用龜山區行政邊界篩選：
accident_records_a1_guishan
accident_records_a2_guishan

###6.Match Accidents to Road Edges
將事故點對應到最近的 road edge：
nearest_edge_id
distance_to_edge_m

###7.Build Edge Risk
合併 A1 / A2 後建立：
accident_records_all_guishan
edge_risk_guishan

目前 edge risk v1 包含：
accident_count
severity_score
accident_density

## Current Limitation
目前 risk_score 正規化方式尚未定案。
後續需討論事故密度、極端值處理、路口事故分配與 routing cost function。

