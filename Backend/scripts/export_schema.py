"""Export the structure of the public schema as a deterministic JSON file.

Reads only the Postgres catalog (no row data, except the Alembic revision)
inside a read-only transaction. Usage:

    python scripts/export_schema.py --output schema_snapshot.json
"""

import argparse
import json
import os
import sys

from sqlalchemy import create_engine, text

SCHEMA = "public"

# pg_constraint.confdeltype codes
ON_DELETE = {
    "a": "NO ACTION",
    "r": "RESTRICT",
    "c": "CASCADE",
    "n": "SET NULL",
    "d": "SET DEFAULT",
}

TABLES_SQL = """
SELECT c.oid, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = :schema AND c.relkind IN ('r', 'p')
"""

COLUMNS_SQL = """
SELECT c.relname AS table_name,
       a.attname AS name,
       format_type(a.atttypid, a.atttypmod) AS type,
       NOT a.attnotnull AS nullable,
       pg_get_expr(d.adbin, d.adrelid) AS default
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = :schema AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped
"""

# Key columns keep their constraint order, since it carries meaning.
CONSTRAINTS_SQL = """
SELECT con.conname AS name,
       con.contype AS type,
       c.relname AS table_name,
       ARRAY(
           SELECT a.attname
           FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
           ORDER BY k.ord
       ) AS columns,
       rc.relname AS ref_table,
       ARRAY(
           SELECT a.attname
           FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
           ORDER BY k.ord
       ) AS ref_columns,
       con.confdeltype AS on_delete,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_class rc ON rc.oid = con.confrelid
WHERE n.nspname = :schema AND con.contype IN ('p', 'u', 'c', 'f')
"""

INDEXES_SQL = """
SELECT t.relname AS table_name,
       i.relname AS name,
       ix.indisunique AS is_unique,
       ix.indisprimary AS is_primary,
       pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = :schema
"""

TRIGGERS_SQL = """
SELECT tg.tgname AS name,
       c.relname AS table_name,
       tg.tgtype AS tgtype,
       pn.nspname || '.' || p.proname AS function
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tg.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = :schema AND NOT tg.tgisinternal
"""

# Skip functions owned by extensions; they are not part of our migrations.
FUNCTIONS_SQL = """
SELECT p.proname AS name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS return_type,
       l.lanname AS language,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = :schema
  AND p.prokind IN ('f', 'p')
  AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
  )
"""

ALEMBIC_SQL = "SELECT version_num FROM alembic_version"


def _trigger_timing(tgtype: int) -> str:
    # Bit layout from pg_trigger.h: 2 = BEFORE, 64 = INSTEAD OF, else AFTER.
    if tgtype & 64:
        return "INSTEAD OF"
    return "BEFORE" if tgtype & 2 else "AFTER"


def _trigger_events(tgtype: int) -> list[str]:
    bits = {4: "INSERT", 8: "DELETE", 16: "UPDATE", 32: "TRUNCATE"}
    return sorted(name for bit, name in bits.items() if tgtype & bit)


def _rows(conn, sql: str) -> list[dict]:
    return [dict(r) for r in conn.execute(text(sql), {"schema": SCHEMA}).mappings()]


def _alembic_revision(conn) -> str | None:
    exists = conn.execute(
        text("SELECT to_regclass(:name)"), {"name": f"{SCHEMA}.alembic_version"}
    ).scalar()
    if exists is None:
        return None
    # Normally one row; merged heads would give several, joined for stability.
    revisions = sorted(r[0] for r in conn.execute(text(ALEMBIC_SQL)))
    return ",".join(revisions) or None


def build_snapshot(conn) -> dict:
    tables: dict[str, dict] = {}
    for row in _rows(conn, TABLES_SQL):
        tables[row["relname"]] = {
            "columns": [],
            "primary_key": None,
            "unique_constraints": [],
            "check_constraints": [],
            "indexes": [],
        }

    for row in _rows(conn, COLUMNS_SQL):
        tables[row["table_name"]]["columns"].append(
            {
                "name": row["name"],
                "type": row["type"],
                "nullable": row["nullable"],
                "default": row["default"],
            }
        )

    foreign_keys = []
    for row in _rows(conn, CONSTRAINTS_SQL):
        table = tables.get(row["table_name"])
        if table is None:
            continue
        if row["type"] == "p":
            table["primary_key"] = {"name": row["name"], "columns": list(row["columns"])}
        elif row["type"] == "u":
            table["unique_constraints"].append(
                {"name": row["name"], "columns": list(row["columns"])}
            )
        elif row["type"] == "c":
            table["check_constraints"].append(
                {"name": row["name"], "definition": row["definition"]}
            )
        elif row["type"] == "f":
            foreign_keys.append(
                {
                    "name": row["name"],
                    "from_table": row["table_name"],
                    "from_columns": list(row["columns"]),
                    "to_table": row["ref_table"],
                    "to_columns": list(row["ref_columns"]),
                    "on_delete": ON_DELETE.get(row["on_delete"], row["on_delete"]),
                }
            )

    for row in _rows(conn, INDEXES_SQL):
        table = tables.get(row["table_name"])
        if table is None:
            continue
        table["indexes"].append(
            {
                "name": row["name"],
                "unique": row["is_unique"],
                "primary": row["is_primary"],
                "definition": row["definition"],
            }
        )

    triggers = [
        {
            "name": row["name"],
            "table": row["table_name"],
            "timing": _trigger_timing(row["tgtype"]),
            "events": _trigger_events(row["tgtype"]),
            "level": "ROW" if row["tgtype"] & 1 else "STATEMENT",
            "function": row["function"],
        }
        for row in _rows(conn, TRIGGERS_SQL)
    ]

    functions = [
        {
            "name": row["name"],
            "arguments": row["arguments"],
            "return_type": row["return_type"],
            "language": row["language"],
            "definition": row["definition"],
        }
        for row in _rows(conn, FUNCTIONS_SQL)
    ]

    # Sort every list so the same schema always produces the same file.
    for table in tables.values():
        table["columns"].sort(key=lambda c: c["name"])
        table["unique_constraints"].sort(key=lambda c: c["name"])
        table["check_constraints"].sort(key=lambda c: c["name"])
        table["indexes"].sort(key=lambda i: i["name"])
    foreign_keys.sort(key=lambda f: (f["from_table"], f["name"]))
    triggers.sort(key=lambda t: (t["table"], t["name"]))
    functions.sort(key=lambda f: (f["name"], f["arguments"]))

    return {
        "schema": SCHEMA,
        "schema_version": _alembic_revision(conn),
        "tables": tables,
        "foreign_keys": foreign_keys,
        "triggers": triggers,
        "functions": functions,
    }


def export_schema(database_url: str) -> dict:
    engine = create_engine(database_url)
    try:
        with engine.connect() as conn:
            # Guard against accidental writes: the server rejects any DML/DDL.
            conn.execute(text("SET TRANSACTION READ ONLY"))
            try:
                return build_snapshot(conn)
            finally:
                conn.rollback()
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", default="schema_snapshot.json")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1

    snapshot = export_schema(database_url)
    with open(args.output, "w", encoding="utf-8", newline="\n") as f:
        json.dump(snapshot, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote {args.output} ({len(snapshot['tables'])} tables)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
