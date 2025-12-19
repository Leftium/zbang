import { Command, Flags } from '@oclif/core'
import jetpack from 'fs-jetpack'

import { doWithHistory } from '../lib.js'

export default class Download extends Command {
	static override description = 'Download bang files.'

	static override flags = {
		// flag with a value (-n, --name=VALUE)
		outputDir: Flags.string({ char: 'o', description: 'output directory' }),
	}

	public async run(): Promise<void> {
		const { flags } = await this.parse(Download)

		const outputDir = flags.outputDir ?? 'bangs'
		this.log(`output directory: ${outputDir}`)

		const cwdOutput = jetpack.dir(outputDir)

		async function downloadBangFiles() {
		const urls = [
			'https://duckduckgo.com/bang.js',
			'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/bangs.json',
			'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/kagi_bangs.json',
		]

			const filenames = urls.map((url) => url.split('/').at(-1))
			filenames[0] = 'duckduckgo_bangs.json'

			const fetchedAll = await Promise.all(urls.map((url) => fetch(url)))
			const jsoneddAll = await Promise.all(fetchedAll.map((fetched) => fetched.json()))

			for (const [index, jsoned] of jsoneddAll.entries()) {
				jetpack.write(cwdOutput.path(filenames[index] || 'filename.json'), jsoned)
			}
		}

		doWithHistory(cwdOutput, downloadBangFiles)
	}
}
