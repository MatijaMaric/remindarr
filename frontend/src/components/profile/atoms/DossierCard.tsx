import { Card } from "@/components/ui/card";

interface DossierCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

const PADDING_MAP = {
  sm: "p-3" as const,
  md: "p-4" as const,
  lg: "p-5" as const,
};

export function DossierCard({ children, className, padding = "md" }: DossierCardProps) {
  return (
    <Card padding="none" className={`${PADDING_MAP[padding]}${className ? ` ${className}` : ""}`}>
      {children}
    </Card>
  );
}
