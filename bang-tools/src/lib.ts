import dayjs from 'dayjs'
import jetpack from 'fs-jetpack'
import { FSJetpack } from 'fs-jetpack/types.js'

export async function doWithHistory(
	cwdOutput: FSJetpack,
	callback: { (): Promise<void>; (): unknown }
) {
	const datestamp = dayjs().format('YYYY.MM.DD__HH.mm__ss.SSS')
	const historyFolderName = `bangs.history/${datestamp}-${callback.name}`
	const cwdBefore = jetpack.dir(`${historyFolderName}/before`)
	const cwdAfter = jetpack.dir(`${historyFolderName}/after`)

	jetpack.copy(cwdOutput.path(), cwdBefore.path(), { overwrite: true })
	await callback()
	jetpack.copy(cwdOutput.path(), cwdAfter.path(), { overwrite: true })
}
