const fs = require("fs");
const path = require("path");

const buildAssets = path.join(__dirname, "build-assets");
const macIcon = path.join(buildAssets, "icon.icns");
const windowsIcon = path.join(buildAssets, "icon.ico");
const platformIcon = process.platform === "darwin" ? macIcon : windowsIcon;

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.philopet.preview",
    appCategoryType: "public.app-category.lifestyle",
    icon: fs.existsSync(platformIcon) ? platformIcon : undefined,
    ignore: [
      /^\/out(?:\/|$)/,
      /^\/build-assets(?:\/|$)/,
      /^\/assets\/philo-cat\/concepts(?:\/|$)/,
    ],
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: { name: "philo-pet" },
    },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "philo_pet",
        authors: "philo-pet",
        description: "常驻桌面的哲学家桌宠",
        setupIcon: fs.existsSync(windowsIcon) ? windowsIcon : undefined,
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32"],
      config: {},
    },
  ],
};
