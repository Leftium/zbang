import {Command, Flags} from '@oclif/core'
import jetpack from 'fs-jetpack'

const urls = [
  'https://duckduckgo.com/bang.js',
  'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/bangs.json',
  'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/kagi_bangs.json',
  'https://github.com/kagisearch/bangs/raw/refs/heads/main/data/assistant_bangs.json',
]

const filenames = urls.map((url) => url.split('/').at(-1))
filenames[0] = 'duckduckgo_bangs.json'

export default class Download extends Command {
  static override description = 'Download bang files.'

  static override flags = {
    // flag with a value (-n, --name=VALUE)
    outputDir: Flags.string({char: 'o', description: 'output directory'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Download)

    const outputDir = flags.outputDir ?? 'bangs'
    this.log(`output directory: ${outputDir}`)

    const fetchedAll = await Promise.all(urls.map((url) => fetch(url)))
    const textedAll = await Promise.all(fetchedAll.map((fetched) => fetched.text()))

    for (const [index, texted] of textedAll.entries()) {
      jetpack.write(`${outputDir}/${filenames[index]}`, texted)
    }
  }
}
