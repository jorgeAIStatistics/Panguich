const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const BagIcon = () => (
  <svg {...base}>
    <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const PinIcon = () => (
  <svg {...base}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z" />
    <circle cx="12" cy="9.500" r="2.500" />
  </svg>
);
export const PhoneIcon = () => (
  <svg {...base}>
    <path d="M6 3h3l2 5-2.500 1.500a11 11 0 0 0 6 6L16 13l5 2v3a3 3 0 0 1-3 3A15 15 0 0 1 3 6a3 3 0 0 1 3-3z" />
  </svg>
);
export const ScooterIcon = () => (
  <svg {...base}>
    <circle cx="6" cy="17" r="2.500" />
    <circle cx="18" cy="17" r="2.500" />
    <path d="M8.500 17h7M15.500 17l-2-9h-3M17 8h2.500" />
  </svg>
);
export const PlatterIcon = () => (
  <svg {...base}>
    <path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 9V7M10 7h4" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="6.500" />
    <path d="m20 20-4.200-4.200" />
  </svg>
);
export const ArrowIcon = () => (
  <svg {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
