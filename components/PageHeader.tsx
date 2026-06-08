interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

/** Section page header — large white title, muted subtitle (blueprint §4). */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2.5">
        <span
          className="h-5 w-0.5 rounded-full bg-[color:var(--color-hud)]"
          style={{ boxShadow: "0 0 8px var(--color-hud)" }}
        />
        <h1 className="section-heading">{title}</h1>
      </div>
      {subtitle ? <p className="body-copy mt-1.5 pl-[14px]">{subtitle}</p> : null}
    </header>
  );
}
