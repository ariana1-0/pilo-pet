// preload：安全暴露有限 API 给渲染进程（contextIsolation）
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("philo", {
  getConfig: () => ipcRenderer.invoke("engine"),
  requestQuote: () => ipcRenderer.invoke("get-quote"),
  openWeb: (slug) => ipcRenderer.send("open-web", slug),
  quoteVisible: (slug) => ipcRenderer.send("quote-visible", slug),
  resizeTo: (h) => ipcRenderer.send("resize", h),
  startDrag: (point) => ipcRenderer.send("pet-drag-start", point),
  moveDrag: (point) => ipcRenderer.send("pet-drag-move", point),
  endDrag: () => ipcRenderer.send("pet-drag-end"),
  onQuote: (cb) => ipcRenderer.on("quote", (_e, q) => cb(q)),
  onPetSize: (cb) => ipcRenderer.on("pet-size", (_e, scale) => cb(scale)),
  onAmbientAction: (cb) => ipcRenderer.on("ambient-action", () => cb()),
});
