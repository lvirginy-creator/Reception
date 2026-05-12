import { api } from "./client";
import type { AuthUser } from "../store/authStore";

export async function loginPin(magasin_code: string, pin: string): Promise<AuthUser> {
  const { data } = await api.post("/auth/pin", { magasin_code, pin });
  return data as AuthUser;
}

export async function loginAdmin(username: string, password: string): Promise<AuthUser> {
  const { data } = await api.post("/auth/login", { username, password });
  return data as AuthUser;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout").catch(() => {});
}
