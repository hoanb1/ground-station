#!/usr/bin/env python
"""Wrapper script to run alembic commands without argument conflicts."""
import os
import sys

# Set environment variable to prevent argument parsing in imported modules
os.environ["ALEMBIC_CONTEXT"] = "1"

# Store original sys.argv
original_argv = sys.argv.copy()

# Temporarily clear sys.argv to prevent common.arguments from parsing
sys.argv = [sys.argv[0]]

# Now we can safely import alembic
from alembic.config import main

if __name__ == "__main__":
    # Restore the original arguments for alembic
    sys.argv = original_argv
    # Pass all arguments directly to alembic
    sys.exit(main())
