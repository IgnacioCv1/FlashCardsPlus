const fallbackApiBaseUrl = "http://localhost:4000";

export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackApiBaseUrl).replace(/\/+$/, "");
