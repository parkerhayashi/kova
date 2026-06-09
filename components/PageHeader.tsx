interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

/** Section page header — Coach-style title + optional eyebrow rule. */
export function PageHeader({ title, subtitle, eyebrow }: PageHeaderProps) {
  return (
    <header className="mb-6">
      {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
      <h1 className="section-heading">{title}</h1>
      {subtitle ? <p className="body-copy mt-1.5">{subtitle}</p> : null}
    </header>
  );
}
