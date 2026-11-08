import { createCompanyAction } from "@/server/actions/companies";
import { Card, PageHeader } from "@/components/ui";
import { CompanyForm } from "../company-form";

export const metadata = { title: "Nouvelle entreprise" };

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader title="Nouvelle entreprise" back={{ href: "/entreprises", label: "Entreprises" }} />
      <Card className="max-w-[920px] p-6">
        <CompanyForm action={createCompanyAction} withContact />
      </Card>
    </>
  );
}
