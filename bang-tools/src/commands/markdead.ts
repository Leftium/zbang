import { Command, Flags } from '@oclif/core'
import jetpack from 'fs-jetpack'
import _ from 'lodash'
import { doWithHistory } from '../lib.js'

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

		async function markdead() {
			const cwdToRemove = jetpack.dir(outputDir)
			cwdToRemove.remove()

			const cwdOutput = jetpack.dir(outputDir)
			jetpack.write(cwdOutput.path(outputFilename), zbangs)

			jetpack.write(cwdOutput.path(reportFilename), 'REPORT')
		}

		doWithHistory(cwdOutput, markdead)
	}
}
