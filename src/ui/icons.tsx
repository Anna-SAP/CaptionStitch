import type { JSX } from 'preact';

const paths = {
  plus: 'M12 5v14M5 12h14',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5 5 5M15 9.5h.01',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  record: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  share: 'M12 15V4M8 7.5L12 3.5l4 4M6 11H5v9h14v-9h-1',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  expand: 'M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4',
  collapse: 'M4 9h16M4 15h16M9 5l3 3 3-3M9 19l3-3 3 3',
  crop: 'M7 3v14h14M3 7h14v14',
  reset: 'M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 10.5v6M13.5 10.5v6',
  wand: 'M5 19L15 9M14 5v2M14 11v2M11 8h2M17 8h2M18.5 3.5l-1 1M18.5 12.5l-1-1',
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8 5.5v13M16 5.5v13',
  camera: 'M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4zM12 13.5m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 12m-2.8 0a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0',
  stepBack: 'M15 6l-6 6 6 6',
  stepFwd: 'M9 6l6 6-6 6',
  skipBack: 'M12 6l-6 6 6 6M19 6l-6 6 6 6',
  skipFwd: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  globe: 'M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17',
  text: 'M5 6V4.5h14V6M12 4.5v15M9 19.5h6',
  stop: 'M6.5 6.5h11v11h-11z',
  smile: 'M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2M9 9.8h.01M15 9.8h.01',
  pipette: 'M14 6l4 4M5 19l1-4 8.5-8.5 3 3L9 18zM13 4.5l2-2 4.5 4.5-2 2',
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & JSX.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
