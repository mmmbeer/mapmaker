export function exportCanvasToPng(canvas, filename) {
  const url = canvas.toDataURL("image/png");
  downloadDataUrl(url, filename);
}

function downloadDataUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
