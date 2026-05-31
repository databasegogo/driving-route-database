import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "database": "gisdb",
    "port": 5433,
    "user": "postgres",
    "password": "123456"
}

def get_db():
    return psycopg2.connect(**DB_CONFIG)
