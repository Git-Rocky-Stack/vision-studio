"use strict";
const electron = require("electron");
const electronAPI = {
  app: {
    getVersion: () => electron.ipcRenderer.invoke("app:get-version"),
    openExternal: (url) => electron.ipcRenderer.invoke("app:open-external", url),
    getPath: (name) => electron.ipcRenderer.invoke("app:get-path", name),
    openPath: (filePath) => electron.ipcRenderer.invoke("app:open-path", filePath)
  },
  dialog: {
    selectFolder: () => electron.ipcRenderer.invoke("dialog:select-folder"),
    saveFile: (options) => electron.ipcRenderer.invoke("dialog:save-file", options)
  },
  store: {
    get: (key) => electron.ipcRenderer.invoke("store:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("store:set", key, value),
    reset: () => electron.ipcRenderer.invoke("store:reset")
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    update: (patch) => electron.ipcRenderer.invoke("settings:update", patch),
    reset: () => electron.ipcRenderer.invoke("settings:reset")
  },
  assets: {
    export: (sourcePath, destinationPath) => electron.ipcRenderer.invoke("assets:export", sourcePath, destinationPath),
    exportMany: (sourcePaths, destinationDir) => electron.ipcRenderer.invoke("assets:export-many", sourcePaths, destinationDir),
    delete: (sourcePath) => electron.ipcRenderer.invoke("assets:delete", sourcePath),
    reveal: (sourcePath) => electron.ipcRenderer.invoke("assets:reveal", sourcePath),
    clearCache: () => electron.ipcRenderer.invoke("assets:clear-cache")
  },
  generation: {
    generateImage: (params) => electron.ipcRenderer.invoke("generation:generate-image", params),
    generateVideo: (params) => electron.ipcRenderer.invoke("generation:generate-video", params),
    batch: (params) => electron.ipcRenderer.invoke("generation:batch", params),
    enhancePrompt: (params) => electron.ipcRenderer.invoke("generation:enhance-prompt", params),
    cropImage: (params) => electron.ipcRenderer.invoke("generation:crop-image", params),
    upscaleImage: (params) => electron.ipcRenderer.invoke("generation:upscale-image", params),
    getStatus: (jobId) => electron.ipcRenderer.invoke("generation:get-status", jobId),
    cancel: (jobId) => electron.ipcRenderer.invoke("generation:cancel", jobId),
    listJobs: (options) => electron.ipcRenderer.invoke("generation:list-jobs", options),
    onProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("generation:progress", handler);
      return () => electron.ipcRenderer.off("generation:progress", handler);
    }
  },
  system: {
    getInfo: () => electron.ipcRenderer.invoke("system:get-info")
  },
  models: {
    list: () => electron.ipcRenderer.invoke("models:list"),
    download: (modelId) => electron.ipcRenderer.invoke("models:download", modelId),
    getStatus: (modelId) => electron.ipcRenderer.invoke("models:get-status", modelId),
    delete: (modelId) => electron.ipcRenderer.invoke("models:delete", modelId)
  },
  notifications: {
    notify: (type, payload) => electron.ipcRenderer.invoke("notifications:notify", type, payload)
  },
  backend: {
    start: () => electron.ipcRenderer.invoke("backend:start"),
    stop: () => electron.ipcRenderer.invoke("backend:stop"),
    getStatus: () => electron.ipcRenderer.invoke("backend:status"),
    checkBundled: () => electron.ipcRenderer.invoke("backend:check-bundled"),
    onStatusChange: (callback) => {
      const handler = (_event, data) => callback(data);
      electron.ipcRenderer.on("backend:status", handler);
      return () => electron.ipcRenderer.off("backend:status", handler);
    }
  }
};
electron.contextBridge.exposeInMainWorld("electron", electronAPI);
