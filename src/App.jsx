import { useState, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import "./App.css";
import { _GSPS2PDF } from "./lib/worker-init.js";

const PRESETS = [
  { key: "extreme", label: "极高", dpi: 50, quality: 4 },
  { key: "high", label: "高", dpi: 72, quality: 8 },
  { key: "medium", label: "中等", dpi: 120, quality: 40 },
  { key: "low", label: "低", dpi: 200, quality: 65 },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function estimateSize(pageInfo, dpi, quality) {
  if (!pageInfo) return null;
  const { count, avgWidth, avgHeight } = pageInfo;
  const pixW = (avgWidth / 72) * dpi;
  const pixH = (avgHeight / 72) * dpi;
  const q = quality / 100;
  const bpp = 0.2 + q * 4.5;
  return count * pixW * pixH * bpp;
}

function App() {
  const [state, setState] = useState("init");
  const [file, setFile] = useState(null);
  const [pageInfo, setPageInfo] = useState(null);
  const [dpi, setDpi] = useState(72);
  const [quality, setQuality] = useState(8);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleFileChange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFile({ name: f.name, size: f.size, url });

    try {
      const buf = await f.arrayBuffer();
      const doc = await PDFDocument.load(buf);
      const pages = doc.getPages();
      const avgWidth =
        pages.reduce((s, p) => s + p.getWidth(), 0) / pages.length;
      const avgHeight =
        pages.reduce((s, p) => s + p.getHeight(), 0) / pages.length;
      setPageInfo({ count: pages.length, avgWidth, avgHeight });
    } catch {
      setPageInfo(null);
    }

    setState("selected");
  };

  const handlePreset = (preset) => {
    setDpi(preset.dpi);
    setQuality(preset.quality);
  };

  const handleCompress = async () => {
    setState("loading");
    try {
      const res = await _GSPS2PDF({
        psDataURL: file.url,
        level: "custom",
        dpi,
        quality,
      });
      setResult(res);
      setState("done");
    } catch (err) {
      console.error("Compression failed:", err);
      setState("error");
    }
  };

  const handleReset = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    if (file?.url) URL.revokeObjectURL(file.url);
    setFile(null);
    setResult(null);
    setPageInfo(null);
    setState("init");
    if (inputRef.current) inputRef.current.value = "";
  };

  const minFileName = file?.name?.replace(/\.pdf$/i, "-min.pdf");
  const savings =
    file?.size && result?.size
      ? ((1 - result.size / file.size) * 100).toFixed(1)
      : 0;
  const estimated = estimateSize(pageInfo, dpi, quality);

  const matchPreset = () =>
    PRESETS.find((p) => p.dpi === dpi && p.quality === quality);

  return (
    <div className="app">
      <h1>PDF 智能压缩</h1>
      <p className="subtitle">
        在浏览器中本地压缩，数据不会上传到服务器
      </p>

      {state === "init" && (
        <div
          className="upload-area"
          onClick={() => inputRef.current?.click()}
        >
          <div className="upload-icon">+</div>
          <p>点击选择 PDF 文件</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            hidden
          />
        </div>
      )}

      {(state === "selected" || state === "loading") && file && (
        <div className="file-info">
          <span className="file-name">{file.name}</span>
          <span className="file-size">
            {formatSize(file.size)}
            {pageInfo && ` · ${pageInfo.count} 页`}
          </span>
        </div>
      )}

      {state === "selected" && (
        <>
          <h3>快速预设</h3>
          <div className="level-grid">
            {PRESETS.map((p) => (
              <div
                key={p.key}
                className={`level-card ${
                  matchPreset()?.key === p.key ? "selected" : ""
                }`}
                onClick={() => handlePreset(p)}
              >
                <div className="level-label">{p.label}</div>
              </div>
            ))}
          </div>

          <div className="slider-section">
            <div className="slider-row">
              <label>DPI</label>
              <input
                type="range"
                min={30}
                max={200}
                value={dpi}
                onChange={(e) => setDpi(+e.target.value)}
              />
              <span className="slider-val">{dpi}</span>
            </div>
            <div className="slider-row">
              <label>质量</label>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(+e.target.value)}
              />
              <span className="slider-val">{quality}%</span>
            </div>
            {estimated != null && (
              <div className="estimate">
                预估大小：~{formatSize(estimated)}
              </div>
            )}
          </div>

          <button className="compress-btn" onClick={handleCompress}>
            开始压缩
          </button>
        </>
      )}

      {state === "loading" && (
        <div className="loading">
          <div className="spinner" />
          <p>正在压缩中...</p>
        </div>
      )}

      {state === "done" && (
        <div className="result">
          <div className="result-header">压缩完成</div>
          <div className="size-comparison">
            <div className="size-item">
              <span className="size-label">原始大小</span>
              <span className="size-value original">
                {formatSize(file.size)}
              </span>
            </div>
            <div className="size-arrow">&rarr;</div>
            <div className="size-item">
              <span className="size-label">压缩后</span>
              <span className="size-value compressed">
                {formatSize(result.size)}
              </span>
            </div>
          </div>
          {savings > 0 && (
            <div className="savings">节省了 {savings}%</div>
          )}
          <a
            href={result.url}
            download={minFileName}
            className="download-btn"
          >
            下载 {minFileName}
          </a>
          <button className="reset-btn" onClick={handleReset}>
            压缩另一个文件
          </button>
        </div>
      )}

      {state === "error" && (
        <div className="error-box">
          <p>压缩失败，请检查文件是否为有效的 PDF。</p>
          <button className="reset-btn" onClick={handleReset}>
            重试
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
