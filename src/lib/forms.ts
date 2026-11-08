/** Définitions des formulaires génériques (partagées client/serveur, sans accès base). */
import { addDays, today } from "./format";

export type FieldKind = "text" | "number" | "date" | "time" | "select" | "area" | "company" | "mission" | "email";
export type FieldDef = { k: string; l: string; kind: FieldKind; opts?: readonly (readonly [string, string])[]; full?: boolean; ph?: string; required?: boolean };
export type FormDef = { title: string; fields: FieldDef[]; defaults: () => Record<string, string>; submit?: string };

const o = (...xs: string[]) => xs.map((x) => [x, x] as const);

export const MISSION_STATUS = [["a_demarrer", "À démarrer"], ["en_cours", "En cours"], ["livree", "Livrée"], ["cloturee", "Clôturée"]] as const;
export const TICKET_STATUS = [["ouvert", "Ouvert"], ["en_cours", "En cours"], ["resolu", "Résolu"]] as const;
export const DOC_STATUS = [["a_rediger", "À rédiger"], ["brouillon", "Brouillon"], ["a_relire", "À faire relire"], ["valide", "Validé"], ["signe", "Signé"]] as const;
export const POST_STATUS = [["idee", "Idée"], ["redige", "Rédigé"], ["programme", "Programmé"], ["publie", "Publié"]] as const;
export const ACTION_STATUS = [["a_faire", "À faire"], ["en_cours", "En cours"], ["fait", "Fait"]] as const;
export const CONTRACT_STATUS = [["brouillon", "Brouillon"], ["actif", "Actif"], ["termine", "Terminé"]] as const;
export const PARTNER_STATUS = [["a_trouver", "À trouver"], ["a_contacter", "À contacter"], ["actif", "Actif"], ["inactif", "Inactif"]] as const;
export const INCIDENT_STATUS = [["ouvert", "Ouvert"], ["en_cours", "En cours"], ["clos", "Clos"]] as const;
export const RGPD_STATUS = [["a_valider", "À valider"], ["valide", "Validé"]] as const;
export const EXPENSE_CATS = ["Logiciels & abonnements", "Matériel", "Assurance", "Déplacements", "Formation", "Banque", "Sous-traitance", "Autre"] as const;
export const PRIO3 = [["haute", "Haute"], ["moyenne", "Moyenne"], ["basse", "Basse"]] as const;
export const MEETING_MODES = ["Visio", "Téléphone", "Sur place"] as const;
export const CALL_RESULTS = ["Joint", "RDV obtenu", "Messagerie", "Pas de réponse"] as const;

