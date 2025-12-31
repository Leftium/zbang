import { createServer } from 'vite'
import { networkInterfaces, homedir } from 'os'
import { readFileSync } from 'fs'
import qrcode from 'qrcode-terminal'
import * as ngrok from '@ngrok/ngrok'

const PORT = 5173
const useNgrok = process.argv.includes('--ngrok')
const useHost = useNgrok || process.argv.includes('--host')

// Get local network IP
function getLocalIP() {
	const nets = networkInterfaces()
	for (const name of Object.keys(nets)) {
		for (const net of nets[name]) {
			if (net.family === 'IPv4' && !net.internal) {
				return net.address
			}
		}
	}
	return 'localhost'
}

// Show QR code for a URL (indented to align with Vite output)
function showQR(url, label) {
	if (label) {
		// Align with Vite's "Network:" label (7 chars + colon + space)
		const padded = (label + ':').padEnd(9)
		console.log(`  ➜  ${padded}${url}`)
	}
	qrcode.generate(url, { small: true }, (code) => {
		console.log(
			code
				.split('\n')
				.map((line) => '  ' + line)
				.join('\n')
		)
	})
}

// Track ngrok state
let ngrokUrl = null

// Get ngrok authtoken from env or config file
function getNgrokAuthtoken() {
	if (process.env.NGROK_AUTHTOKEN) return process.env.NGROK_AUTHTOKEN
	const configPaths = [
		`${homedir()}/.config/ngrok/ngrok.yml`,
		`${homedir()}/Library/Application Support/ngrok/ngrok.yml`,
	]
	for (const path of configPaths) {
		try {
			const content = readFileSync(path, 'utf-8')
			const match = content.match(/authtoken:\s*(\S+)/)
			if (match) return match[1]
		} catch {}
	}
	return null
}

// Start ngrok and return URL
async function startNgrok(port) {
	if (ngrokUrl) return ngrokUrl
	try {
		const authtoken = getNgrokAuthtoken()
		if (!authtoken) {
			console.error(
				'No ngrok authtoken found. Set NGROK_AUTHTOKEN or run: ngrok config add-authtoken <token>'
			)
			return null
		}
		const listener = await ngrok.forward({ addr: port, authtoken })
		ngrokUrl = listener.url()
		return ngrokUrl
	} catch (err) {
		console.error('Failed to start ngrok:', err.message || err)
		return null
	}
}

// Create and start Vite dev server
const server = await createServer({
	server: {
		host: useHost,
		port: PORT,
	},
})

await server.listen()
server.printUrls()

// Show QR code on startup if --host
if (useHost && !useNgrok) {
	const localIP = getLocalIP()
	const localUrl = `http://${localIP}:${server.config.server.port}`
	showQR(localUrl)
}

// Start ngrok if requested
if (useNgrok) {
	const url = await startNgrok(server.config.server.port)
	if (url) {
		showQR(url, 'Ngrok')
	}
}

// Build custom shortcuts based on mode
const customShortcuts = []

if (useHost) {
	customShortcuts.push({
		key: 'u',
		description: 'show server url + QR code',
		async action() {
			server.printUrls()
			if (ngrokUrl) {
				showQR(ngrokUrl, 'Ngrok')
			} else {
				const localIP = getLocalIP()
				const localUrl = `http://${localIP}:${server.config.server.port}`
				showQR(localUrl)
			}
		},
	})

	customShortcuts.push({
		key: 'n',
		description: 'start ngrok tunnel + QR code',
		async action() {
			const url = await startNgrok(server.config.server.port)
			if (url) {
				showQR(url, 'Ngrok')
			}
		},
	})
}

server.bindCLIShortcuts({
	print: true,
	customShortcuts,
})
