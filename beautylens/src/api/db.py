"""
SQLAlchemy engine/session setup for the shade-matching feature's persistence layer
(beauty profiles, skin scans, shade catalog, owned products, recommendation feedback).
"""
import os
from pathlib import Path
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session

DB_PATH = os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parents[2] / "beautylens.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# create_all() only ever creates *missing tables* -- it will not add a column to
# a table that already exists. Any column added to an existing model therefore
# needs an entry here, or existing databases silently keep the old shape and
# every query touching the new column fails at runtime.
#
# (table, column, "ALTER TABLE ... ADD COLUMN" type clause)
_PENDING_COLUMNS = [
    ("user_profiles", "firebase_uid", "VARCHAR"),
    ("user_profiles", "email", "VARCHAR"),
    ("user_profiles", "display_name", "VARCHAR"),
    ("shade_products", "source_url", "VARCHAR"),
]

# SQLite cannot add a UNIQUE column via ALTER TABLE, so uniqueness is applied
# afterwards as an index instead.
_PENDING_INDEXES = [
    (
        "ix_user_profiles_firebase_uid",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_profiles_firebase_uid "
        "ON user_profiles (firebase_uid)",
    ),
]


# SQLite cannot relax a NOT NULL constraint with ALTER TABLE, so a column that
# becomes nullable in the model stays NOT NULL in any database created before
# the change -- and every insert of a NULL fails at runtime.
#
# shade_products is regenerable seed data, rebuilt from
# data/shade_catalog_seed.json by seed_data.py, so the safe fix is to drop the
# table and let create_all() recreate it from the current model. Listed as
# (table, column) pairs that must now accept NULL.
_RELAXED_TO_NULLABLE = [
    ("shade_products", "price"),
    ("shade_products", "currency"),
]


def _rebuild_tables_with_stale_not_null(inspector, existing_tables) -> list:
    """Drop any table whose column is still NOT NULL but is nullable in the
    model. Returns the tables dropped, so the caller can re-create and re-seed."""
    stale = set()
    for table, column in _RELAXED_TO_NULLABLE:
        if table not in existing_tables:
            continue
        for col in inspector.get_columns(table):
            if col["name"] == column and not col["nullable"]:
                stale.add(table)

    with engine.begin() as conn:
        for table in stale:
            conn.execute(text(f"DROP TABLE {table}"))
    return sorted(stale)


def _apply_pending_migrations() -> None:
    """Add columns/indexes that models gained after a database was created."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    dropped = _rebuild_tables_with_stale_not_null(inspector, existing_tables)
    if dropped:
        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, column, coltype in _PENDING_COLUMNS:
            if table not in existing_tables:
                continue  # create_all() just made it with the column already present
            columns = {c["name"] for c in inspector.get_columns(table)}
            if column not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))

        for _, ddl in _PENDING_INDEXES:
            if "user_profiles" in existing_tables:
                conn.execute(text(ddl))


def init_db() -> None:
    """Create all tables that don't already exist, then bring existing ones up to date."""
    from src.api import models_db  # noqa: F401 (ensures models are registered on Base)
    Base.metadata.create_all(bind=engine)
    _apply_pending_migrations()


def get_db() -> Session:
    """FastAPI dependency that yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
