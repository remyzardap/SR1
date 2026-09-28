import { createTRPCReact } from "@trpc/react-query";
// The full SR1 server now lives in ./server (copied from the SR1 repo), but its
// dependencies (drizzle-orm, express, etc.) are installed only where the server
// runs — see sr1-server.package.json. The preview consumes the API at runtime,
// so the client keeps an untyped tRPC handle rather than importing the router.
export const trpc: any = createTRPCReact<any>();
