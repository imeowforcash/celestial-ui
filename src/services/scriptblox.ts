
import { invoke } from "@tauri-apps/api/core";

export interface ScriptBloxGame {
  _id: string;
  name: string;
  imageUrl: string;
}

export interface ScriptBloxScript {
  _id: string;
  title: string;
  game: ScriptBloxGame;
  slug: string;
  verified: boolean;
  key: boolean;
  views: number;
  scriptType: string;
  isPatched: boolean;
  isUniversal: boolean;
  createdAt: string;
  updatedAt?: string;
  image: string;
  script?: string;
}

export interface ScriptBloxFetchResponse {
  result: {
    totalPages: number;
    nextPage?: number;
    max: number;
    scripts: ScriptBloxScript[];
  };
}

export interface ScriptBloxSearchResponse {
  result: {
    totalPages: number;
    scripts: ScriptBloxScript[];
  };
}

export interface ScriptBloxTrendingResponse {
  result: {
    max: number;
    scripts: ScriptBloxScript[];
  };
}

export interface ScriptBloxParams {
  page?: number;
  max?: number;
  q?: string;
  mode?: 'free' | 'paid';
  patched?: number;
  key?: number;
  universal?: number;
  verified?: number;
  sortBy?: 'views' | 'likeCount' | 'createdAt' | 'updatedAt' | 'dislikeCount' | 'accuracy';
  order?: 'asc' | 'desc';
}

const BASE_URL = "https://scriptblox.com/api";

let cachedTrending: ScriptBloxScript[] | null = null;

export const getScriptBloxScripts = async (params: ScriptBloxParams = {}): Promise<ScriptBloxFetchResponse> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append("page", params.page.toString());
  if (params.max) searchParams.append("max", params.max.toString());
  if (params.mode) searchParams.append("mode", params.mode);
  if (params.patched !== undefined) searchParams.append("patched", params.patched.toString());
  if (params.key !== undefined) searchParams.append("key", params.key.toString());
  if (params.universal !== undefined) searchParams.append("universal", params.universal.toString());
  if (params.verified !== undefined) searchParams.append("verified", params.verified.toString());
  if (params.sortBy) searchParams.append("sortBy", params.sortBy);
  if (params.order) searchParams.append("order", params.order);

  const response = await fetch(`${BASE_URL}/script/fetch?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ScriptBlox scripts: ${response.statusText}`);
  }
  return response.json();
};

export const searchScriptBloxScripts = async (params: ScriptBloxParams = {}): Promise<ScriptBloxSearchResponse> => {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.append("q", params.q);
  if (params.page) searchParams.append("page", params.page.toString());
  if (params.max) searchParams.append("max", params.max.toString());
  if (params.mode) searchParams.append("mode", params.mode);
  if (params.patched !== undefined) searchParams.append("patched", params.patched.toString());
  if (params.key !== undefined) searchParams.append("key", params.key.toString());
  if (params.universal !== undefined) searchParams.append("universal", params.universal.toString());
  if (params.verified !== undefined) searchParams.append("verified", params.verified.toString());
  if (params.sortBy) searchParams.append("sortBy", params.sortBy);
  if (params.order) searchParams.append("order", params.order);

  const response = await fetch(`${BASE_URL}/script/search?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to search ScriptBlox scripts: ${response.statusText}`);
  }
  return response.json();
};

export const getScriptBloxTrending = async (): Promise<ScriptBloxScript[]> => {
  if (cachedTrending) {
    return cachedTrending;
  }
  const response = await fetch(`${BASE_URL}/script/trending`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ScriptBlox trending scripts: ${response.statusText}`);
  }
  const data: ScriptBloxTrendingResponse = await response.json();
  cachedTrending = data.result.scripts || [];
  return cachedTrending;
};

export const getScriptBloxRaw = async (id: string): Promise<string> => {
  const text = await invoke<string>("download_script", { 
    url: `${BASE_URL}/script/raw/${id}` 
  });
  
  try {
    const json = JSON.parse(text);
    return json.script || text;
  } catch {
    return text;
  }
};
