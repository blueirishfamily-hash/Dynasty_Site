import ThemeToggle from "../ThemeToggle";

export default function ThemeToggleExample() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Toggle theme:</span>
      <ThemeToggle />
    </div>
  );
}
