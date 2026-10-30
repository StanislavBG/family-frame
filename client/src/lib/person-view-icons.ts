import { Activity, Baby, BookOpen, GraduationCap, Heart, House, Leaf, Mail, Moon, Music, Sparkles, Star, Sun, Trophy, Utensils, type LucideIcon } from "lucide-react";
import type { PersonViewIcon } from "@shared/person-views";

// Typed by PersonViewIcon so a schema icon without a glyph fails tsc.
export const VIEW_ICONS: Record<PersonViewIcon, LucideIcon> = {
  star: Star,
  heart: Heart,
  book: BookOpen,
  music: Music,
  trophy: Trophy,
  leaf: Leaf,
  sun: Sun,
  moon: Moon,
  activity: Activity,
  utensils: Utensils,
  "graduation-cap": GraduationCap,
  baby: Baby,
  home: House,
  sparkles: Sparkles,
  mail: Mail,
};

export function viewIcon(name: string | undefined): LucideIcon {
  return name !== undefined && Object.hasOwn(VIEW_ICONS, name) ? VIEW_ICONS[name as PersonViewIcon] : Sparkles;
}
