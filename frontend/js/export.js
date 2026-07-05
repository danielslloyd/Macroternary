// Export the ternary chart as a standalone image.
//
// The on-screen SVG is already almost self-contained (every colour/size is an
// inline attribute, the tooltip lives in a separate DOM node), so export is
// mostly: clone the node, stamp explicit dimensions + namespaces, serialise.

const SVG_NS = "http://www.w3.org/2000/svg";

function findChart(container) {
  const svg = container.querySelector("svg.mt-chart");
  if (!svg) throw new Error("No chart to export yet.");
  return svg;
}

function dimensions(svg) {
  const vb = (svg.getAttribute("viewBox") || "0 0 700 640").split(/\s+/).map(Number);
  return { width: vb[2] || 700, height: vb[3] || 640 };
}

// Produce a fully self-contained SVG string (with XML prolog).
function serialize(svg) {
  const { width, height } = dimensions(svg);
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", width);
  clone.setAttribute("height", height);

  // Pin the font so the file reads the same wherever it's opened.
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent =
    'text{font-family:Inter,system-ui,-apple-system,sans-serif;}';
  clone.insertBefore(style, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  return { xml: '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + xml, width, height };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportSVG(container) {
  const svg = findChart(container);
  const { xml } = serialize(svg);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `macro-ternary-${stamp()}.svg`);
}

// Rasterise the SVG to PNG at `scale`× resolution via an offscreen canvas.
export function exportPNG(container, scale = 2) {
  const svg = findChart(container);
  const { xml, width, height } = serialize(svg);

  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (png) triggerDownload(png, `macro-ternary-${stamp()}.png`);
    }, "image/png");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    // Fall back to the SVG if the browser refuses to rasterise it.
    exportSVG(container);
  };
  img.src = url;
}
