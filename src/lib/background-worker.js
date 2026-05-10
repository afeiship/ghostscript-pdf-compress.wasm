import loadWASM from "@okathira/ghostpdl-wasm";
import { PDFDocument } from "pdf-lib";

const wasmUrl = import.meta.env.BASE_URL + "gs.wasm";

async function reencodeJpeg(jpegBytes, quality) {
  const bitmap = await createImageBitmap(
    new Blob([jpegBytes], { type: "image/jpeg" })
  );
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
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
      printErr: (text) => console.error("GS Error:", text),
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    });

    Module.FS.writeFile("input.pdf", new Uint8Array(e.pdfData));

    const dpi = e.dpi || 72;
    const finalQuality = (e.quality || 10) / 100;

    const origDoc = await PDFDocument.load(e.pdfData);
    const origPages = origDoc.getPages();

    Module.callMain([
      "-sDEVICE=jpeg",
      "-dNOPAUSE",
      "-dBATCH",
      `-r${dpi}`,
      "-dJPEGQ=60",
      "-sOutputFile=page-%d.jpg",
      "input.pdf",
    ]);

    const jpegs = [];
    for (let i = 1; i <= origPages.length; i++) {
      try {
        const raw = Module.FS.readFile(`page-${i}.jpg`, {
          encoding: "binary",
        });
        Module.FS.unlink(`page-${i}.jpg`);
        const optimized = await reencodeJpeg(raw, finalQuality);
        jpegs.push(optimized);
      } catch {
        break;
      }
    }

    if (!jpegs.length) {
      self.postMessage({ error: "Rendering produced no pages" });
      return;
    }

    const newDoc = await PDFDocument.create();
    for (let i = 0; i < jpegs.length; i++) {
      const img = await newDoc.embedJpg(jpegs[i]);
      const { width, height } = origPages[i]
        ? origPages[i].getSize()
        : { width: 595, height: 842 };
      const page = newDoc.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
    }

    const outputBytes = await newDoc.save();
    const buf =
      outputBytes instanceof Uint8Array
        ? outputBytes.buffer
        : new Uint8Array(outputBytes).buffer;
    self.postMessage({ pdfOutput: buf }, [buf]);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
