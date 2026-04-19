// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const sharedRoot = path.resolve(__dirname, "../shared");

config.watchFolders = [...(config.watchFolders || []), sharedRoot];
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  "@shared": sharedRoot,
};

module.exports = config;
