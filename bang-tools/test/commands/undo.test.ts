import { runCommand } from '@oclif/test'
import { expect } from 'chai'

describe('undo', () => {
	it('runs undo cmd', async () => {
		const { stdout } = await runCommand('undo')
		expect(stdout).to.contain('hello world')
	})

	it('runs undo --name oclif', async () => {
		const { stdout } = await runCommand('undo --name oclif')
		expect(stdout).to.contain('hello oclif')
	})
})
