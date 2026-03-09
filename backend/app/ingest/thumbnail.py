import asyncio
import logging
from pathlib import Path

logger = logging.getLogger("litvault.thumbnail")


def generate_thumbnail(
    pdf_path: Path,
    output_dir: Path,
    size: tuple[int, int] = (200, 280),
) -> "Path | None":
    try:
        import fitz

        output_dir.mkdir(parents=True, exist_ok=True)

        doc = fitz.open(str(pdf_path))
        page = doc[0]

        # Compute scale factors to hit target size
        rect = page.rect
        scale_x = size[0] / rect.width if rect.width else 1.0
        scale_y = size[1] / rect.height if rect.height else 1.0
        scale = min(scale_x, scale_y)

        matrix = fitz.Matrix(scale, scale)
        pixmap = page.get_pixmap(matrix=matrix)

        output_path = output_dir / f"{pdf_path.stem}_thumb.jpg"
        pixmap.save(str(output_path))
        doc.close()
        return output_path
    except Exception as exc:
        logger.error("Failed to generate thumbnail for %s: %s", pdf_path, exc)
        return None


async def generate_thumbnail_async(
    pdf_path: Path,
    output_dir: Path,
) -> "Path | None":
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(generate_thumbnail, pdf_path, output_dir),
            timeout=10,
        )
    except asyncio.TimeoutError:
        logger.warning("Thumbnail generation timed out for %s", pdf_path)
        return None
