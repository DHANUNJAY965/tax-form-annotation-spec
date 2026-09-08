# Vercel Python entrypoint -- re-exports the real app so Vercel's runtime can find it
# Vercel only puts this file's own directory (api/) on sys.path, not its parent, so the
# sibling `app` package needs to be added explicitly before it can be imported.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402,F401
