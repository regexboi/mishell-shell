import path from "node:path";

import { app, BrowserWindow, nativeTheme } from "electron";

import { registerAppIpc } from "./ipc/register-app-ipc";
import { createAppRuntime } from "./runtime";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let runtime: ReturnType<typeof createAppRuntime> | null = null;

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: process.platform !== "darwin",
    backgroundColor: "#05050a",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Preload failed at ${preloadPath}:`, error);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  nativeTheme.themeSource = "dark";

  runtime = createAppRuntime({
    initialCwd: app.isPackaged ? app.getPath("home") : process.cwd(),
    userDataPath: app.getPath("userData"),
  });
  registerAppIpc(runtime);

  await createMainWindow();
}

app.whenReady().then(bootstrap);

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  runtime?.execution.dispose();
  runtime?.database.db.close();
});
