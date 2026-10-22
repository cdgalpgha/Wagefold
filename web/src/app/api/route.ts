import { fail } from "@/lib/server/http";

// The bare /api path answers in JSON too (the catch-all only matches paths below it).
const notFound = () => fail("Not found.", 404);
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
