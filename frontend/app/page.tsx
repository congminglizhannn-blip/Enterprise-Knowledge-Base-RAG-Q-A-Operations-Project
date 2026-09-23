import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTED_VIEWS, type BusinessView } from "@/lib/routing";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_token")?.value;

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const urlView = params.view;

  if (urlView && ROUTED_VIEWS.has(urlView as BusinessView)) {
    redirect("/" + urlView);
  }

  redirect("/chat");
}
