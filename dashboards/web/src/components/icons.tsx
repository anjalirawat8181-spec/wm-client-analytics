const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconOverview = () => (
  <svg {...base}>
    <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
  </svg>
);
export const IconClients = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 0 0 0-6M21 20c0-2.5-1.6-4.6-4-5.5" />
  </svg>
);
export const IconAdvisors = () => (
  <svg {...base}>
    <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />
  </svg>
);
export const IconQuality = () => (
  <svg {...base}>
    <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" />
    <path d="M8.5 12l2.4 2.4L15.5 10" />
  </svg>
);
export const IconMethod = () => (
  <svg {...base}>
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M5 17a3 3 0 0 1 3-3h11" />
  </svg>
);
export const IconSun = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </svg>
);
export const IconMoon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />
  </svg>
);
export const IconDownload = () => (
  <svg {...base} width={16} height={16}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </svg>
);
