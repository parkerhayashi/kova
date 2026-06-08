interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

/** Section page header — large white title, muted subtitle (blueprint §4). */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="section-heading">{title}</h1>
      {subtitle ? <p className="body-copy mt-1">{subtitle}</p> : null}
    </header>
  );
}
