import {
  Award,
  BookCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Film,
  Flame,
  Globe,
  Laugh,
  Medal,
  MessageCircle,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Tv,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Keys are the `icon` names used in server/achievements/categories/*.ts.
// icons.test.ts fails when a definition uses a name missing here.
export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Award,
  BookCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Film,
  Flame,
  Globe,
  Laugh,
  Medal,
  MessageCircle,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Tv,
  UserPlus,
  Zap,
};

export function BadgeIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const Icon = ACHIEVEMENT_ICONS[name] ?? Trophy;
  return <Icon size={size} aria-hidden="true" />;
}
