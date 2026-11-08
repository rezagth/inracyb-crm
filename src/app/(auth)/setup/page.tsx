import { redirect } from "next/navigation";
import { hasAnyUser, setupTokenRequired } from "@/lib/auth";
import { SetupForm } from "../auth-forms";

export const metadata = { title: "Premier lancement" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await hasAnyUser())) redirect("/login");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Bienvenue</h1>
      <p className="mb-6 text-[13px] text-muted-fg">Premier lancement : crée ton compte administrateur. Cette page disparaît dès qu&apos;un compte existe.</p>
      <SetupForm needsToken={setupTokenRequired()} />
    </>
  );
}
