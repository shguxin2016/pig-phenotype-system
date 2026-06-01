export const tokenKey = "pig_system_token";

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(tokenKey);
};

export const setToken = (token: string) => {
  window.localStorage.setItem(tokenKey, token);
};

export const clearToken = () => {
  window.localStorage.removeItem(tokenKey);
};

