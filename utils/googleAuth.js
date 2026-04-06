import { google } from "googleapis";
import { readFile } from "fs/promises";
import googleCredentials from "../config/googleCredentials.js";

const config = JSON.parse(
  await readFile(new URL("../config/config.json", import.meta.url))
);

let cachedAuth = null;
let cachedSheetsClient = null;

async function getAuth() {
  if (cachedAuth) return cachedAuth;

  cachedAuth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: config.scopes
  });

  return cachedAuth;
}

export async function getSheetsClient() {
  if (cachedSheetsClient) return cachedSheetsClient;

  const auth = await getAuth();

  cachedSheetsClient = google.sheets({
    version: "v4",
    auth
  });

  return cachedSheetsClient;
}

export async function getAccessToken() {
  const auth = await getAuth();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  return token.token;
}