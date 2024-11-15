import { Command, Flags } from '@oclif/core'
import jetpack from 'fs-jetpack'

export default class Undo extends Command {
	static override description = 'Undo last command.'

	static override flags = {
		// flag with no value (-f, --force)
		force: Flags.boolean({ char: 'f' }),
		// flag with a value (-n, --name=VALUE)
		name: Flags.string({ char: 'n', description: 'name to print' }),
	}

	public async run(): Promise<void> {
		// const { args, flags } = await this.parse(Undo)

		const bangsDir = `bangs`
		const historyDir = `bangs.history`

		const existsBangsHistory = jetpack.exists(historyDir)
		if (!existsBangsHistory) {
			this.error(`Directory ${historyDir} does not exist.`, { exit: 1 })
		}

		if (existsBangsHistory !== 'dir') {
			this.error(`${historyDir} is not a folder.`, { exit: 1 })
		}

		const listBangsHistory = jetpack.list(historyDir)
		if (!listBangsHistory?.length) {
			this.error(`${historyDir} is empty`, { exit: 1 })
		}

		// console.log(listBangsHistory)

		// eslint-disable-next-line no-warning-comments
		// TODO: confirm files in `after` folder match files in `bangs` folder

		const cwdLastHistoryItem = jetpack.cwd(`${historyDir}/${listBangsHistory.at(-1)}`)
		const cwdLastHistoryItemBefore = cwdLastHistoryItem.cwd('before')

		jetpack.remove(bangsDir)
		const cwdBangs = jetpack.dir(bangsDir)
		jetpack.copy(cwdLastHistoryItemBefore.path(), cwdBangs.path(), { overwrite: true })

		jetpack.remove(cwdLastHistoryItem.path())
	}
}
