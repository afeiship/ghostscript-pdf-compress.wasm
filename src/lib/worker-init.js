import { PDFDocument } from "pdf-lib";

export async function _GSPS2PDF(dataStruct) {
  const response = await fetch(dataStruct.psDataURL);
  const pdfBuffer = await response.arrayBuffer();
  window.URL.revokeObjectURL(dataStruct.psDataURL);

  const origDoc = await PDFDocument.load(pdfBuffer);
  const origPages = origDoc.getPages();
  const totalPages = origPages.length;
  const dpi = dataStruct.dpi || 72;
  const quality = dataStruct.quality || 10;

  const maxWorkers = Math.min(navigator.hardwareConcurrency || 2, 4);

  if (totalPages <= 4 || maxWorkers <= 1) {
    const jpegs = await runWorker(pdfBuffer, dpi, quality);
    return buildResult(jpegs, origPages);
  }

  // Split pages across workers
  const pagesPerWorker = Math.ceil(totalPages / maxWorkers);
  const chunks = [];

  for (let i = 0; i < maxWorkers; i++) {
    const start = i * pagesPerWorker;
    const end = Math.min(start + pagesPerWorker, totalPages);
    if (start >= totalPages) break;

    const subDoc = await PDFDocument.create();
    const indices = [];
    for (let j = start; j < end; j++) indices.push(j);
    const copied = await subDoc.copyPages(origDoc, indices);
    copied.forEach((p) => subDoc.addPage(p));
    const subBytes = await subDoc.save();

    chunks.push({ start, data: new Uint8Array(subBytes) });
  }

  // Run workers in parallel and collect results
  const allJpegs = new Array(totalPages);

  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise((resolve, reject) => {
          runWorker(chunk.data, dpi, quality)
            .then((jpegs) => {
              jpegs.forEach((jpeg, i) => {
                allJpegs[chunk.start + i] = jpeg;
              });
              resolve();
            })
            .catch(reject);
        })
    )
  );

  return buildResult(allJpegs, origPages);
}

function runWorker(pdfData, dpi, quality) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./background-worker.js", import.meta.url),
      { type: "module" }
    );

    worker.addEventListener("message", (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.jpegs);
      }
      worker.terminate();
    });

    worker.postMessage(
      { pdfData, target: "wasm", dpi, quality },
      [pdfData.buffer ? pdfData.buffer : pdfData]
    );
  });
}

async function buildResult(jpegs, origPages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < jpegs.length; i++) {
    const img = await doc.embedJpg(jpegs[i]);
    const { width, height } = origPages[i]
      ? origPages[i].getSize()
      : { width: 595, height: 842 };
    const page = doc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  return { url: URL.createObjectURL(blob), size: blob.size };
}
