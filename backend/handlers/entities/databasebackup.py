# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


import re
from typing import Any, Dict

from sqlalchemy import text

from db import AsyncSessionLocal
from db.models import Base


async def list_tables() -> Dict[str, Any]:
    """List all database tables with their row counts."""
    try:
        async with AsyncSessionLocal() as session:
            # Get all table names from the Base metadata
            table_names = [table.name for table in Base.metadata.sorted_tables]

            tables = []
            for table_name in table_names:
                # Get row count for each table
                result = await session.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                row_count = result.scalar()
                tables.append({"name": table_name, "row_count": row_count})

            return {"success": True, "tables": tables}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def backup_table(table_name: str) -> Dict[str, Any]:
    """Generate SQL INSERT statements for a specific table."""
    try:
        # Validate table name to prevent SQL injection
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name):
            return {"success": False, "error": "Invalid table name"}

        # Check if table exists in our models
        table_names = [table.name for table in Base.metadata.sorted_tables]
        if table_name not in table_names:
            return {"success": False, "error": f"Table {table_name} not found"}

        async with AsyncSessionLocal() as session:
            # Get column names using PRAGMA for SQLite (works with async)
            result = await session.execute(text(f"PRAGMA table_info({table_name})"))
            pragma_result = result.fetchall()
            column_names = [row[1] for row in pragma_result]  # Column name is at index 1

            # Fetch all rows
            result = await session.execute(text(f"SELECT * FROM {table_name}"))
            rows = result.fetchall()

            # Generate SQL INSERT statements
            sql_statements = []
            sql_statements.append(f"-- Backup of table {table_name}")
            sql_statements.append(f"-- Generated at: {__import__('datetime').datetime.now()}")
            sql_statements.append(f"-- Total rows: {len(rows)}\n")

            for row in rows:
                # Convert row to dictionary
                row_dict = dict(zip(column_names, row))

                # Build INSERT statement
                columns_str = ", ".join(column_names)
                values = []
                for col_name in column_names:
                    value = row_dict[col_name]
                    if value is None:
                        values.append("NULL")
                    elif isinstance(value, str):
                        # Escape single quotes
                        escaped_value = value.replace("'", "''")
                        values.append(f"'{escaped_value}'")
                    elif isinstance(value, (int, float)):
                        values.append(str(value))
                    elif isinstance(value, bool):
                        values.append(str(int(value)))
                    else:
                        # For other types, convert to string
                        escaped_value = str(value).replace("'", "''")
                        values.append(f"'{escaped_value}'")

                values_str = ", ".join(values)
                sql_statements.append(
                    f"INSERT INTO {table_name} ({columns_str}) VALUES ({values_str});"
                )

            sql = "\n".join(sql_statements)
            return {"success": True, "sql": sql, "row_count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def restore_table(table_name: str, sql: str, delete_first: bool = True) -> Dict[str, Any]:
    """Restore table from SQL INSERT statements."""
    try:
        # Validate table name
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name):
            return {"success": False, "error": "Invalid table name"}

        # Check if table exists
        table_names = [table.name for table in Base.metadata.sorted_tables]
        if table_name not in table_names:
            return {"success": False, "error": f"Table {table_name} not found"}

        # Validate SQL contains only INSERT statements (security check)
        # Remove comments and empty lines
        sql_lines = [
            line.strip()
            for line in sql.split("\n")
            if line.strip() and not line.strip().startswith("--")
        ]

        # Check that all statements are INSERT statements for the correct table
        for line in sql_lines:
            if not re.match(
                rf"^INSERT\s+INTO\s+{table_name}\s+\(.*\)\s+VALUES\s+\(.*\);$", line, re.IGNORECASE
            ):
                return {
                    "success": False,
                    "error": f"Invalid SQL statement detected. Only INSERT statements for {table_name} are allowed.",
                }

        async with AsyncSessionLocal() as session:
            try:
                # Delete all rows if requested
                if delete_first:
                    await session.execute(text(f"DELETE FROM {table_name}"))

                # Execute INSERT statements
                rows_inserted = 0
                for line in sql_lines:
                    await session.execute(text(line))
                    rows_inserted += 1

                await session.commit()
                return {"success": True, "rows_inserted": rows_inserted}
            except Exception as e:
                await session.rollback()
                raise e

    except Exception as e:
        return {"success": False, "error": str(e)}


async def full_backup() -> Dict[str, Any]:
    """Generate a full database backup including schema and all data."""
    try:
        sql_statements = []
        sql_statements.append("-- Full Database Backup")
        sql_statements.append(f"-- Generated at: {__import__('datetime').datetime.now()}")
        sql_statements.append("")

        # Get CREATE TABLE statements
        sql_statements.append("-- ========================================")
        sql_statements.append("-- DATABASE SCHEMA")
        sql_statements.append("-- ========================================")
        sql_statements.append("")

        async with AsyncSessionLocal() as session:
            # For SQLite, we can get schema from sqlite_master
            result = await session.execute(
                text(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            )
            schemas = result.fetchall()

            for schema in schemas:
                if schema[0]:
                    sql_statements.append(schema[0] + ";")
                    sql_statements.append("")

            sql_statements.append("")
            sql_statements.append("-- ========================================")
            sql_statements.append("-- TABLE DATA")
            sql_statements.append("-- ========================================")
            sql_statements.append("")

        # Get all table names in the correct order (respecting foreign keys)
        table_names = [table.name for table in Base.metadata.sorted_tables]

        # Backup each table
        for table_name in table_names:
            result = await backup_table(table_name)
            if result["success"]:
                sql_statements.append(f"\n-- Table: {table_name} ({result['row_count']} rows)")
                sql_statements.append(result["sql"])
                sql_statements.append("")
            else:
                sql_statements.append(
                    f"\n-- Error backing up table {table_name}: {result['error']}"
                )

        sql = "\n".join(sql_statements)
        return {"success": True, "sql": sql}
    except Exception as e:
        return {"success": False, "error": str(e)}


def register_handlers(registry):
    """Register database backup handlers."""
    # Database backup handlers don't use the standard registry pattern
    # They are handled directly in socket.py via database_backup event
    pass
