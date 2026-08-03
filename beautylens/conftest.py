"""
Makes `src.api...` importable regardless of where pytest is invoked from.

The test modules import absolute paths (`from src.api import matching`), which
only resolves when `beautylens/` is on sys.path. Running `cd beautylens &&
python -m pytest` puts it there implicitly, because `python -m` prepends the
current directory -- so the suite passes locally while CI, which runs
`pytest beautylens/tests/` from the repository root, fails every module with
ModuleNotFoundError.

pytest's default `prepend` import mode does not help here: for a test file with
no `__init__.py` beside it, it inserts the test file's own directory
(`beautylens/tests`), not its parent.

This lives at the `beautylens/` level rather than inside `tests/` so the path is
correct for anything collected under it, and it is a conftest rather than a CI
flag so IDE test runners and local invocations get the same behaviour.
"""
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))
