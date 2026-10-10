import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

# The local env file points at production, so this only runs where CI opts in.
pytestmark = pytest.mark.skipif(
    os.environ.get("SCHEMA_EXPORT_TEST") != "1",
    reason="runs only in CI against the fresh compose database",
)

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "export_schema.py"


def _run_export(output: Path) -> dict:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--output", str(output)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(output.read_text(encoding="utf-8"))


def test_schema_export_contains_known_structure(tmp_path):
    snapshot = _run_export(tmp_path / "schema.json")

    for table in ("orders", "order_items", "outbox_events"):
        assert table in snapshot["tables"], table

    fks = [
        fk
        for fk in snapshot["foreign_keys"]
        if fk["from_table"] == "order_items" and fk["to_table"] == "orders"
    ]
    assert len(fks) == 1
    assert fks[0]["from_columns"] == ["order_id"]
    assert fks[0]["to_columns"] == ["id"]
    assert fks[0]["on_delete"] == "CASCADE"

    assert snapshot["schema_version"]

    heads = subprocess.run(
        ["alembic", "heads"], capture_output=True, text=True, cwd=SCRIPT.parent.parent
    )
    assert heads.returncode == 0, heads.stderr
    assert snapshot["schema_version"] in heads.stdout


def test_schema_export_is_deterministic(tmp_path):
    first = tmp_path / "a.json"
    second = tmp_path / "b.json"
    _run_export(first)
    _run_export(second)
    assert first.read_bytes() == second.read_bytes()
