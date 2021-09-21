#!/usr/bin/env node

const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { spawn } = require("child_process");

const BIN_PATH = path.join(__dirname, "./bin");
const VERSION_TXT_PATH = path.join(BIN_PATH, "./version.txt");
const APPIMG_PATH = path.join(BIN_PATH, "./nextcloud.AppImage");

const repoInfo = {
  owner: "nextcloud",
  repo: "desktop",
};

const octokit = new Octokit();

async function checkAndUpdate() {
  const currentVersion = getCurrentVersion();
  const release = await octokit.rest.repos.getLatestRelease(repoInfo);
  const releaseVersion = release.data.tag_name;
  if (releaseVersion === currentVersion) {
    return;
  }
  const appImageAsset = release.data.assets.find(({ name }) =>
    name.endsWith(".AppImage")
  );
  if (!appImageAsset) {
    throw new Error("New release detected, but AppImage assets not found");
  }
  const url = appImageAsset.browser_download_url;
  makeSureBinExists();
  removeOld();
  await download(url);
  writeVersion(releaseVersion);
}

function getCurrentVersion() {
  try {
    const file = fs.readFileSync(VERSION_TXT_PATH, { encoding: "utf-8" });
    return file.trim();
  } catch (e) {
    if (e.code && e.code === "ENOENT") {
      return "none";
    }
    throw e;
  }
}

function makeSureBinExists() {
  try {
    fs.mkdirSync(BIN_PATH);
    return;
  } catch (e) {
    if (e.code && e.code === "EEXIST") {
      return;
    }
    throw e;
  }
}

function removeOld() {
  try {
    fs.unlinkSync(APPIMG_PATH);
  } catch (e) {
    if (e.code && e.code === "ENOENT") {
      return;
    }
    throw e;
  }
}

function download(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) {
        throw new Error("Download failed", res);
      }
      return res.body;
    })
    .then((stream) => {
      return new Promise((resolve, reject) => {
        const fStream = fs.createWriteStream(APPIMG_PATH);
        stream.pipe(fStream);
        fStream.on("error", (e) => reject(e));
        fStream.on("close", (e) => {
          resolve();
        });
      });
    })
    .then(() => {
      fs.chmodSync(APPIMG_PATH, 0o775);
    });
}

function writeVersion(newVersion) {
  fs.writeFileSync(VERSION_TXT_PATH, newVersion, { encoding: "utf-8" });
}

checkAndUpdate()
  .then(() => {
    spawn(APPIMG_PATH, { detached: true }).unref();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
