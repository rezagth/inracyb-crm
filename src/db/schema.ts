/**
 * InfraCyb CRM — modèle de données (lot 1).
 * Montants en centimes (entiers) pour éviter les erreurs d'arrondi.
 * Dates « métier » (émission, échéance…) au format AAAA-MM-JJ ; horodatages en millisecondes.
 */
import { pgTable, text, integer, doublePrecision, boolean, timestamp, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "../lib/ids";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { mode: "date", withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Paramètres de l'entreprise : une seule ligne (id = 1). Valeurs réglementaires à vérifier. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  tradeName: text("trade_name").notNull().default("InfraCyb"),
  legalName: text("legal_name").notNull().default(""),
  legalForm: text("legal_form").notNull().default("Entrepreneur individuel (micro-entreprise)"),
  siret: text("siret").notNull().default(""),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default("infracyb@gmail.com"),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default("infracyb.fr"),
  iban: text("iban").notNull().default(""),
  payLink: text("pay_link").notNull().default(""),
  calUrl: text("cal_url").notNull().default(""),
  tvaFranchise: boolean("tva_franchise").notNull().default(true),
  socialRate: doublePrecision("social_rate").notNull().default(26.1),
  acre: boolean("acre").notNull().default(true),
  acreRate: doublePrecision("acre_rate").notNull().default(25),
  cfpRate: doublePrecision("cfp_rate").notNull().default(0.2),
  vlEnabled: boolean("vl_enabled").notNull().default(false),
  vlRate: doublePrecision("vl_rate").notNull().default(2.2),
  caCeilingCents: integer("ca_ceiling_cents").notNull().default(7_770_000),
  tvaThresholdCents: integer("tva_threshold_cents").notNull().default(3_750_000),
  invoicePrefix: text("invoice_prefix").notNull().default("F"),
  quotePrefix: text("quote_prefix").notNull().default("D"),
  creditPrefix: text("credit_prefix").notNull().default("AV"),
  payDays: integer("pay_days").notNull().default(30),
  payMethod: text("pay_method").notNull().default("Virement bancaire"),
  latePenalty: text("late_penalty").notNull().default("3 fois le taux d'intérêt légal"),
  tjmCents: integer("tjm_cents").notNull().default(0),
  goalCaCents: integer("goal_ca_cents").notNull().default(0),
  /* Profil de prospection : sert à personnaliser les scripts et les mails. */
  iaBrand: text("ia_brand").notNull().default("Elyrion Labs"),
  city: text("city").notNull().default(""),
  prixAuditCents: integer("prix_audit_cents").notNull().default(0),
  offers: text("offers").notNull().default("audit,ciso,ia"),
  targetSectors: text("target_sectors").notNull().default("Juridique,Notariat,Santé,Expertise comptable"),
  goalCalls: integer("goal_calls").notNull().default(20),
  goalMails: integer("goal_mails").notNull().default(10),
  goalRdv: integer("goal_rdv").notNull().default(3),
  goalMrrCents: integer("goal_mrr_cents").notNull().default(0),
  goalClients: integer("goal_clients").notNull().default(0),
  goalNetCents: integer("goal_net_cents").notNull().default(0),
  avgAuditCents: integer("avg_audit_cents").notNull().default(320_000),
  avgRssiCents: integer("avg_rssi_cents").notNull().default(103_300),
  urssafPeriod: text("urssaf_period").notNull().default("mensuelle"),
  bankName: text("bank_name").notNull().default(""),
  einvoicePlatform: text("einvoice_platform").notNull().default(""),
  esignProvider: text("esign_provider").notNull().default(""),
  onboardedAt: timestamp("onboarded_at", { mode: "date", withTimezone: true }),
  updatedAt: updatedAt(),
});

