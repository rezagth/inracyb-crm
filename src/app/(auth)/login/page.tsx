import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Connexion</h1>
      <p className="mb-6 text-[13px] text-muted-fg">Accès réservé. Après 5 essais ratés, le compte est bloqué 15 minutes.</p>
      <LoginForm />
    </>
  );
}
