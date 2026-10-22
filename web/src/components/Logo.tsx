export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M12 40H20L28 16H20Z M28 40H36L44 8H36Z" fill="#172C8F" />
      <path d="M4 8H12L20 40H12Z M20 16H28L36 40H28Z" fill="#2647D9" />
    </svg>
  );
}

export function Logo({ className = "h-7" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/wagefold-logo.svg" alt="Wagefold" className={className} />;
}
