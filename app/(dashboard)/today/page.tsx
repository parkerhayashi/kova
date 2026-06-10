import { redirect } from "next/navigation";

/** Today merged into home — keep route for bookmarks and revalidation targets. */
export default function TodayPage() {
  redirect("/");
}
