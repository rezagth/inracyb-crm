import { Icon } from "@/components/icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="card w-full max-w-[420px] p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-fg">
            <Icon name="shield" size={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold">InfraCyb CRM</span>
            <span className="text-xs text-subtle-fg">Gestion d&apos;entreprise</span>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
