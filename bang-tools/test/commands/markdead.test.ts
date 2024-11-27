import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('markdead', () => {
  it('runs markdead cmd', async () => {
    const {stdout} = await runCommand('markdead')
    expect(stdout).to.contain('hello world')
  })

  it('runs markdead --name oclif', async () => {
    const {stdout} = await runCommand('markdead --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
