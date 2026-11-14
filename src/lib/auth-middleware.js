import { createClient, createClientFromRequest, getAccessToken } from "@base44/sdk";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

// Base44 হোস্টিংয়ে প্ল্যাটফর্ম হেডার থাকে; Netlify-তে না থাকলে নিজে ক্লায়েন্ট বানানো হয়
const makeClient = (request) => {
  if (request?.headers?.get("Base44-App-Id")) return createClientFromRequest(request);
  const auth = request?.headers?.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "") || undefined;
  return createClient({
    appId: import.meta.env.VITE_BASE44_APP_ID,
    token,
    serverUrl: import.meta.env.VITE_BASE44_APP_BASE_URL,
  });
};

const withGetBase44 = (next, request = getRequest()) => {
  let client;
  return next({ context: { getBase44: () => (client ??= makeClient(request)) } });
};

export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = typeof window === "undefined" ? null : getAccessToken();
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  })
  .server(({ next }) => withGetBase44(next));

export const base44RequestMiddleware = createMiddleware({ type: "request" }).server(({ next, request }) =>
  withGetBase44(next, request),
);

const currentUser = (context) =>
  context
    .getBase44()
    .auth.me()
    .catch((error) => {
      if (error?.status === 401 || error?.status === 403) return null;
      throw error;
    });

export const requireUser = createMiddleware({ type: "function" }).server(async ({ next, context }) => {
  const user = await currentUser(context);
  if (!user) {
    setResponseStatus(401);
    throw Object.assign(new Error("Unauthorized"), { status: 401, code: "UNAUTHORIZED" });
  }
  return next({ context: { user } });
});

export const requireUserRoute = createMiddleware({ type: "request" }).server(async ({ next, context }) => {
  const user = await currentUser(context);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return next({ context: { user } });
});
