import { Command, Flags } from '@oclif/core'
import { distance } from 'fastest-levenshtein'
import jetpack from 'fs-jetpack'
import _ from 'lodash'

import { doWithHistory, getDomain, normalizeUrlTemplate } from '../lib.js'

export default class Merge extends Command {
	static override description = 'Merge downloaded bangs files into zbang.json'

	static override flags = {
		// flag with a value (-n, --name=VALUE)
		outputDir: Flags.string({ char: 'o', description: 'output directory' }),
	}

	public async run(): Promise<void> {
		const { flags } = await this.parse(Merge)

		const inputDir = flags.inputDir ?? 'bangs'
		const outputDir = flags.outputDir ?? 'bangs'
		this.log(`input directory: ${inputDir}`)
		this.log(`output directory: ${outputDir}`)

		const cwdInput = jetpack.dir(inputDir)
		const cwdOutput = jetpack.dir(outputDir)

		const ddgBangsFilename = 'duckduckgo_bangs.json'
		const outputFilename = 'zbangs.json'

		const bangFilenames = new Set(cwdInput.list()?.filter((f) => f.endsWith('.json')))
		bangFilenames.delete(outputFilename)
		bangFilenames.delete(ddgBangsFilename)

		const ddgBangs = cwdInput.read(ddgBangsFilename, 'json')

		// Make map of triggers to url/ranks
		const triggerToRankAndUrl = _.reduce(
			ddgBangs,
			(result, bang) => {
				result[bang.t] = {
					ddgr: bang.r,
					uurl: bang.u,
				}

				const nurl = normalizeUrlTemplate(bang.u, { stripWWW: true })
				if (nurl !== bang.u) {
					result[bang.t].nurl = nurl
				}

				return result
			},
			{} as Record<string, (typeof ddgBangs)[0]>
		)

		// eslint-disable-next-line perfectionist/sort-object-types
		const ddgrCounts: Record<number, { ddgr: number; count: number; rank?: number }> = {}

		const kagiBangs = _.reduce(
			[...bangFilenames],
			(result, filename) => {
				const bangs = _.map(cwdInput.read(filename, 'json'), (bang) => {
					const code = [`!${bang.t}`]
					const name = bang.s
					const tags: string[] = bang.c && bang.sc ? [`${bang.c}/${bang.sc}`] : []
					const urls = { s: normalizeUrlTemplate(bang.u, { keepCase: true }) }
					let ddgr = 1
					const rank = -1

					const bangWithCode = triggerToRankAndUrl[bang.t]
					const domainFromDuck = bangWithCode
						? getDomain(normalizeUrlTemplate(bangWithCode.uurl, { stripWWW: true }))
						: 'NA'
					const domainFromKagi = getDomain(normalizeUrlTemplate(bang.u, { stripWWW: true }))

					const domainDistance = distance(domainFromDuck, domainFromKagi)
					const domainLength = domainFromKagi.length

					if (!bang.u.match('{{{s}}}')) {
						console.log(`No query: ${bang.u}`)
					}

					if (bangWithCode) {
						if (
							domainFromDuck !== domainFromKagi &&
							domainFromKagi !== 'bang-provider' &&
							bangWithCode.ddgr > 1 &&
							domainDistance / domainLength > 0.7
						) {
							console.log({
								trigger: bang.t,
								// eslint-disable-next-line perfectionist/sort-objects
								ddgr: bangWithCode.ddgr,
								domainFromDuck,
								domainFromKagi,
								// eslint-disable-next-line perfectionist/sort-objects
								domainDistance,
								domainLength,
								urlFromDuck: bangWithCode.uurl,
								urlFromKagi: bang.u,
							})
							ddgr = 2
						} else {
							ddgr = bangWithCode.ddgr
						}
					}

					// eslint-disable-next-line perfectionist/sort-objects
					ddgrCounts[ddgr] = ddgrCounts[ddgr] || { ddgr, count: 0 }
					ddgrCounts[ddgr].count++

					// eslint-disable-next-line perfectionist/sort-objects
					return { code, rank, ddgr, name, tags, urls }
				})
				return [...result, ...bangs]
			},
			[] as { ddgr: number }[]
		)

		let rank = 1
		for (const item of _.orderBy(ddgrCounts, ['ddgr'], ['desc'])) {
			ddgrCounts[item.ddgr].rank = rank
			rank += item.count
		}

		const zbangs = _.chain(kagiBangs)
			.orderBy(['ddgr'], ['desc'])
			.map((bang) => ({
				...bang,
				rank: ddgrCounts[bang.ddgr]?.rank,
			}))

		async function mergeIntoZbangJson() {
			const cwdToRemove = jetpack.dir(outputDir)
			cwdToRemove.remove()

			const cwdOutput = jetpack.dir(outputDir)
			jetpack.write(cwdOutput.path(outputFilename), zbangs)
		}

		doWithHistory(cwdOutput, mergeIntoZbangJson)
	}
}
