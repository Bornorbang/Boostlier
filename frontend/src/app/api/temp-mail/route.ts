import { NextRequest } from "next/server";
import { GET as backendProxy } from "../backend/[...path]/route";

export const dynamic = "force-dynamic";
function handler(request: NextRequest) {
  return backendProxy(request, {
    params: Promise.resolve({ path: ["api", "temp-mail"] }),
  });
}
export { handler as GET, handler as POST };
