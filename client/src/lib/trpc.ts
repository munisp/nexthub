/**
 * client/src/lib/trpc.ts — NextHub tRPC Client
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed tRPC client for the NextHub Admin + Regulator Portal frontend.
 * Points to the nexthub-core server's /api/trpc endpoint.
 */
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        },
      }),
    ],
  });
}
