import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('merge', () => {
  it('runs merge cmd', async () => {
    const {stdout} = await runCommand('merge')
    expect(stdout).to.contain('hello world')
  })

  it('runs merge --name oclif', async () => {
    const {stdout} = await runCommand('merge --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
