interface AgencySupportBlockProps {
  className?: string;
  id?: string;
}

export function AgencySupportBlock({className = "", id}: AgencySupportBlockProps) {
  const classes = `lead-footer lead-footer-light ${className}`.trim();

  return (
    <section id={id} className={classes}>
      <p className="section-eyebrow section-eyebrow-light">Agency Support</p>
      <h2>Want us to implement AEO improvements?</h2>
      <p>
        Submit your request and our team will help deploy fixes that improve your visibility in ChatGPT and other LLM experiences.
      </p>
      <a className="cta-nav final-cta-button" href="https://moads.agency/#form" target="_blank" rel="noreferrer">
        Submit request
      </a>
    </section>
  );
}
