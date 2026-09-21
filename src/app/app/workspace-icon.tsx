import type { SVGProps } from "react";

export type WorkspaceIconName =
  | "activity"
  | "admin"
  | "calendar"
  | "daily"
  | "home"
  | "identities"
  | "logout"
  | "moon"
  | "plus"
  | "register"
  | "summary"
  | "sun";

type Props = Readonly<SVGProps<SVGSVGElement> & { name: WorkspaceIconName }>;

export function WorkspaceIcon({ name, ...props }: Props) {
  const common = {
    "aria-hidden": true,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  const paths: Record<WorkspaceIconName, React.ReactNode> = {
    activity: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 1.9"/></>,
    admin: <><path d="m12 3 8 9-8 9-8-9 8-9Z"/><path d="m8.5 12 3.5-4 3.5 4-3.5 4-3.5-4Z"/></>,
    calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M3.5 10h17"/></>,
    daily: <><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m7.5 15 3-3 2.5 2 3.5-5"/></>,
    home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
    identities: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 14c3.5-.5 5.6 1.2 6.5 4.5"/></>,
    logout: <><path d="M10 4H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H10"/><path d="m14 8 4 4-4 4M8 12h10"/></>,
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>,
    plus: <><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></>,
    register: <><path d="M7 3.5h8l3 3V20.5H7z"/><path d="M15 3.5v4h3M10 11h5M10 14.5h5M10 18h3"/></>,
    summary: <><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 15 4-5M6.5 16.5h.01M17.5 16.5h.01"/></>,
    sun: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>,
  };

  return <svg {...common} {...props}>{paths[name]}</svg>;
}
