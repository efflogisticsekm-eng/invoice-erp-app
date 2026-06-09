import os
import sys
import psycopg2

SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_KEY:
    # Try reading from .env locally
    from dotenv import load_dotenv
    from pathlib import Path
    env_path = Path(__file__).parent.parent / "INDIA" / "consignee-app" / ".env"
    load_dotenv(dotenv_path=env_path)
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_KEY:
    print("SUPABASE_KEY not found!")
    sys.exit(1)

host = "2406:da14:25a:5801:2280:b643:74c9:b400"
password = SUPABASE_KEY.strip("'\"")

print("Attempting to connect to Supabase PostgreSQL database...")
try:
    conn = psycopg2.connect(
        host=host,
        port=5432,
        user="postgres",
        password=password,
        database="postgres",
        connect_timeout=5
    )
    cursor = conn.cursor()
    print("Connected successfully! Creating holidays table...")
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS public.holidays (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            date DATE UNIQUE NOT NULL,
            description TEXT
        );
    """)
    conn.commit()
    print("Table public.holidays created successfully!")
    
    cursor.close()
    conn.close()
    print("Database connection closed.")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
