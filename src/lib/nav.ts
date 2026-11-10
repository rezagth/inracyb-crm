import type { IconName } from "@/components/icon";

/** Navigation : mêmes groupes et même ordre que la maquette. */
export const NAV: { label: string; items: { key: string; href: string; label: string; icon: IconName }[] }[] = [
  {
    label: "Pilotage",
    items: [
      { key: "dashboard", href: "/", label: "Tableau de bord", icon: "p_dashboard" },
      { key: "rapports", href: "/rapports", label: "Rapports", icon: "p_rapports" },
      { key: "rentabilite", href: "/rentabilite", label: "Rentabilité", icon: "p_rentabilite" },
      { key: "activite", href: "/activite", label: "Activité", icon: "p_activite" },
    ],
  },
  {
    label: "Commercial",
    items: [
      { key: "prospection", href: "/prospection", label: "Prospection", icon: "p_prospection" },
      { key: "campagnes", href: "/campagnes", label: "Campagnes", icon: "p_prospection" },
      { key: "pipeline", href: "/pipeline", label: "Pipeline", icon: "p_pipeline" },
      { key: "entreprises", href: "/entreprises", label: "Entreprises", icon: "p_entreprises" },
      { key: "contacts", href: "/contacts", label: "Contacts", icon: "p_contacts" },
      { key: "appels", href: "/appels", label: "Appels", icon: "p_appels" },
      { key: "rdv", href: "/rdv", label: "Rendez-vous", icon: "p_rdv" },
      { key: "devis", href: "/devis", label: "Devis", icon: "p_devis" },
      { key: "partenaires", href: "/partenaires", label: "Partenaires", icon: "p_partenaires" },
    ],
  },
  {
    label: "Clients",
    items: [
      { key: "clients", href: "/clients", label: "Clients", icon: "p_clients" },
      { key: "contrats", href: "/contrats", label: "Contrats", icon: "p_contrats" },
      { key: "missions", href: "/missions", label: "Missions", icon: "p_missions" },
      { key: "audits", href: "/audits", label: "Audits", icon: "p_audits" },
      { key: "plans", href: "/plans", label: "Plans d'action", icon: "p_plans" },
      { key: "incidents", href: "/incidents", label: "Incidents", icon: "p_incidents" },
      { key: "temps", href: "/temps", label: "Temps", icon: "p_temps" },
      { key: "support", href: "/support", label: "Support", icon: "p_support" },
    ],
  },
  {
    label: "Finance",
    items: [
      { key: "factures", href: "/factures", label: "Factures", icon: "p_factures" },
      { key: "catalogue", href: "/catalogue", label: "Catalogue", icon: "p_catalogue" },
      { key: "depenses", href: "/depenses", label: "Dépenses", icon: "p_depenses" },
      { key: "tresorerie", href: "/tresorerie", label: "Trésorerie", icon: "p_tresorerie" },
    ],
  },
  {
    label: "Entreprise",
    items: [
      { key: "taches", href: "/taches", label: "Tâches", icon: "p_taches" },
      { key: "documents", href: "/documents", label: "Documents", icon: "p_documents" },
      { key: "savoir", href: "/savoir", label: "Base de connaissances", icon: "p_savoir" },
      { key: "marketing", href: "/marketing", label: "Marketing", icon: "p_marketing" },
      { key: "conformite", href: "/conformite", label: "Conformité", icon: "p_conformite" },
      { key: "integrations", href: "/integrations", label: "Intégrations", icon: "p_integrations" },
      { key: "automatisations", href: "/automatisations", label: "Automatisations", icon: "p_automatisations" },
      { key: "parametres", href: "/parametres", label: "Paramètres", icon: "p_parametres" },
    ],
  },
];

/** Pages déjà construites (les autres sont masquées tant qu'elles ne sont pas prêtes). */
export const BUILT = new Set(["dashboard", "prospection", "pipeline", "entreprises", "contacts", "appels", "rdv", "devis", "partenaires", "clients", "factures", "catalogue", "taches", "parametres", "contrats", "missions", "temps", "support", "plans", "audits", "incidents", "depenses", "tresorerie", "integrations", "documents", "savoir", "marketing", "conformite", "automatisations", "rapports", "rentabilite", "activite"]);