/** Compteurs de numérotation continue, par type et par année (ex. « invoice-2026 »). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    sector: text("sector").notNull().default("Autres"),
    stage: text("stage").notNull().default("qualif"),
    amountCents: integer("amount_cents").notNull().default(0),
    source: text("source").notNull().default("Site web"),
    city: text("city").notNull().default(""),
    address: text("address").notNull().default(""),
    siren: text("siren").notNull().default(""),
    priority: text("priority").notNull().default("moyenne"),
    offer: text("offer").notNull().default("Audit"),
    notes: text("notes").notNull().default(""),
    lastContact: text("last_contact"),
    /** Partenaire (prescripteur) qui a recommandé cette entreprise ; null sinon. */
    referredBy: text("referred_by").references((): AnyPgColumn => partners.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("companies_stage_idx").on(t.stage), index("companies_name_idx").on(t.name), index("companies_referred_by_idx").on(t.referredBy)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    role: text("role").notNull().default(""),
    email: text("email").notNull().default(""),
    /** Origine de l'adresse : saisie | site | historique | "" (inconnue : aucun envoi). */
    emailSource: text("email_source").notNull().default(""),
    phone: text("phone").notNull().default(""),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_company_idx").on(t.companyId)],
);

/** Journal d'activité : call | mail | note | quote | invoice | payment | stage | create | task */
export const events = pgTable(
  "events",
  {
    id: id(),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_company_idx").on(t.companyId, t.createdAt), index("events_created_idx").on(t.createdAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    dueDate: text("due_date").notNull(),
    priority: text("priority").notNull().default("moyenne"),
    /** « appel » : tâche de la file d'appels du jour (page Appels) ; vide pour une tâche ordinaire. */
    kind: text("kind").notNull().default(""),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_due_idx").on(t.done, t.dueDate)],
);

export const catalogItems = pgTable("catalog_items", {
  id: id(),
  name: text("name").notNull(),
  offer: text("offer").notNull().default("Audit"),
  unit: text("unit").notNull().default("forfait"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Devis : brouillon | envoye | accepte | refuse */
export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    number: text("number").notNull(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("brouillon"),
    issueDate: text("issue_date").notNull(),
    validUntil: text("valid_until").notNull(),
    discountBp: integer("discount_bp").notNull().default(0),
    note: text("note").notNull().default(""),
    totalHtCents: integer("total_ht_cents").notNull().default(0),
    signedBy: text("signed_by"),
    signedAt: timestamp("signed_at", { mode: "date", withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("quotes_number_uq").on(t.number), index("quotes_company_idx").on(t.companyId), index("quotes_status_idx").on(t.status)],
);

export const quoteLines = pgTable("quote_lines", {
  id: id(),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull().default("forfait"),
  unitPriceCents: integer("unit_price_cents").notNull(),
});

/** Factures et avoirs. Facture : brouillon | envoyee | payee | annulee. Avoir : emis. */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    number: text("number").notNull(),
    kind: text("kind").notNull().default("facture"),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("brouillon"),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    discountBp: integer("discount_bp").notNull().default(0),
    note: text("note").notNull().default(""),
    totalHtCents: integer("total_ht_cents").notNull().default(0),
    quoteId: text("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    creditForId: text("credit_for_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("invoices_number_uq").on(t.number), index("invoices_company_idx").on(t.companyId), index("invoices_status_idx").on(t.status, t.dueDate)],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").notNull().default("forfait"),
  unitPriceCents: integer("unit_price_cents").notNull(),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull().default("Virement bancaire"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_date_idx").on(t.date)],
);

export const reminders = pgTable("reminders", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  sentAt: createdAt(),
});

/* =========================== Lots 2 à 6 =========================== */
const coRef = () => text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" });

/** Journal d'appels. result : Joint | RDV obtenu | Messagerie | Pas de réponse */
export const calls = pgTable(
  "calls",
  { id: id(), companyId: coRef(), date: text("date").notNull(), result: text("result").notNull(), durationMin: integer("duration_min").notNull().default(0), offer: text("offer").notNull().default(""), note: text("note").notNull().default(""), createdAt: createdAt() },
  (t) => [index("calls_date_idx").on(t.date), index("calls_company_idx").on(t.companyId)],
);

/** Rendez-vous. mode : Visio | Téléphone | Sur place */
export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    date: text("date").notNull(),
    start: text("start").notNull().default("10:00"),
    end: text("end").notNull().default("10:30"),
    mode: text("mode").notNull().default("Visio"),
    location: text("location").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("meetings_date_idx").on(t.date)],
);

/** Mails de séquence marqués comme envoyés (offre : audit | ciso | ia ; étape 0 à 3). */
export const mailSends = pgTable(
  "mail_sends",
  { id: id(), companyId: coRef(), offer: text("offer").notNull(), step: integer("step").notNull(), subject: text("subject").notNull().default(""), sentOn: text("sent_on").notNull(), createdAt: createdAt() },
  (t) => [index("mail_sends_idx").on(t.companyId, t.offer)],
);

/** Campagnes d'envoi en masse : une offre (audit | ciso | ia | diagnostic), une séquence J0 / J+3 / J+7 / J+14, des entreprises. status : active | pause | terminee */
export const mailCampaigns = pgTable("mail_campaigns", {
  id: id(),
  name: text("name").notNull(),
  offer: text("offer").notNull(),
  /** Segment visé (campagnes diagnostic) : editeurs | cabinets ; "" pour les autres offres. Choisit le texte des mails et sert au bilan. */
  segment: text("segment").notNull().default(""),
  /** true : campagne permanente tenue par l'alimentation automatique (une par service et par segment). */
  auto: boolean("auto").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

/** Une entreprise dans une campagne. status : en_cours | termine | arrete (stopReason dit pourquoi). nextDue = date du prochain mail. */
export const mailCampaignItems = pgTable(
  "mail_campaign_items",
  {
    id: id(),
    campaignId: text("campaign_id").notNull().references(() => mailCampaigns.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    nextStep: integer("next_step").notNull().default(0),
    nextDue: text("next_due").notNull(),
    status: text("status").notNull().default("en_cours"),
    stopReason: text("stop_reason").notNull().default(""),
    lastError: text("last_error").notNull().default(""),
    /** Diagnostic : forme du constat cité dans le premier mail (« dmarc-absent »…). Les relances parlent du même constat. */
    hook: text("hook").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("mail_campaign_items_uq").on(t.campaignId, t.companyId),
    index("mail_campaign_items_due_idx").on(t.status, t.nextDue),
    // Une seule séquence en cours par entreprise, toutes campagnes et tous services confondus.
    uniqueIndex("mail_campaign_items_active_uq").on(t.companyId).where(sql`${t.status} = 'en_cours'`),
  ],
);

/** Adresses qui ne veulent plus être contactées (en minuscules). Aucun envoi de campagne n'est fait vers elles. */
export const mailOptouts = pgTable("mail_optouts", {
  id: id(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("lien"),
  createdAt: createdAt(),
});

/** Événements de délivrabilité reçus de Brevo (rebond, plainte spam, blocage, adresse invalide, désinscription). */
export const mailEvents = pgTable(
  "mail_events",
  {
    id: id(),
    email: text("email").notNull(),
    type: text("type").notNull(),
    detail: text("detail").notNull().default(""),
    /** Service concerné (audit | diagnostic), d'après les tags de l'envoi ; "" si inconnu. */
    service: text("service").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("mail_events_email_idx").on(t.email), index("mail_events_type_idx").on(t.type, t.createdAt)],
);

/**
 * Diagnostic passif du domaine d'une entreprise (données publiques). status : a_faire | fait | sans_domaine | erreur.
 * findings : constats structurés en JSON (statut, certitude, preuve, formulation prudente). Aucun score.
 */
export const companyDiagnostics = pgTable(
  "company_diagnostics",
  {
    id: id(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("a_faire"),
    mailDomain: text("mail_domain").notNull().default(""),
    webHost: text("web_host").notNull().default(""),
    findings: text("findings").notNull().default("[]"),
    /** id du constat principal ("" s'il n'y a aucun constat certain) */
    mainFinding: text("main_finding").notNull().default(""),
    certainCount: integer("certain_count").notNull().default(0),
    rulesVersion: text("rules_version").notNull().default(""),
    checkedOn: text("checked_on").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("company_diagnostics_company_idx").on(t.companyId, t.createdAt), index("company_diagnostics_status_idx").on(t.status)],
);

/** Réglages de l'alimentation automatique (une seule ligne, id = 1). Arrêtée tant que tu ne l'as pas mise en marche. */
export const feedSettings = pgTable("feed_settings", {
  id: integer("id").primaryKey(),
  /** interrupteur global */
  enabled: boolean("enabled").notNull().default(false),
  /** services alimentés : le diagnostic par défaut ; l'audit seulement si tu l'actives */
  feedDiagnostic: boolean("feed_diagnostic").notNull().default(true),
  feedAudit: boolean("feed_audit").notNull().default(false),
  /** cabinets réservés (experts-comptables, avocats, notaires…) trouvés par la recherche : inscrits dans la campagne Prescripteurs */
  feedPrescripteur: boolean("feed_prescripteur").notNull().default(false),
  /** départements ciblés, séparés par des virgules ("" = France entière) */
  departements: text("departements").notNull().default(""),
  /** tranches d'effectif ciblées (codes Insee, séparés par des virgules) */
  effectifs: text("effectifs").notNull().default("02,03,11,12"),
  /** entreprises importées au plus par jour et par segment */
  importPerSegment: integer("import_per_segment").notNull().default(30),
  /** requêtes Google Places au plus par jour */
  placesDaily: integer("places_daily").notNull().default(30),
  placesDay: text("places_day").notNull().default(""),
  placesUsed: integer("places_used").notNull().default(0),
  /** où la recherche de chaque segment s'est arrêtée (JSON) */
  cursors: text("cursors").notNull().default("{}"),
});

/** Parcours d'une entreprise importée par l'alimentation. stage : a_completer | a_diagnostiquer | a_inscrire | inscrit | ecarte. */
export const feedItems = pgTable(
  "feed_items",
  {
    id: id(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    segment: text("segment").notNull(),
    stage: text("stage").notNull().default("a_completer"),
    /** pourquoi l'entreprise est écartée ou attend */
    reason: text("reason").notNull().default(""),
    /** service de la campagne où elle est inscrite */
    service: text("service").notNull().default(""),
    tries: integer("tries").notNull().default(0),
    importedOn: text("imported_on").notNull(),
    /** dernier changement d'étape (AAAA-MM-JJ) */
    movedOn: text("moved_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("feed_items_company_uq").on(t.companyId), index("feed_items_stage_idx").on(t.stage, t.segment)],
);

/** Journal des passages de l'alimentation automatique. */
/**
 * Candidats de l'Annuaire écartés AVANT d'entrer dans le CRM : adresse mail ou téléphone introuvable, site absent ou illisible.
 * Ils ne sont jamais revérifiés (ni requête Google Places, ni lecture du site) et n'apparaissent que dans la page Alimentation.
 */
export const feedSkipped = pgTable(
  "feed_skipped",
  {
    siren: text("siren").primaryKey(),
    name: text("name").notNull(),
    segment: text("segment").notNull(),
    reason: text("reason").notNull(),
    /** date de l'écart (AAAA-MM-JJ) */
    skippedOn: text("skipped_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("feed_skipped_on_idx").on(t.skippedOn)],
);

export const feedRuns = pgTable("feed_runs", {
  id: id(),
  source: text("source").notNull().default("cron"),
  ok: boolean("ok").notNull().default(true),
  found: integer("found").notNull().default(0),
  imported: integer("imported").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  diagnosed: integer("diagnosed").notNull().default(0),
  enrolled: integer("enrolled").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  message: text("message").notNull().default(""),
  createdAt: createdAt(),
});

/** État d'un service d'envoi (audit | diagnostic) : en pause automatique ou non, pourquoi, et depuis quand (la reprise remet le compteur de santé à zéro). */
export const mailServiceState = pgTable("mail_service_state", {
  service: text("service").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  reason: text("reason").notNull().default(""),
  changedAt: timestamp("changed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  /** Diagnostic : jour (AAAA-MM-JJ) où la montée au-delà de 10 par jour a commencé (domaine d'envoi strict) ; "" sinon. */
  rampFrom: text("ramp_from").notNull().default(""),
});

/** Journal des déclenchements de campagne (quotidien automatique ou manuel) : permet de voir un échec sans ouvrir les logs Vercel. */
export const mailRuns = pgTable("mail_runs", {
  id: id(),
  source: text("source").notNull().default("cron"),
  ok: boolean("ok").notNull().default(true),
  sent: integer("sent").notNull().default(0),
  stopped: integer("stopped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  waiting: integer("waiting").notNull().default(0),
  message: text("message").notNull().default(""),
  createdAt: createdAt(),
});

export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Partenaire (j'oriente)"),
  specialty: text("specialty").notNull().default(""),
  contact: text("contact").notNull().default(""),
  commission: text("commission").notNull().default(""),
  status: text("status").notNull().default("a_contacter"),
  leads: integer("leads").notNull().default(0),
  /** Fiche du cabinet dans le CRM (prescripteur devenu partenaire) ; null pour un partenaire saisi à la main. */
  companyId: text("company_id").references((): AnyPgColumn => companies.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Contrats récurrents. status : brouillon | actif | termine */
export const contracts = pgTable("contracts", {
  id: id(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "restrict" }),
  offer: text("offer").notNull().default("RSSI externalisé"),
  monthlyCents: integer("monthly_cents").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull().default(""),
  notice: text("notice").notNull().default("2 mois"),
  status: text("status").notNull().default("actif"),
  createdAt: createdAt(),
});

/** Une ligne par contrat et par mois facturé : empêche la double facturation. */
export const contractBillings = pgTable(
  "contract_billings",
  {
    id: id(),
    contractId: text("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("contract_billings_uq").on(t.contractId, t.month)],
);

/** Missions. status : a_demarrer | en_cours | livree | cloturee */
export const missions = pgTable("missions", {
  id: id(),
  companyId: coRef(),
  title: text("title").notNull(),
  offer: text("offer").notNull().default("Audit"),
  start: text("start").notNull(),
  due: text("due").notNull(),
  budgetDays: doublePrecision("budget_days").notNull().default(0),
  status: text("status").notNull().default("a_demarrer"),
  createdAt: createdAt(),
});

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    date: text("date").notNull(),
    missionId: text("mission_id").references(() => missions.id, { onDelete: "set null" }),
    hours: doublePrecision("hours").notNull(),
    billable: boolean("billable").notNull().default(true),
    description: text("description").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("time_date_idx").on(t.date)],
);

/** Tickets de support. priority : haute | normale | basse ; status : ouvert | en_cours | resolu */
export const tickets = pgTable("tickets", {
  id: id(),
  companyId: coRef(),
  subject: text("subject").notNull(),
  description: text("description").notNull().default(""),
  priority: text("priority").notNull().default("normale"),
  status: text("status").notNull().default("ouvert"),
  openedOn: text("opened_on").notNull(),
  resolvedOn: text("resolved_on"),
  createdAt: createdAt(),
});

/** Plan d'action sécurité d'un client. status : a_faire | en_cours | fait */
export const securityActions = pgTable("security_actions", {
  id: id(),
  companyId: coRef(),
  title: text("title").notNull(),
  priority: text("priority").notNull().default("moyenne"),
  owner: text("owner").notNull().default("Moi"),
  due: text("due").notNull().default(""),
  status: text("status").notNull().default("a_faire"),
  auditId: text("audit_id"),
  createdAt: createdAt(),
});

/** Audits cyber : réponses par point (oui | partiel | non | na), en JSON. */
export const audits = pgTable("audits", {
  id: id(),
  companyId: coRef(),
  date: text("date").notNull(),
  status: text("status").notNull().default("en_cours"),
  answers: text("answers").notNull().default("{}"),
  notes: text("notes").notNull().default("{}"),
  createdAt: createdAt(),
});

export const incidents = pgTable("incidents", {
  id: id(),
  companyId: coRef(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("Phishing"),
  severity: text("severity").notNull().default("moyenne"),
  status: text("status").notNull().default("ouvert"),
  personalData: text("personal_data").notNull().default("non"),
  actions: text("actions").notNull().default(""),
  createdAt: createdAt(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    date: text("date").notNull(),
    supplier: text("supplier").notNull(),
    category: text("category").notNull().default("Autre"),
    amountCents: integer("amount_cents").notNull(),
    recurring: text("recurring").notNull().default("Non"),
    proof: boolean("proof").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_date_idx").on(t.date)],
);

/** Lignes de relevé bancaire importées. status : a_rapprocher | rapproche | ignore */
export const bankLines = pgTable("bank_lines", {
  id: id(),
  date: text("date").notNull(),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("a_rapprocher"),
  invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  hash: text("hash").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("bank_lines_hash_uq").on(t.hash)]);

/** Documents et modèles. status : a_rediger | brouillon | a_relire | valide | signe */
export const documents = pgTable("documents", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Modèle"),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  status: text("status").notNull().default("a_rediger"),
  body: text("body").notNull().default(""),
  updatedOn: text("updated_on").notNull(),
  createdAt: createdAt(),
});

export const kbArticles = pgTable("kb_articles", {
  id: id(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Procédure"),
  body: text("body").notNull().default(""),
  updatedOn: text("updated_on").notNull(),
  createdAt: createdAt(),
});

/** Calendrier éditorial. status : idee | redige | programme | publie */
export const posts = pgTable("posts", {
  id: id(),
  date: text("date").notNull(),
  network: text("network").notNull().default("LinkedIn"),
  topic: text("topic").notNull(),
  pillar: text("pillar").notNull().default("Conseil pratique"),
  status: text("status").notNull().default("idee"),
  createdAt: createdAt(),
});

export const obligations = pgTable("obligations", {
  id: id(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Administratif"),
  due: text("due").notNull().default(""),
  done: boolean("done").notNull().default(false),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const rgpdRecords = pgTable("rgpd_records", {
  id: id(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  basis: text("basis").notNull().default(""),
  data: text("data").notNull().default(""),
  keep: text("keep").notNull().default(""),
  status: text("status").notNull().default("a_valider"),
  createdAt: createdAt(),
});

/** Automatisations activables (clé fixe). */
export const automations = pgTable("automations", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  runs: integer("runs").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { mode: "date", withTimezone: true }),
});

export const savedReports = pgTable("saved_reports", { id: id(), name: text("name").notNull(), config: text("config").notNull(), createdAt: createdAt() });

export const favorites = pgTable("favorites", { id: id(), label: text("label").notNull(), href: text("href").notNull(), position: integer("position").notNull().default(0), createdAt: createdAt() });

/* ---------- relations ---------- */
export const companiesRelations = relations(companies, ({ one, many }) => ({
  /** Partenaire qui a recommandé l'entreprise. */
  referrer: one(partners, { fields: [companies.referredBy], references: [partners.id], relationName: "referral" }),
  /** Fiches Partenaire reliées à ce cabinet. */
  partnerOf: many(partners, { relationName: "partnerCompany" }),
  contacts: many(contacts),
  events: many(events),
  tasks: many(tasks),
  quotes: many(quotes),
  invoices: many(invoices),
  calls: many(calls),
  meetings: many(meetings),
  contracts: many(contracts),
  missions: many(missions),
  tickets: many(tickets),
  securityActions: many(securityActions),
  audits: many(audits),
  incidents: many(incidents),
  documents: many(documents),
}));
export const contactsRelations = relations(contacts, ({ one }) => ({ company: one(companies, { fields: [contacts.companyId], references: [companies.id] }) }));
export const eventsRelations = relations(events, ({ one }) => ({ company: one(companies, { fields: [events.companyId], references: [companies.id] }) }));
export const tasksRelations = relations(tasks, ({ one }) => ({ company: one(companies, { fields: [tasks.companyId], references: [companies.id] }) }));
export const quotesRelations = relations(quotes, ({ one, many }) => ({
  company: one(companies, { fields: [quotes.companyId], references: [companies.id] }),
  lines: many(quoteLines),
  invoices: many(invoices),
}));
export const quoteLinesRelations = relations(quoteLines, ({ one }) => ({ quote: one(quotes, { fields: [quoteLines.quoteId], references: [quotes.id] }) }));
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, { fields: [invoices.companyId], references: [companies.id] }),
  quote: one(quotes, { fields: [invoices.quoteId], references: [quotes.id] }),
  lines: many(invoiceLines),
  payments: many(payments),
  reminders: many(reminders),
}));
export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({ invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }) }));
export const paymentsRelations = relations(payments, ({ one }) => ({ invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }) }));
export const remindersRelations = relations(reminders, ({ one }) => ({ invoice: one(invoices, { fields: [reminders.invoiceId], references: [invoices.id] }) }));

export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type CatalogItem = typeof catalogItems.$inferSelect;

export const callsRelations = relations(calls, ({ one }) => ({ company: one(companies, { fields: [calls.companyId], references: [companies.id] }) }));
export const meetingsRelations = relations(meetings, ({ one }) => ({ company: one(companies, { fields: [meetings.companyId], references: [companies.id] }) }));
export const contractsRelations = relations(contracts, ({ one, many }) => ({ company: one(companies, { fields: [contracts.companyId], references: [companies.id] }), billings: many(contractBillings) }));
export const contractBillingsRelations = relations(contractBillings, ({ one }) => ({ contract: one(contracts, { fields: [contractBillings.contractId], references: [contracts.id] }) }));
export const missionsRelations = relations(missions, ({ one, many }) => ({ company: one(companies, { fields: [missions.companyId], references: [companies.id] }), times: many(timeEntries) }));
export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({ mission: one(missions, { fields: [timeEntries.missionId], references: [missions.id] }) }));
export const ticketsRelations = relations(tickets, ({ one }) => ({ company: one(companies, { fields: [tickets.companyId], references: [companies.id] }) }));
export const securityActionsRelations = relations(securityActions, ({ one }) => ({ company: one(companies, { fields: [securityActions.companyId], references: [companies.id] }) }));
export const auditsRelations = relations(audits, ({ one }) => ({ company: one(companies, { fields: [audits.companyId], references: [companies.id] }) }));
export const incidentsRelations = relations(incidents, ({ one }) => ({ company: one(companies, { fields: [incidents.companyId], references: [companies.id] }) }));
export const documentsRelations = relations(documents, ({ one }) => ({ company: one(companies, { fields: [documents.companyId], references: [companies.id] }) }));
export const bankLinesRelations = relations(bankLines, ({ one }) => ({ invoice: one(invoices, { fields: [bankLines.invoiceId], references: [invoices.id] }) }));
export const partnersRelations = relations(partners, ({ one, many }) => ({
  company: one(companies, { fields: [partners.companyId], references: [companies.id], relationName: "partnerCompany" }),
  referrals: many(companies, { relationName: "referral" }),
}));
