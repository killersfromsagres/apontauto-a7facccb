from pathlib import Path

path = Path("src/components/taludes/polygon-editor-pro.tsx")
text = path.read_text(encoding="utf-8")

# Snap map translation to whole CSS pixels. Fractional layer positions make raster maps
# noticeably soft, especially when zooming in Chrome/Edge.
needle = '''  const selected = useMemo(() => local.find((m) => m.id === selectedId) ?? null, [local, selectedId]);\n  const visibleMarcacoes = useMemo(() => local.filter((m) => m.visivel !== false), [local]);'''
replacement = '''  const selected = useMemo(() => local.find((m) => m.id === selectedId) ?? null, [local, selectedId]);\n  const visibleMarcacoes = useMemo(() => local.filter((m) => m.visivel !== false), [local]);\n  const renderOffset = useMemo(\n    () => ({ x: Math.round(offset.x), y: Math.round(offset.y) }),\n    [offset.x, offset.y],\n  );'''
if needle not in text:
    raise SystemExit("renderOffset insertion point not found")
text = text.replace(needle, replacement, 1)

# Pointer conversion must use the exact snapped translation used by the renderer.
old_map = '''        x: (event.clientX - rect.left - offset.x) / zoom,\n        y: (event.clientY - rect.top - offset.y) / zoom,\n      };\n    },\n    [offset.x, offset.y, zoom],'''
new_map = '''        x: (event.clientX - rect.left - renderOffset.x) / zoom,\n        y: (event.clientY - rect.top - renderOffset.y) / zoom,\n      };\n    },\n    [renderOffset.x, renderOffset.y, zoom],'''
if old_map not in text:
    raise SystemExit("mapCoords block not found")
text = text.replace(old_map, new_map, 1)

# Do not zoom the whole map as a composited CSS transform. Chrome/Edge may rasterize the
# subtree at a lower resolution and then stretch that texture. Instead, render the map at
# the target layout dimensions; the image is resampled from its original source while SVG
# annotations remain vector-sharp.
old_render = '''        <div style={{ width: imageWidth, height: imageHeight, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: "0 0", position: "absolute", inset: 0, willChange: "transform" }}>\n          <img ref={imageRef} src={imageUrl} alt="Mapa de taludes" className="block select-none" draggable={false} crossOrigin="anonymous" onLoad={() => setImageLoaded(true)} style={{ width: imageWidth, height: imageHeight }} />\n          <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">'''
new_render = '''        <div\n          style={{\n            width: Math.max(1, imageWidth * zoom),\n            height: Math.max(1, imageHeight * zoom),\n            position: "absolute",\n            left: renderOffset.x,\n            top: renderOffset.y,\n          }}\n        >\n          <img\n            ref={imageRef}\n            src={imageUrl}\n            alt="Mapa de taludes"\n            className="block select-none"\n            draggable={false}\n            crossOrigin="anonymous"\n            decoding="sync"\n            fetchPriority="high"\n            onLoad={() => setImageLoaded(true)}\n            style={{\n              width: "100%",\n              height: "100%",\n              maxWidth: "none",\n              imageRendering: "auto",\n            }}\n          />\n          <svg\n            viewBox={`0 0 ${imageWidth} ${imageHeight}`}\n            preserveAspectRatio="none"\n            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"\n          >'''
if old_render not in text:
    raise SystemExit("scaled map render block not found")
text = text.replace(old_render, new_render, 1)

path.write_text(text, encoding="utf-8")
print("Taludes zoom now uses layout scaling instead of rasterized CSS transform")
