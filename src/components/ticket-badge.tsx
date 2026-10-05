import { Badge } from "./ui/badge";

interface TicketBadgeProps {
  ticketId?: string | null;
  showPending?: boolean;
  className?: string;
}

export function TicketBadge({
  ticketId,
  showPending = false,
  className = "",
}: TicketBadgeProps) {
  if (!ticketId && !showPending) return null;

  return (
    <Badge
      variant="outline"
      className={`border-primary/30 bg-primary/10 font-mono text-[11px] tracking-normal text-primary    ${className}`}
    >
      Ticket ID: {ticketId || "Pending"}
    </Badge>
  );
}
