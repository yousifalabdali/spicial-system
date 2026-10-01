let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("bridge", { invoke: (name, ...args) => electron.ipcRenderer.invoke(`api:${name}`, ...args) });
//#endregion
