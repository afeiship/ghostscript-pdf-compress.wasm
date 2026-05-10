import { useState, useRef } from "react";
import "./App.css";
import { _GSPS2PDF } from "./lib/worker-init.js";

const LEVELS = [
  {
    key: "extreme",
    label: "极高压缩",
    desc: "最大程度节省存储空间",
    detail: "光栅化压缩，不可搜索文字",
  },
  {
    key: "high",
    label: "高压缩",
    desc: "最适合更快速的在线分享",
    detail: "光栅化压缩，不可搜索文字",
  },
  {
    key: "medium",
    label: "中等压缩",
    desc: "非常适合一般用途",
    detail: "保留文字可搜索性",
  },
  {
    key: "low",
    label: "低压缩",
    desc: "图像清晰，文件更小",
    detail: "保留文字可搜索性",
  },
];

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function App() {
  const [state, setState] = useState("init");
  const [file, setFile] = useState(null);
  const [level, setLevel] = useState("high");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile({ name: f.name, size: f.size, url: URL.createObjectURL(f) });
    setState("selected");
  };

  const handleCompress = async () => {
    setState("loading");
    try {
      const res = await _GSPS2PDF({ psDataURL: file.url, level });
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
    setState("init");
    if (inputRef.current) inputRef.current.value = "";
  };

  const minFileName = file?.name?.replace(/\.pdf$/i, "-min.pdf");
  const savings =
    file?.size && result?.size
      ? ((1 - result.size / file.size) * 100).toFixed(1)
      : 0;

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
          <span className="file-size">{formatSize(file.size)}</span>
        </div>
      )}

      {state === "selected" && (
        <>
          <h3>选择压缩选项</h3>
          <div className="level-grid">
            {LEVELS.map((l) => (
              <div
                key={l.key}
                className={`level-card ${level === l.key ? "selected" : ""}`}
                onClick={() => setLevel(l.key)}
              >
                <div className="level-label">{l.label}</div>
                <div className="level-desc">{l.desc}</div>
                <div className="level-detail">{l.detail}</div>
              </div>
            ))}
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
