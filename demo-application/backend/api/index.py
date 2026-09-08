# Vercel Python entrypoint -- re-exports the real app so Vercel's runtime can find it
from app.main import app  # noqa: F401
