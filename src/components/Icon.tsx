// Lightweight stroke-SVG icon set (currentColor, 24-grid). No emoji anywhere.
type Props = { name: IconName; size?: number; className?: string; strokeWidth?: number }

export type IconName =
  | 'gauge' | 'scatter' | 'building' | 'target' | 'trending' | 'activity' | 'settings'
  | 'leaf' | 'bolt' | 'feather' | 'handshake' | 'scissors' | 'card'
  | 'alert' | 'link' | 'scale' | 'section' | 'database'
  | 'search' | 'arrow-right' | 'arrow-up' | 'check' | 'close' | 'reset' | 'chevron'
  | 'shield' | 'layers' | 'sliders' | 'user' | 'clock' | 'spark' | 'dot'

const P: Record<IconName, string> = {
  gauge: 'M12 14l3-3M5 19a9 9 0 1 1 14 0M12 14a1 1 0 1 0 0 0',
  scatter: 'M4 4v16h16M8 16a1 1 0 1 0 0-.01M12 11a1 1 0 1 0 0-.01M16 13a1 1 0 1 0 0-.01M18 8a1 1 0 1 0 0-.01',
  building: 'M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M19 21v-9a1 1 0 0 0-1-1h-3M8 8h2M8 12h2M8 16h2',
  target: 'M12 12a3 3 0 1 0 0 .01M12 12a9 9 0 1 0 0 .01M12 3v3M12 18v3M3 12h3M18 12h3',
  trending: 'M3 17l6-6 4 4 8-8M21 7h-5M21 7v5',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  leaf: 'M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 9-4 13-9 13zM4 20c2-4 5-7 9-9',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  feather: 'M20 4a6 6 0 0 0-8 0l-7 7v5h5l7-7a6 6 0 0 0 3-5zM16 8L2 22M9 15h6',
  handshake: 'M8 13l2 2a1.5 1.5 0 0 0 2 0l3-3 4 3M3 8l4-3 5 4M21 8l-4-3-3 2M3 8v6l3 3M21 8v6l-3 3',
  scissors: 'M6 6a2 2 0 1 0 0 .01M6 18a2 2 0 1 0 0 .01M20 4L8.5 15.5M14.5 9.5L20 20M8 8l8 8',
  card: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 15h4',
  alert: 'M12 3l9 16H3zM12 10v4M12 17v.01',
  link: 'M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1',
  scale: 'M12 3v18M7 21h10M12 6l-6 2 3 6a3 3 0 0 1-6 0l3-6M12 6l6 2-3 6a3 3 0 0 0 6 0l-3-6',
  section: 'M5 3h11l4 4v14a0 0 0 0 1 0 0H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM15 3v5h5M8 13h8M8 17h6',
  database: 'M12 3c4.5 0 8 1.3 8 3s-3.5 3-8 3-8-1.3-8-3 3.5-3 8-3zM4 6v12c0 1.7 3.5 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.5 3 8 3s8-1.3 8-3',
  search: 'M11 11a5 5 0 1 0 0-.01M21 21l-6.5-6.5',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  check: 'M20 6L9 17l-5-5',
  close: 'M6 6l12 12M18 6L6 18',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4',
  chevron: 'M9 6l6 6-6 6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  sliders: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4M14 4v4M6 10v4M12 16v4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  dot: 'M12 12a1 1 0 1 0 0 .01',
}

const FILLED: Partial<Record<IconName, boolean>> = { dot: true }

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.6 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={FILLED[name] ? 'currentColor' : 'none'}
      stroke={FILLED[name] ? 'none' : 'currentColor'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  )
}
