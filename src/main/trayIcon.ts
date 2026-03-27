import { app, nativeImage } from "electron";
import path from "node:path";

function loadIconAsset(filename: string) {
  const iconPath = path.join(
    app.getAppPath(),
    "src",
    "main",
    "assets",
    filename,
  );
  return nativeImage.createFromPath(iconPath);
}

export function createAppIcon() {
  return loadIconAsset("appIcon.png");
}

export function createTrayIcon() {
  const icon =
    process.platform === "darwin"
      ? loadIconAsset("trayTemplate.svg")
      : loadIconAsset("trayIcon.png");
  const resized = icon.resize(
    process.platform === "darwin"
      ? { width: 20, height: 20 }
      : { width: 32, height: 32 },
  );

  if (process.platform === "darwin") {
    resized.setTemplateImage(true);
  }

  return resized;
}
