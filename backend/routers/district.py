from fastapi import APIRouter, HTTPException
from database import get_db
import json

router = APIRouter(prefix="/district", tags=["district"])

@router.get("/boundary")
def get_boundary():
    """回傳龜山區行政區多邊形（GeoJSON Feature）"""
    sql = """
        SELECT ST_AsGeoJSON(geom, 6) AS geojson
        FROM district
        WHERE name = '龜山區'
        LIMIT 1
    """
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute(sql)
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not row:
        raise HTTPException(status_code=404, detail="龜山區資料不存在")

    return {
        "type": "Feature",
        "geometry": json.loads(row[0]),
        "properties": { "name": "龜山區" }
    }
