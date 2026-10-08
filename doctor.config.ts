import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    // Built bundles are not our React code.
    files: [".output/**", ".wxt/**", "coverage/**"],
  },
});
