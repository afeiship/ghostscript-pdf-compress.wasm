export async function _GSPS2PDF(dataStruct) {
  const worker = new Worker(
    new URL("./background-worker.js", import.meta.url),
    { type: "module" }
  );

  const response = await fetch(dataStruct.psDataURL);
  const pdfBuffer = await response.arrayBuffer();
  window.URL.revokeObjectURL(dataStruct.psDataURL);

  worker.postMessage(
    { pdfData: pdfBuffer, target: "wasm", level: dataStruct.level || "high" },
    [pdfBuffer]
  );

  return new Promise((resolve, reject) => {
    const listener = (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        const blob = new Blob([e.data.pdfOutput], { type: "application/pdf" });
        resolve({
          url: window.URL.createObjectURL(blob),
          size: blob.size,
        });
      }
      worker.removeEventListener("message", listener);
      setTimeout(() => worker.terminate(), 0);
    };
    worker.addEventListener("message", listener);
  });
}
