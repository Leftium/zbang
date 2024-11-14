import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('download', () => {
  it('runs download cmd', async () => {
    const {stdout} = await runCommand('download')
    expect(stdout).to.contain('hello world')
  })

  it('runs download --name oclif', async () => {
    const {stdout} = await runCommand('download --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
