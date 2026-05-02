import packageJson from "../package.json" with { type: "json" };

export const CLIPDECK_VERSION: string = packageJson.version;
