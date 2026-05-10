import loadWASM from "@okathira/ghostpdl-wasm";

const wasmUrl = import.meta.env.BASE_URL + "gs.wasm";

async function reencodeJpeg(jpegBytes, quality) {
  const bitmap = await createImageBitmap(
    new Blob([jpegBytes], { type: "image/jpeg" })
  );
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Uint8Array(await blob.arrayBuffer());
}

self.addEventListener("message", async function ({ data: e }) {
  if (e.target !== "wasm") return;

  try {
    const Module = await loadWASM({
      print: (text) => console.log("GS:", text),
      printErr: (text) => console.warn("GS:", text),
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    });

    Module.FS.writeFile("input.pdf", new Uint8Array(e.pdfData));

    const dpi = e.dpi || 72;
    const quality = (e.quality || 10) / 100;

    Module.callMain([
      "-sDEVICE=jpeg",
      "-dNOPAUSE",
      "-dBATCH",
      `-r${dpi}`,
      "-dJPEGQ=60",
      "-sOutputFile=page-%d.jpg",
      "input.pdf",
    ]);

    const rawPages = [];
    for (let i = 1; ; i++) {
      try {
        rawPages.push(
          Module.FS.readFile(`page-${i}.jpg`, { encoding: "binary" })
        );
        Module.FS.unlink(`page-${i}.jpg`);
      } catch {
        break;
      }
    }

    if (!rawPages.length) {
      self.postMessage({ error: "Rendering produced no pages" });
      return;
    }

    // Re-encode in parallel batches
    const BATCH = 4;
    const jpegs = [];
    for (let i = 0; i < rawPages.length; i += BATCH) {
      const batch = rawPages.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((raw) => reencodeJpeg(raw, quality))
      );
      jpegs.push(...results);
    }

    const transferables = jpegs.map((j) => j.buffer);
    self.postMessage({ jpegs }, transferables);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
