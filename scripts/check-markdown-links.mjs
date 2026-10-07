import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

async function markdownDocuments(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const documents = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) documents.push(...(await markdownDocuments(path)))
    else if (entry.isFile() && entry.name.endsWith('.md')) documents.push(path)
  }
  return documents
}

const documents = [
  resolve(root, 'README.md'),
  resolve(root, 'AGENTS.md'),
  ...(await markdownDocuments(resolve(root, 'docs/adr'))),
  ...(await markdownDocuments(resolve(root, 'docs/workflow'))),
  ...(await markdownDocuments(resolve(root, '.agents/skills'))),
]

function headingAnchors(markdown) {
  return new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
      heading
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-'),
    ),
  )
}

const failures = []
for (const document of documents) {
  const markdown = await readFile(document, 'utf8')
  const links = markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)
  for (const match of links) {
    const target = match[1]?.trim()
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue
    const [encodedPath = '', encodedAnchor] = target.split('#', 2)
    const path = decodeURIComponent(encodedPath)
    const linkedDocument = path ? resolve(dirname(document), path) : document
    try {
      await access(linkedDocument, constants.R_OK)
      if (encodedAnchor && linkedDocument.endsWith('.md')) {
        const linkedMarkdown =
          linkedDocument === document ? markdown : await readFile(linkedDocument, 'utf8')
        const anchor = decodeURIComponent(encodedAnchor).toLowerCase()
        if (!headingAnchors(linkedMarkdown).has(anchor)) throw new Error('Missing heading anchor')
      }
    } catch {
      failures.push(`${relative(root, document)} -> ${target}`)
    }
  }
}

if (failures.length) {
  throw new Error(`Broken local Markdown links:\n${failures.join('\n')}`)
}

console.log(`Checked local Markdown links in ${documents.length} reviewer-facing documents.`)
