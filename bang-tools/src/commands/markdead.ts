import { Command, Flags } from '@oclif/core'
import jetpack from 'fs-jetpack'
import _ from 'lodash'
import util from 'node:util'

import { WithHttpStatus, Zbang, doWithHistory } from '../lib.js'

async function process(zbangs: Zbang[]) {
	const numBangs = zbangs.length

	// Make a copy
	const processedBangs: (WithHttpStatus & Zbang)[] = [...zbangs]

	// Make a queue of array indices to process
	const zbangIndexQueue = [...processedBangs.keys()]

	const numConsumers = Math.min(16, zbangIndexQueue.length)

	let numDone = 0

	async function taskConsumer(id: number) {
		while (zbangIndexQueue.length > 0) {
			const index = zbangIndexQueue.pop()

			console.log('TaskConsumer:%d, zbang:%d', id, index)
			if (numDone % 10 === 0) {
				console.log('%s%% (%d/%d)', ((100 * numDone) / numBangs).toFixed(2), numDone, numBangs)
			}

			if (index !== undefined) {
				const bang: WithHttpStatus & Zbang = zbangs[index]
				const url = bang.urls.s.replaceAll('%s', 'test')

				let { status } = bang
				let { statusText } = bang

				// eslint-disable-next-line unicorn/consistent-destructuring
				if (bang.urls.s.includes('http://bang-provider')) {
					status = 0
					statusText = 'skipped'
				}

				if (bang.status === undefined) {
					try {
						// eslint-disable-next-line no-await-in-loop
						const fetched = await fetch(url, { method: 'HEAD' })

						status = fetched.status
						statusText = fetched.statusText
					} catch (error_: unknown) {
						const error = error_ as Error
						status = 900
						const causeText = util.format(error.cause).split('\n')[0]
						statusText = causeText || error.message
					}
				}

				/*
				report('%s', bang.code.join(' '))
				report('- {%d} [%s](%s)', bang.rank, bang.name, url)
				report('- status: %d (%s)\n', status, statusText)
                */

				processedBangs[index] = {
					...bang,
					status,
					statusText,
				}
				numDone++
			}
		}
	}

	// Wait for all task consumers to finish.
	await Promise.all([...Array.from({ length: numConsumers }).keys()].map((i) => taskConsumer(i)))

	return processedBangs
}

function statusClass(status: number | undefined) {
	if (status !== undefined) {
		if (status === 404) {
			return '404: Missing'
		}

		if (status === 900) {
			return '900: Fetch error'
		}

		if (status === 0) {
			return '000: Skipped'
		}

		if (status >= 200 && status < 300) {
			return '2xx: Success'
		}

		if (status >= 300 && status < 400) {
			return '3xx: Redirect'
		}

		if (status >= 400 && status < 500) {
			return '4xx: Client Error'
		}

		if (status >= 500 && status < 600) {
			return '5xx: Server Error'
		}
	}

	return '???: ETC'
}

function generateReport(zbangs: (WithHttpStatus & Zbang)[]) {
	const groupedByStatus = _.groupBy(zbangs, (z) => statusClass(z.status))

	function list(statusClass: string) {
		return (
			`# ${statusClass}\n\n` +
			_.map(
				groupedByStatus[statusClass],
				(bang) =>
					`${bang.code.join(' ')}\n` +
					`- {${bang.rank}} [${bang.name}](${bang.urls.s.replaceAll('%s', 'test')})\n` +
					`- status: ${bang.status} (${bang.statusText})\n`
			).join('\n') +
			'\n\n'
		)
	}

	const report =
		list('404: Missing') +
		list('900: Fetch error') +
		list('4xx: Client Error') +
		list('5xx: Server Error') +
		list('3xx: Redirect') +
		list('2xx: Success') +
		list('000: Skipped')

	return report
}

export default class Markdead extends Command {
	static override description =
		'Mark bangs with URLs that return non 200 HTTP status and generate report.'

	static override flags = {
		// flag with no value (-f, --force)
		force: Flags.boolean({ char: 'f' }),
		// flag with a value (-n, --name=VALUE)
		name: Flags.string({ char: 'n', description: 'name to print' }),
	}

	public async run(): Promise<void> {
		const { flags } = await this.parse(Markdead)

		const inputDir = flags.inputDir ?? 'bangs'
		const outputDir = flags.outputDir ?? 'bangs'

		const cwdInput = jetpack.dir(inputDir)
		const cwdOutput = jetpack.dir(outputDir)

		const inputFilename = 'zbangs.json'
		const outputFilename = 'zbangs.json'
		const reportFilename = 'dead-bangs.md'

		const zbangs = cwdInput.read(inputFilename, 'json')

		const zbangsMarked = await process(zbangs)

		const report = generateReport(zbangsMarked)

		async function markdead() {
			const cwdToRemove = jetpack.dir(outputDir)
			cwdToRemove.remove()

			const cwdOutput = jetpack.dir(outputDir)
			jetpack.write(cwdOutput.path(outputFilename), zbangsMarked)

			jetpack.write(cwdOutput.path(reportFilename), report)
		}

		doWithHistory(cwdOutput, markdead)
	}
}
