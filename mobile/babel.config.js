module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { reanimated: false, worklets: false }]
    ],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./",
            "@shared": "../shared",
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