export const FORMS: Record<string, FormDef> = {
  call: {
    title: "Noter un appel",
    defaults: () => ({ companyId: "", date: today(), result: "Joint", durationMin: "5", note: "" }),
    fields: [
      { k: "companyId", l: "Entreprise *", kind: "company", full: true, required: true },
      { k: "date", l: "Date", kind: "date" },
      { k: "result", l: "Résultat", kind: "select", opts: o(...CALL_RESULTS) },
      { k: "durationMin", l: "Durée (minutes)", kind: "number" },
      { k: "note", l: "Note", kind: "area", ph: "Ce qui s'est dit, la suite prévue" },
    ],
  },
  meeting: {
    title: "Créer un rendez-vous",
    defaults: () => ({ companyId: "", title: "Découverte", date: today(), start: "10:00", end: "10:30", mode: "Visio", location: "", note: "" }),
    fields: [
      { k: "companyId", l: "Entreprise", kind: "company", full: true },
      { k: "title", l: "Objet *", kind: "text", full: true, required: true },
      { k: "date", l: "Date *", kind: "date", required: true },
      { k: "mode", l: "Mode", kind: "select", opts: o(...MEETING_MODES) },
      { k: "start", l: "Début", kind: "time" },
      { k: "end", l: "Fin", kind: "time" },
      { k: "location", l: "Lien visio, téléphone ou adresse", kind: "text", full: true },
      { k: "note", l: "Préparation", kind: "area" },
    ],
  },
  partner: {
    title: "Partenaire",
    defaults: () => ({ name: "", type: "Partenaire (j'oriente)", specialty: "", contact: "", commission: "", status: "a_contacter" }),
    fields: [
      { k: "name", l: "Nom *", kind: "text", full: true, required: true },
      { k: "type", l: "Type", kind: "select", opts: o("Partenaire (j'oriente)", "Apporteur d'affaires", "Sous-traitant") },
      { k: "specialty", l: "Spécialité", kind: "text" },
      { k: "contact", l: "Contact (nom, e-mail, téléphone)", kind: "text", full: true },
      { k: "commission", l: "Commission", kind: "text" },
      { k: "status", l: "Statut", kind: "select", opts: PARTNER_STATUS },
    ],
  },
  contract: {
    title: "Nouveau contrat récurrent",
    defaults: () => ({ companyId: "", offer: "RSSI externalisé", monthly: "", notice: "2 mois", start: today(), end: addDays(today(), 364), status: "actif" }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", full: true, required: true },
      { k: "offer", l: "Offre", kind: "select", opts: o("RSSI externalisé", "Automatisation IA — maintenance", "Autre") },
      { k: "monthly", l: "Montant mensuel (€ HT) *", kind: "number", required: true },
      { k: "notice", l: "Préavis", kind: "select", opts: o("1 mois", "2 mois", "3 mois") },
      { k: "status", l: "Statut", kind: "select", opts: [["actif", "Actif (signé)"], ["brouillon", "Brouillon"]] },
      { k: "start", l: "Début", kind: "date" },
      { k: "end", l: "Fin / renouvellement", kind: "date" },
    ],
  },
  mission: {
    title: "Nouvelle mission",
    defaults: () => ({ companyId: "", title: "", offer: "Audit", budgetDays: "2", start: today(), due: addDays(today(), 14), status: "a_demarrer" }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", full: true, required: true },
      { k: "title", l: "Intitulé *", kind: "text", full: true, required: true, ph: "Ex. Audit cyber forfaitaire" },
      { k: "offer", l: "Offre", kind: "select", opts: o("Audit", "RSSI externalisé", "Automatisation IA", "Autre") },
      { k: "budgetDays", l: "Budget (jours)", kind: "number" },
      { k: "start", l: "Début", kind: "date" },
      { k: "due", l: "Échéance", kind: "date" },
      { k: "status", l: "Statut", kind: "select", opts: MISSION_STATUS, full: true },
    ],
  },
  time: {
    title: "Saisir du temps",
    defaults: () => ({ date: today(), hours: "1", missionId: "", billable: "oui", description: "" }),
    fields: [
      { k: "date", l: "Date", kind: "date" },
      { k: "hours", l: "Durée (heures) *", kind: "number", required: true },
      { k: "missionId", l: "Mission", kind: "mission", full: true },
      { k: "billable", l: "Type", kind: "select", opts: [["oui", "Facturable"], ["non", "Non facturable"]], full: true },
      { k: "description", l: "Description", kind: "area", ph: "Ce que tu as fait" },
    ],
  },
  ticket: {
    title: "Nouveau ticket de support",
    defaults: () => ({ companyId: "", priority: "normale", subject: "", description: "" }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", required: true },
      { k: "priority", l: "Priorité", kind: "select", opts: [["haute", "Haute — 4 h ouvrées"], ["normale", "Normale — 1 jour ouvré"], ["basse", "Basse — 3 jours ouvrés"]] },
      { k: "subject", l: "Sujet *", kind: "text", full: true, required: true },
      { k: "description", l: "Détail", kind: "area" },
    ],
  },
  action: {
    title: "Nouvelle action de sécurité",
    defaults: () => ({ companyId: "", title: "", priority: "moyenne", owner: "Moi", due: addDays(today(), 14), status: "a_faire" }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", full: true, required: true },
      { k: "title", l: "Action *", kind: "text", full: true, required: true, ph: "Ex. Activer la double authentification" },
      { k: "priority", l: "Priorité", kind: "select", opts: PRIO3 },
      { k: "owner", l: "Responsable", kind: "select", opts: o("Moi", "Client", "Prestataire") },
      { k: "due", l: "Échéance", kind: "date" },
      { k: "status", l: "Statut", kind: "select", opts: ACTION_STATUS },
    ],
  },
  audit: {
    title: "Nouvel audit cyber",
    submit: "Démarrer l'audit",
    defaults: () => ({ companyId: "", date: today() }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", full: true, required: true },
      { k: "date", l: "Date de l'audit", kind: "date", full: true },
    ],
  },
  incident: {
    title: "Déclarer un incident",
    defaults: () => ({ companyId: "", date: today(), title: "", type: "Phishing", severity: "moyenne", personalData: "non", actions: "" }),
    fields: [
      { k: "companyId", l: "Client *", kind: "company", required: true },
      { k: "date", l: "Date", kind: "date" },
      { k: "title", l: "Ce qui s'est passé *", kind: "text", full: true, required: true },
      { k: "type", l: "Type", kind: "select", opts: o("Phishing", "Rançongiciel", "Fraude au virement", "Fuite de données", "Compte piraté", "Perte ou vol de matériel", "Autre") },
      { k: "severity", l: "Gravité", kind: "select", opts: [["faible", "Faible"], ["moyenne", "Moyenne"], ["grave", "Grave"]] },
      { k: "personalData", l: "Données personnelles touchées ?", kind: "select", opts: [["non", "Non"], ["oui", "Oui"], ["inconnu", "Pas encore su"]], full: true },
      { k: "actions", l: "Actions menées", kind: "area" },
    ],
  },
  expense: {
    title: "Nouvelle dépense",
    defaults: () => ({ supplier: "", date: today(), amount: "", category: "Logiciels & abonnements", recurring: "Non", proof: "oui" }),
    fields: [
      { k: "supplier", l: "Fournisseur / objet *", kind: "text", full: true, required: true },
      { k: "date", l: "Date", kind: "date" },
      { k: "amount", l: "Montant TTC (€) *", kind: "number", required: true },
      { k: "category", l: "Catégorie", kind: "select", opts: o(...EXPENSE_CATS) },
      { k: "recurring", l: "Récurrence", kind: "select", opts: o("Non", "Mensuel", "Annuel") },
      { k: "proof", l: "Justificatif", kind: "select", opts: [["oui", "Conservé"], ["non", "À récupérer"]], full: true },
    ],
  },
  doc: {
    title: "Document",
    defaults: () => ({ name: "", type: "Modèle", status: "a_rediger", companyId: "", body: "" }),
    fields: [
      { k: "name", l: "Nom *", kind: "text", full: true, required: true },
      { k: "type", l: "Type", kind: "select", opts: o("Modèle", "Contrat", "Rapport", "Administratif", "Juridique") },
      { k: "status", l: "Statut", kind: "select", opts: DOC_STATUS },
      { k: "companyId", l: "Client lié", kind: "company", full: true },
      { k: "body", l: "Contenu ou lien vers le fichier", kind: "area" },
    ],
  },
  kb: {
    title: "Article de la base de connaissances",
    defaults: () => ({ title: "", category: "Procédure", body: "" }),
    fields: [
      { k: "title", l: "Titre *", kind: "text", full: true, required: true },
      { k: "category", l: "Catégorie", kind: "select", opts: o("Procédure", "Checklist", "Modèle", "Note"), full: true },
      { k: "body", l: "Contenu", kind: "area" },
    ],
  },
  post: {
    title: "Nouvelle publication",
    defaults: () => ({ topic: "", date: addDays(today(), 3), network: "LinkedIn", pillar: "Conseil pratique", status: "idee" }),
    fields: [
      { k: "topic", l: "Sujet *", kind: "text", full: true, required: true },
      { k: "date", l: "Date prévue", kind: "date" },
      { k: "network", l: "Réseau", kind: "select", opts: o("LinkedIn", "Instagram", "TikTok", "YouTube") },
      { k: "pillar", l: "Pilier", kind: "select", opts: o("Conseil pratique", "Expertise", "Offre", "Coulisses") },
      { k: "status", l: "Statut", kind: "select", opts: POST_STATUS },
    ],
  },
  obligation: {
    title: "Nouvelle obligation",
    defaults: () => ({ title: "", category: "Administratif", due: "", note: "" }),
    fields: [
      { k: "title", l: "Obligation *", kind: "text", full: true, required: true },
      { k: "category", l: "Catégorie", kind: "select", opts: o("Création", "Administratif", "Finance", "Fiscal", "Social", "Facturation", "RGPD", "Sécurité interne", "Assurance", "Site web") },
      { k: "due", l: "Échéance", kind: "date" },
      { k: "note", l: "Note", kind: "area" },
    ],
  },
  rgpd: {
    title: "Traitement du registre RGPD",
    defaults: () => ({ name: "", purpose: "", basis: "Intérêt légitime", data: "", keep: "", status: "a_valider" }),
    fields: [
      { k: "name", l: "Traitement *", kind: "text", full: true, required: true },
      { k: "purpose", l: "Finalité", kind: "text", full: true },
      { k: "basis", l: "Base légale", kind: "select", opts: o("Intérêt légitime", "Contrat", "Obligation légale", "Consentement", "Contrat et obligation légale", "Contrat (sous-traitant du client)") },
      { k: "status", l: "Statut", kind: "select", opts: RGPD_STATUS },
      { k: "data", l: "Données traitées", kind: "text", full: true },
      { k: "keep", l: "Durée de conservation", kind: "text", full: true },
    ],
  },
};
