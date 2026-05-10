export async function _GSPS2PDF(dataStruct) {
  const worker = new Worker(
    new URL('./background-worker.js', import.meta.url),
    { type: 'module' }
  );

  // Fetch the PDF data in the main thread and transfer as ArrayBuffer
  const response = await fetch(dataStruct.psDataURL);
  const pdfBuffer = await response.arrayBuffer();
  window.URL.revokeObjectURL(dataStruct.psDataURL);

  worker.postMessage({ pdfData: pdfBuffer, target: 'wasm' }, [pdfBuffer]);

  return new Promise((resolve, reject) => {
    const listener = (e) => {
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        // Create blob URL in main thread to avoid cross-context issues
        const blob = new Blob([e.data.pdfOutput], { type: "application/pdf" });
        resolve(window.URL.createObjectURL(blob));
      }
      worker.removeEventListener('message', listener);
      setTimeout(() => worker.terminate(), 0);
    };
    worker.addEventListener('message', listener);
  });
}
