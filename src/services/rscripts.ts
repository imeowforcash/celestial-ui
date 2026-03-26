
export interface ScriptInfo {
  currentPage: number;
  maxPages: number;
}

export interface User {
  _id: string;
  username: string;
  image?: string;
  verified: boolean;
}

export interface Game {
  _id: string;
  title: string;
  placeId: string;
  imgurl: string;
  gameLink: string;
}

export interface Script {
  _id: string;
  title: string;
  views: number;
  private: boolean;
  likes: number;
  dislikes: number;
  keySystem: boolean;
  mobileReady: boolean;
  lastUpdated: string;
  createdAt: string;
  paid: boolean;
  description: string;
  image: string;
  rawScript: string;
  user?: User | User[];
  creator?: string;
  game?: Game;
}

export interface GetScriptByIdResponse {
  script?: Script[] | Script;
  success?: Script;
  error?: string;
}

export interface GetScriptsResponse {
  info: ScriptInfo;
  scripts: Script[];
}

export interface TrendingScript {
  _id: string;
  views: number;
  script: {
    title: string;
    description: string;
    image?: string;
    keySystem?: boolean;
    paid?: boolean;
    likes?: number;
    dislikes?: number;
    rawScript?: string;
    createdAt?: string;
  };
  user: {
    username: string;
    verified: boolean;
    image?: string;
  };
}

export interface TrendingResponse {
  success?: TrendingScript[];
  error?: string;
}

interface GetScriptsApiResponse {
  info?: ScriptInfo;
  scripts?: Script[];
}

export interface GetScriptsParams {
  page?: number;
  q?: string;
  orderBy?: string;
  sort?: "asc" | "desc";
  noKeySystem?: boolean;
  mobileOnly?: boolean;
  notPaid?: boolean;
  unpatched?: boolean;
  verifiedOnly?: boolean;
}

const BASE_URL = "https://rscripts.net/api/v2";

let cachedTrending: TrendingScript[] | null = null;

export const getScripts = async (params: GetScriptsParams = {}): Promise<GetScriptsResponse> => {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.append("page", params.page.toString());
  if (params.q) searchParams.append("q", params.q);
  if (params.orderBy) searchParams.append("orderBy", params.orderBy);
  if (params.sort) searchParams.append("sort", params.sort);
  if (params.noKeySystem) searchParams.append("noKeySystem", "true");
  if (params.mobileOnly) searchParams.append("mobileOnly", "true");
  if (params.notPaid) searchParams.append("notPaid", "true");
  if (params.unpatched) searchParams.append("unpatched", "true");
  if (params.verifiedOnly) searchParams.append("verifiedOnly", "true");

  const response = await fetch(`${BASE_URL}/scripts?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch scripts: ${response.statusText}`);
  }
  const data = await response.json() as GetScriptsApiResponse | Script[];

  if (Array.isArray(data)) {
    return { info: { currentPage: 1, maxPages: 1 }, scripts: data };
  }

  return {
    info: data.info ?? { currentPage: 1, maxPages: 1 },
    scripts: data.scripts ?? [],
  };
};

export const getScriptById = async (id: string): Promise<Script | null> => {
  const response = await fetch(`${BASE_URL}/script?id=${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch script: ${response.statusText}`);
  }
  const data = await response.json() as GetScriptByIdResponse;

  if (data.error) {
    throw new Error(data.error);
  }

  if (Array.isArray(data.script)) {
    return data.script[0] ?? null;
  }

  return data.script ?? data.success ?? null;
};

export const getTrending = async (): Promise<TrendingScript[]> => {
  if (cachedTrending) {
    return cachedTrending;
  }
  const response = await fetch(`${BASE_URL}/trending`);
  if (!response.ok) {
    throw new Error(`Failed to fetch trending scripts: ${response.statusText}`);
  }
  const data = await response.json() as TrendingResponse | TrendingScript[];

  if (Array.isArray(data)) {
    cachedTrending = data;
    return cachedTrending;
  }

  if (data.error) {
    throw new Error(data.error);
  }

  cachedTrending = data.success ?? [];
  return cachedTrending;
};
