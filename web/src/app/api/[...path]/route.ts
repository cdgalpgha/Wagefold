import { fail } from "@/lib/server/http";

// Unknown API paths answer in JSON, like every other API response, instead of the HTML 404 page.
const notFound = () => fail("Not found.", 404);
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
