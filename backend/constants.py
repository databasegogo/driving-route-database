# constants.py — 跨模組共用常數
# route.py 與 practice.py 都需要這些，集中定義避免不同步

# 難度倍率（得分計算）
SCORE_WEIGHT = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}

# 難度排序（等級比較）
LEVEL_ORDER  = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}

# 等級 ID → code（DB user_level_id 對應）
LEVEL_CODE   = {1: "BEGINNER",  2: "NORMAL",  3: "EXPERIENCED"}
