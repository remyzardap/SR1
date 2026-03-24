import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  onCtaClick?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-center">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
          {description}
        </p>
        {onCtaClick ? (
          <Button className="mt-4" onClick={onCtaClick}>
            {ctaLabel}
          </Button>
        ) : (
          <Link href={ctaHref}>
            <Button className="mt-4">{ctaLabel}</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
