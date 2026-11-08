"use client";

import { useActionState } from "react";
import { loginAction, setupAction, type AuthState } from "./actions";
import { SubmitButton } from "@/components/form";

function ErrorBox({ state }: { state: AuthState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="pill tone-ko h-auto whitespace-normal px-3 py-2">
      {state.error}
    </p>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="label">
        E-mail
        <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <label className="label">
        Mot de passe
        <input className="input" type="password" name="password" autoComplete="current-password" required />
      </label>
      <ErrorBox state={state} />
      <SubmitButton className="btn btn-pri w-full" pendingText="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}

export function SetupForm({ needsToken = false }: { needsToken?: boolean }) {
  const [state, action] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {needsToken && (
        <label className="label">
          Code d&apos;installation (variable SETUP_TOKEN de l&apos;hébergement)
          <input className="input" type="password" name="setupToken" autoComplete="off" required autoFocus />
        </label>
      )}
      <label className="label">
        Prénom et nom
        <input className="input" name="name" autoComplete="name" required autoFocus={!needsToken} />
      </label>
      <label className="label">
        E-mail de connexion
        <input className="input" type="email" name="email" autoComplete="username" required />
      </label>
      <label className="label">
        Mot de passe (12 caractères minimum)
        <input className="input" type="password" name="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label className="label">
        Confirmer le mot de passe
        <input className="input" type="password" name="confirm" autoComplete="new-password" minLength={12} required />
      </label>
      <p className="tip">Utilise une phrase de passe longue et unique, idéalement générée par ton gestionnaire de mots de passe.</p>
      <ErrorBox state={state} />
      <SubmitButton className="btn btn-pri w-full" pendingText="Création…">
        Créer mon compte administrateur
      </SubmitButton>
    </form>
  );
}
