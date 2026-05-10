import loadWASM from "@okathira/ghostpdl-wasm";

const wasmUrl = import.meta.env.BASE_URL + "gs.wasm";

self.addEventListener('message', async function ({ data: e }) {
  if (e.target !== 'wasm') return;

  try {
    const Module = await loadWASM({
      print: (text) => console.log("GS:", text),
      printErr: (text) => console.error("GS Error:", text),
      locateFile: (path) => path.endsWith('.wasm') ? wasmUrl : path,
    });

    Module.FS.writeFile("input.pdf", new Uint8Array(e.pdfData));

    const exitCode = Module.callMain([
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      "-dNOPAUSE",
      "-dBATCH",
      "-sOutputFile=output.pdf",
      "input.pdf",
    ]);

    if (exitCode !== 0) {
      self.postMessage({ error: `Ghostscript exited with code ${exitCode}` });
      return;
    }

    const output = Module.FS.readFile("output.pdf", { encoding: "binary" });

    self.postMessage({ pdfOutput: output.buffer }, [output.buffer]);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
