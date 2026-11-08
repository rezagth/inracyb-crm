/** Questionnaire d'audit cyber (repris de la maquette), score, rapport et compte rendu de comité. */
export type Control = { id: string; cat: string; q: string; prio: "haute" | "moyenne" | "basse"; reco: string };
export type Answer = "oui" | "partiel" | "non" | "na";

export const CONTROLS: Control[] = [
      { id: "a1", cat: "Comptes et accès", q: "La double authentification est activée sur toutes les messageries et comptes critiques", prio: "haute", reco: "Activer la double authentification sur toutes les messageries et comptes critiques" },
      { id: "a2", cat: "Comptes et accès", q: "Chaque personne a son propre compte (aucun compte partagé)", prio: "moyenne", reco: "Supprimer les comptes partagés et créer des comptes nominatifs" },
      { id: "a3", cat: "Comptes et accès", q: "Les accès sont coupés le jour du départ d'un collaborateur", prio: "haute", reco: "Mettre en place une procédure de départ (coupure des accès le jour même)" },
      { id: "a4", cat: "Comptes et accès", q: "Un gestionnaire de mots de passe est utilisé", prio: "moyenne", reco: "Déployer un gestionnaire de mots de passe pour l'équipe" },
      { id: "a5", cat: "Comptes et accès", q: "Les droits administrateur sont réservés à ceux qui en ont besoin", prio: "moyenne", reco: "Retirer les droits administrateur des comptes utilisateurs" },
      { id: "b1", cat: "Sauvegardes", q: "Les données sont sauvegardées automatiquement", prio: "haute", reco: "Mettre en place une sauvegarde automatique des données" },
      { id: "b2", cat: "Sauvegardes", q: "Une copie de sauvegarde est hors ligne ou hors site", prio: "haute", reco: "Ajouter une sauvegarde hors ligne ou externalisée" },
      { id: "b3", cat: "Sauvegardes", q: "Une restauration a été testée dans les 6 derniers mois", prio: "haute", reco: "Tester la restauration des sauvegardes" },
      { id: "c1", cat: "Postes et mobiles", q: "Les mises à jour s'installent automatiquement", prio: "haute", reco: "Activer les mises à jour automatiques sur tous les postes" },
      { id: "c2", cat: "Postes et mobiles", q: "Un antivirus ou EDR est actif sur tous les postes", prio: "moyenne", reco: "Déployer une protection antivirus/EDR sur tous les postes" },
      { id: "c3", cat: "Postes et mobiles", q: "Les ordinateurs portables sont chiffrés", prio: "moyenne", reco: "Chiffrer les postes portables" },
      { id: "c4", cat: "Postes et mobiles", q: "Les postes se verrouillent automatiquement", prio: "basse", reco: "Activer le verrouillage automatique des sessions" },
      { id: "d1", cat: "Messagerie et fraude", q: "Tout changement de RIB est vérifié par téléphone, à un numéro connu", prio: "haute", reco: "Mettre en place la vérification téléphonique des changements de RIB" },
      { id: "d2", cat: "Messagerie et fraude", q: "Le filtrage anti-spam et anti-phishing est configuré", prio: "moyenne", reco: "Configurer le filtrage anti-spam et anti-phishing" },
      { id: "d3", cat: "Messagerie et fraude", q: "SPF, DKIM et DMARC sont configurés sur le nom de domaine", prio: "moyenne", reco: "Configurer SPF, DKIM et DMARC sur le domaine" },
      { id: "e1", cat: "Réseau et Wi-Fi", q: "Le Wi-Fi invités est séparé du réseau interne", prio: "moyenne", reco: "Séparer le Wi-Fi invités du réseau interne" },
      { id: "e2", cat: "Réseau et Wi-Fi", q: "Les accès à distance passent par une solution sécurisée (VPN ou équivalent)", prio: "haute", reco: "Sécuriser les accès à distance (VPN ou équivalent, avec double authentification)" },
      { id: "e3", cat: "Réseau et Wi-Fi", q: "Les mots de passe par défaut du matériel réseau ont été changés", prio: "moyenne", reco: "Changer les mots de passe par défaut de la box et du matériel réseau" },
      { id: "f1", cat: "Sensibilisation", q: "L'équipe a été sensibilisée au phishing et à la fraude dans l'année", prio: "moyenne", reco: "Sensibiliser l'équipe au phishing et à la fraude" },
      { id: "f2", cat: "Sensibilisation", q: "Une charte informatique est signée par l'équipe", prio: "basse", reco: "Rédiger et faire signer une charte informatique" },
      { id: "g1", cat: "Gouvernance", q: "Un inventaire du matériel et des logiciels est à jour", prio: "moyenne", reco: "Établir l'inventaire du matériel et des logiciels" },
      { id: "g2", cat: "Gouvernance", q: "Un registre RGPD des traitements est tenu", prio: "moyenne", reco: "Mettre en place le registre RGPD des traitements" },
      { id: "g3", cat: "Gouvernance", q: "Une procédure écrite existe en cas d'incident", prio: "haute", reco: "Rédiger un plan de réponse à incident" },
      { id: "g4", cat: "Gouvernance", q: "Les contrats des prestataires informatiques encadrent la sécurité et les données", prio: "basse", reco: "Revoir les contrats des prestataires (sécurité, données, réversibilité)" }
    ];

