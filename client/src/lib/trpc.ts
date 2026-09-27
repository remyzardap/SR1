import { createTRPCReact } from "@trpc/react-query";
// The server router remains in the SR1 repository; the preview consumes its API at runtime.
export const trpc: any = createTRPCReact<any>();
