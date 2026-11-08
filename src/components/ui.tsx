import Link from "next/link";
import type { Tone } from "@/lib/constants";
import { Icon, type IconName } from "./icon";

export function Badge({ tone, children, dot = true }: { tone: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`pill tone-${tone}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted-fg hover:text-fg">
            <Icon name="chevL" size={14} />
            {back.label}
          </Link>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-fg">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions }: { children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }) {
  return (
    <section className={`card rise ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, sub, tone, href, icon }: { label: string; value: string; sub?: string; tone?: Tone; href?: string; icon?: IconName }) {
  const inner = (
    <div className={`card rise flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-[var(--shadow-hover)] ${tone === "ko" ? "border-[var(--ko-fg)]" : ""}`}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-fg">
            <Icon name={icon} />
          </span>
        )}
        <span className="text-[13px] text-muted-fg">{label}</span>
      </div>
      <span className="num text-[26px] font-semibold leading-none tracking-tight">{value}</span>
      {sub && <span className={`text-xs ${tone === "ko" ? "text-ko" : "text-subtle-fg"}`}>{sub}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <span className="text-sm font-medium">{title}</span>
      {text && <span className="max-w-md text-[13px] text-muted-fg">{text}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Avatar({ text, tone = "info", size = 28 }: { text: string; tone?: Tone; size?: number }) {
  return (
    <span className={`tone-${tone} grid shrink-0 place-items-center rounded-lg text-[11px] font-semibold`} style={{ width: size, height: size }}>
      {text}
    </span>
  );
}

const TONES: Tone[] = ["info", "warn", "ok", "neu"];
export function toneFor(id: string): Tone {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
