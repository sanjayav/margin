import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			accentblue: '#3B6FE0',
  			ink: {
  				'100': '#1C1812',
  				'200': '#2E2A22',
  				'300': '#4A4438',
  				'400': '#6C6454',
  				'500': '#8C8273',
  				'600': '#B3A892',
  				'700': '#DBD2BF',
  				'800': '#ECE4D4',
  				'850': '#FFFFFF',
  				'900': '#F4EEE1',
  				'950': '#FBF7EF'
  			},
  			brand: {
  				'400': '#F66864',
  				'600': '#C41730',
  				DEFAULT: '#E8223B'
  			},
  			safe: '#0E9F6E',
  			warn: '#D98005',
  			danger: '#E0484D',
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'Aptos',
  				'Geist',
  				'Inter',
  				'system-ui',
  				'-apple-system',
  				'sans-serif'
  			],
  			display: [
  				'Aptos',
  				'Geist',
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			],
  			mono: [
  				'"Geist Mono"',
  				'ui-monospace',
  				'SFMono-Regular',
  				'monospace'
  			]
  		},
  		boxShadow: {
  			glow: '0 0 0 1px rgba(242,81,14,0.25), 0 10px 30px -12px rgba(242,81,14,0.30)',
  			card: '0 1px 2px rgba(80,60,30,0.05), 0 14px 30px -18px rgba(120,90,50,0.25)'
  		},
  		keyframes: {
  			flip: {
  				'0%': {
  					transform: 'scale(0.96)',
  					opacity: '0.4'
  				},
  				'100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				}
  			},
  			slidein: {
  				'0%': {
  					transform: 'translateY(6px)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			flip: 'flip 220ms ease-out',
  			slidein: 'slidein 260ms ease-out',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
}
