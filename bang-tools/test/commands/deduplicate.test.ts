import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('deduplicate', () => {
  it('runs deduplicate cmd', async () => {
    const {stdout} = await runCommand('deduplicate')
    expect(stdout).to.contain('hello world')
  })

  it('runs deduplicate --name oclif', async () => {
    const {stdout} = await runCommand('deduplicate --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
