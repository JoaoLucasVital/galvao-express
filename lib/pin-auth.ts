import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "galvao_access";
const SESSION_DURATION_SECONDS = 60 * 21;

function accessPin() {
  const value = process.env.GALVAO_ACCESS_PIN;
  if (!value) throw new Error("A variável GALVAO_ACCESS_PIN não foi configurada.");
  return value;
}

function sessionSecret() {
  const value = process.env.GALVAO_SESSION_SECRET;
  if (!value) throw new Error("A variável GALVAO_SESSION_SECRET não foi configurada.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function pinMatches(pin: string) {
  const received = Buffer.from(pin);
  const expected = Buffer.from(accessPin());
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createAccessCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const value = `${expiresAt}.${sign(String(expiresAt))}`;
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAccessCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function isAuthorized(request: Request) {
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!cookie) return false;
  const [expiresText, signature] = cookie.split(".");
  const expiresAt = Number(expiresText);
  if (!expiresText || !signature || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const received = Buffer.from(signature);
  const expected = Buffer.from(sign(expiresText));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function unauthorized() {
  return Response.json({ error: "Acesso não autorizado." }, { status: 401 });
}
