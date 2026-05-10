import loadWASM from "@okathira/ghostpdl-wasm";
import { PDFDocument } from "pdf-lib";

const wasmUrl = import.meta.env.BASE_URL + "gs.wasm";

const RASTERIZE = {
  extreme: { dpi: 72, jpegQuality: 15 },
  high: { dpi: 100, jpegQuality: 25 },
};

const PDFWRITE = {
  medium: [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOPAUSE",
    "-dBATCH",
    "-dPDFSETTINGS=/ebook",
    "-dJPEGQ=40",
    "-dDownsampleColorImages=true",
    "-dColorImageDownsampleThreshold=1.5",
    "-dColorImageDownsampleType=/Bicubic",
    "-dColorImageResolution=120",
    "-dDownsampleGrayImages=true",
    "-dGrayImageDownsampleThreshold=1.5",
    "-dGrayImageDownsampleType=/Bicubic",
    "-dGrayImageResolution=120",
    "-dAutoFilterColorImages=false",
    "-dColorImageFilter=/DCTEncode",
    "-dAutoFilterGrayImages=false",
    "-dGrayImageFilter=/DCTEncode",
    "-dSubsetFonts=true",
    "-dCompressFonts=true",
    "-dCompressPages=true",
    "-dDetectDuplicateImages=true",
    "-sOutputFile=output.pdf",
    "input.pdf",
  ],
  low: [
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dNOPAUSE",
    "-dBATCH",
    "-dPDFSETTINGS=/printer",
    "-dJPEGQ=65",
    "-dDownsampleColorImages=true",
    "-dColorImageDownsampleThreshold=1.5",
    "-dColorImageDownsampleType=/Bicubic",
    "-dColorImageResolution=200",
    "-dDownsampleGrayImages=true",
    "-dGrayImageDownsampleThreshold=1.5",
    "-dGrayImageDownsampleType=/Bicubic",
    "-dGrayImageResolution=200",
    "-dSubsetFonts=true",
    "-dCompressFonts=true",
    "-dCompressPages=true",
    "-dDetectDuplicateImages=true",
    "-sOutputFile=output.pdf",
    "input.pdf",
  ],
};

self.addEventListener("message", async function ({ data: e }) {
  if (e.target !== "wasm") return;

  try {
    const Module = await loadWASM({
      print: (text) => console.log("GS:", text),
      printErr: (text) => console.error("GS Error:", text),
      locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
    });

    Module.FS.writeFile("input.pdf", new Uint8Array(e.pdfData));

    const level = e.level || "high";
    let outputBytes;

    if (RASTERIZE[level]) {
      const cfg = RASTERIZE[level];

      const origDoc = await PDFDocument.load(e.pdfData);
      const origPages = origDoc.getPages();

      Module.callMain([
        "-sDEVICE=jpeg",
        "-dNOPAUSE",
        "-dBATCH",
        `-r${cfg.dpi}`,
        `-dJPEGQ=${cfg.jpegQuality}`,
        "-sOutputFile=page-%d.jpg",
        "input.pdf",
      ]);

      const jpegs = [];
      for (let i = 1; i <= origPages.length; i++) {
        try {
          const data = Module.FS.readFile(`page-${i}.jpg`, {
            encoding: "binary",
          });
          jpegs.push(data);
          Module.FS.unlink(`page-${i}.jpg`);
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

      outputBytes = await newDoc.save();
    } else {
      const args = PDFWRITE[level] || PDFWRITE.medium;
      Module.callMain(args);
      outputBytes = Module.FS.readFile("output.pdf", { encoding: "binary" });
    }

    if (!outputBytes.length) {
      self.postMessage({ error: "Compression produced no output" });
      return;
    }

    const buf =
      outputBytes instanceof Uint8Array
        ? outputBytes.buffer
        : new Uint8Array(outputBytes).buffer;
    self.postMessage({ pdfOutput: buf }, [buf]);
  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
