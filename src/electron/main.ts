import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalThreadStore } from "./local-store";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let threadStore: LocalThreadStore | undefined;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.resolve(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  const developmentUrl = process.env.NASTI_DEV_SERVER_URL;
  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(path.resolve(currentDirectory, "renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  threadStore = new LocalThreadStore(path.join(app.getPath("userData"), "threads.sqlite"));
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("will-quit", () => {
  threadStore?.close();
  threadStore = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
