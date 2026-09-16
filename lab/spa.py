from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.views.static import serve as static_serve


SPA_DIR = Path(settings.BASE_DIR) / "frontend" / "dist"


def spa_view(request, path=""):
    """Serve the Vite production build so the app is available on Django's port."""
    if not SPA_DIR.exists():
        return HttpResponse(
            "Frontend is not built. From the project root run: "
            "cd frontend && npm install && npm run build",
            content_type="text/plain",
            status=503,
        )

    spa_root = SPA_DIR.resolve()
    if path:
        candidate = (SPA_DIR / path).resolve()
        if str(candidate).startswith(str(spa_root)) and candidate.is_file():
            return static_serve(request, path, document_root=SPA_DIR)

    index = SPA_DIR / "index.html"
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response
