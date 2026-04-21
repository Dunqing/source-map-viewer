import { kv } from "void/kv";

export interface ShareData {
  generatedCode: string;
  sourceMapJson: string;
}

export const shares = kv.map<ShareData>("share");

export const SHARE_TTL = 30 * 24 * 60 * 60; // 30 days