export function auditScore(answers: Record<string, string>) {
  const cats: Record<string, { s: number; m: number }> = {};
  let tot = 0,
    max = 0,
    answered = 0;
  for (const c of CONTROLS) {
    const v = answers[c.id];
    const k = (cats[c.cat] ??= { s: 0, m: 0 });
    if (v) answered++;
    if (v && v !== "na") {
      const p = v === "oui" ? 1 : v === "partiel" ? 0.5 : 0;
      k.s += p;
      k.m += 1;
      tot += p;
      max += 1;
    }
  }
  return { cats, pct: max ? Math.round((tot / max) * 100) : 0, answered, total: CONTROLS.length };
}

const fd = (d: string) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "—");

export function auditReportText(a: { date: string; answers: Record<string, string> }, company: string, me: string, brand: string) {
  const sc = auditScore(a.answers);
  const lines = ["RAPPORT D'AUDIT CYBER", company, `Date : ${fd(a.date)} · Réalisé par ${me || "[Ton nom]"} (${brand || "InfraCyb"})`, "", `Score global : ${sc.pct} % (${sc.answered} points sur ${sc.total} évalués)`, ""];
  lines.push("SCORES PAR DOMAINE");
  for (const [k, x] of Object.entries(sc.cats)) lines.push(`· ${k} : ${x.m ? Math.round((x.s / x.m) * 100) + " %" : "non évalué"}`);
  const ord = { haute: 0, moyenne: 1, basse: 2 };
  const todo = CONTROLS.filter((x) => a.answers[x.id] === "non" || a.answers[x.id] === "partiel").sort((x, y) => ord[x.prio] - ord[y.prio]);
  const ok = CONTROLS.filter((x) => a.answers[x.id] === "oui");
  lines.push("", "POINTS FORTS");
  if (!ok.length) lines.push("· Aucun point validé pour l'instant.");
  ok.forEach((x) => lines.push("· " + x.q));
  lines.push("", "PLAN D'ACTION RECOMMANDÉ (par priorité)");
  if (!todo.length) lines.push("· Aucune action prioritaire identifiée.");
  todo.forEach((x, i) => lines.push(`${i + 1}. [${x.prio.toUpperCase()}] ${x.reco}${a.answers[x.id] === "partiel" ? " (partiellement en place)" : ""}`));
  lines.push("", "MÉTHODE ET LIMITES", `Audit réalisé par entretien et vérifications sur place ou à distance, selon ${sc.total} points de contrôle. Ce rapport ne constitue pas un test d'intrusion.`);
  return lines.join("\n");
}
