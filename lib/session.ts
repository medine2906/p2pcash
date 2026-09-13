import "server-only";
import { cookies } from "next/headers";

const SESSION_COOKIE = "p2pcash_session";

export interface SessionData {
  jwt: string;
  publicKey: string;
}

export async function setSessionCookie(data: SessionData) {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h, matches typical SEP-10 JWT lifetime
  });
}

export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
