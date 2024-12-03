import { Args, Command, Flags } from '@oclif/core'
import jetpack from 'fs-jetpack'
import _ from 'lodash'

import { Zbang, doWithHistory, normalizeUrlTemplate } from '../lib.js'

const ddgrCounts: Record<number, { count: number; ddgr: number; rank?: number }> = {}

function process(zbangs: Zbang[]) {
	const results = _.chain(zbangs)
		.map((bang) => {
			const url = bang.urls.s.replaceAll('%s', '{s}')
			try {
				const result = {
					...bang,
					nurl: normalizeUrlTemplate(url).replaceAll('{s}', '%s'),
				}
				return result
			} catch {
				console.log(url)
			}

			return bang
		})
		.groupBy('nurl')
		.map((sources) => {
			function getRanks(path: string) {
				const result = _.chain(sources)
					// eslint-disable-next-line unicorn/no-array-reduce
					.reduce((result, bang) => {
						const mapKey = (_.get(bang, path) as string) || ''

						const mapKeyLowerCase = mapKey.toLocaleLowerCase()

						if (!_.isEqual(mapKey, '')) {
							if (!result.has(mapKeyLowerCase)) {
								result.set(mapKeyLowerCase, [])
							}

							result.get(mapKeyLowerCase).push([bang.rank, mapKey])
						}

						return result
					}, new Map())
					.value()
				return result
			}

			const ddgr = _.max(_.map(sources, 'ddgr')) as number

			// Get summary, prefer from rated bangs, longer titles.
			const name = _.chain(sources)
				.orderBy(['ddgr', ({ name }) => name.length], ['desc', 'desc'])
				.head()
				.get('name')
				.value()

			const summaryRanks = getRanks('name')
			const labelRanks = getRanks('tags.0')

			// eslint-disable-next-line arrow-body-style
			const summaries = [...summaryRanks.values()].map((value) => {
				return value[0]?.[1]
			})

			_.each(summaries, (summary) => {
				if (summary !== name) {
					const key = `AKA/${summary}`
					const keyLowerCase = key.toLocaleLowerCase()
					labelRanks.set(keyLowerCase, [[-1, key]])
				}
			})

			// eslint-disable-next-line arrow-body-style
			const labels = [...labelRanks.values()].map((value) => {
				return `#${value[0]?.[1]}`.replaceAll(' ', '-')
			})

			// Get shortest url, preferring https.
			const shortestUrl = _.chain(sources)
				.map('urls.s')
				.sortBy([(u) => !u.startsWith('https'), 'length'])
				.head()
				.value()
			// .replaceAll('{{{s}}}', queryPlaceholder)

			// Get shortest trigger; higher r breaks ties.
			const tShort = _.chain(sources)
				.orderBy([({ code }) => code[0].length, 'ddgr'], ['asc', 'desc'])
				.head()
				.get('code')
				.value()[0]

			// Get longest trigger; higher r breaks ties.
			const tlong = _.chain(sources)
				.orderBy([({ code }) => code[0].length, 'ddgr'], ['desc', 'desc'])
				.head()
				.get('code')
				.value()[0]

			// Make list of triggers with shortest and longest first.
			// eslint-disable-next-line unicorn/prefer-spread
			const code = _.uniq(_.concat(tShort, tlong, _.map(sources, 'code.0')))

			// eslint-disable-next-line perfectionist/sort-objects
			ddgrCounts[ddgr] = ddgrCounts[ddgr] || { ddgr, count: 0 }
			ddgrCounts[ddgr].count++

			return {
				// nurl: sources[0].nurl,
				ddgr,
				name,
				// eslint-disable-next-line perfectionist/sort-objects
				code,
				tags: labels,
				urls: {
					s: shortestUrl,
				},
				// d,
				// summaries,
				// summaryRanks: Object.fromEntries(summaryRanks),
				// urlRanks: Object.fromEntries(urlRanks),
				// triggerRanks: Object.fromEntries(triggerRanks),
				// labelRanks: Object.fromEntries(labelRanks),
				// sources,
			}
		})
		.value()

	let rank = 1
	for (const item of _.orderBy(ddgrCounts, ['ddgr'], ['desc'])) {
		ddgrCounts[item.ddgr].rank = rank
		rank += item.count
	}

	const resultsWithRanks = _.chain(results)
		.orderBy(['ddgr'], ['desc'])
		.map((bang) => ({
			rank: ddgrCounts[bang.ddgr]?.rank,
			...bang,
		}))

	return resultsWithRanks
}

export default class Deduplicate extends Command {
	static override args = {
		file: Args.string({ description: 'file to read' }),
	}

	static override description = 'Deduplicate bangs with same normalized URL.'

	static override flags = {
		// flag with no value (-f, --force)
		force: Flags.boolean({ char: 'f' }),
		// flag with a value (-n, --name=VALUE)
		name: Flags.string({ char: 'n', description: 'name to print' }),
	}

	public async run(): Promise<void> {
		const { flags } = await this.parse(Deduplicate)

		const inputDir = flags.inputDir ?? 'bangs'
		const outputDir = flags.outputDir ?? 'bangs'

		const cwdInput = jetpack.dir(inputDir)
		const cwdOutput = jetpack.dir(outputDir)

		const inputFilename = 'zbangs.json'
		const outputFilename = 'zbangs.json'

		const zbangs = cwdInput.read(inputFilename, 'json')

		const zbangsDeduplicated = process(zbangs)

		async function deduplicate() {
			const cwdToRemove = jetpack.dir(outputDir)
			cwdToRemove.remove()

			const cwdOutput = jetpack.dir(outputDir)
			jetpack.write(cwdOutput.path(outputFilename), zbangsDeduplicated)
		}

		doWithHistory(cwdOutput, deduplicate)
	}
}
