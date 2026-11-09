import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

def main() -> int:
    load_dotenv(ENV_PATH)
    url = os.getenv("DATABASE_URL", "").strip()

    if not url:
        print("DATABASE_URL is missing or empty.")
        print(f"Open {ENV_PATH} and add a line like:")
        print("  DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require")
        return 1

    try:
        engine = create_engine(url, connect_args={"connect_timeout": 15})
        with engine.connect() as conn:
            version = conn.execute(text("select version()")).scalar()
    except Exception as exc:
        print("Could not connect to the database.")
        print("Check that the connection string is correct, includes ?sslmode=require,")
        print("and that your Neon project is active (free projects auto-suspend).")
        print(f"\nError type: {type(exc).__name__}")
        return 1

    print("Connection successful!")
    print(version)
    return 0

if __name__ == "__main__":
    sys.exit(main())
