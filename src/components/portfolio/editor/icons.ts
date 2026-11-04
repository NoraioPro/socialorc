import {
  Briefcase, Columns2, Heading, Image, LayoutGrid, Link2, Mail, Minus, Monitor, MoveVertical, PanelTop, RectangleHorizontal,
  Rows3, Smartphone, SquareDashed, Tablet, Tags, Type, IdCard, type LucideIcon,
} from "lucide-react";
import type { NodeType, Viewport } from "@/lib/portfolio/types";

export const COMPONENT_ICON: Record<NodeType, LucideIcon> = {
  section: PanelTop, container: SquareDashed, stack: Rows3, grid: LayoutGrid, column: Columns2, spacer: MoveVertical, divider: Minus,
  heading: Heading, text: Type, button: RectangleHorizontal, image: Image,
  project: IdCard, experience: Briefcase, skills: Tags, social: Link2, contact: Mail,
};

export const VIEWPORT_ICON: Record<Viewport, LucideIcon> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };
