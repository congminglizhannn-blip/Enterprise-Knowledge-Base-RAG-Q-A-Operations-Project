type SpinnerProps = {
  label?: string;
  className?: string;
};

export function Spinner({ label = "加载中", className = "" }: SpinnerProps) {
  return (
    <span className={`spinner ${className}`} role="status" aria-label={label}>
      {label}
    </span>
  );
}
