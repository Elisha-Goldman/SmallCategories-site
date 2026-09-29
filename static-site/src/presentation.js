import { completeFinitePresentation } from './presentation-completion.js'

// Paths are written in traversal order: "f g" means first f, then g.
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/

function fail(message) {
  throw new Error(message)
}

export function parsePresentation({ objects: objectText, generators: generatorText, relations: relationText }) {
  const objects = String(objectText).trim().split(/[\s,]+/).filter(Boolean)
  const objectIds = new Map()
  for (const name of objects) {
    if (!identifier.test(name) || objectIds.has(name)) fail(`Invalid or repeated object name: ${name}`)
    objectIds.set(name, objectIds.size)
  }

  const generators = []
  const generatorIds = new Map()
  for (const [lineNumber, line] of String(generatorText).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*->\s*([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(line)
    if (!match) fail(`Generator line ${lineNumber + 1}: use “f: x -> y”.`)
    const [, name, sourceName, targetName] = match
    if (name.startsWith('id_') || generatorIds.has(name)) fail(`Invalid or repeated generator name: ${name}`)
    if (!objectIds.has(sourceName) || !objectIds.has(targetName)) fail(`Generator ${name} uses an unknown object.`)
    generatorIds.set(name, generators.length)
    generators.push({ name, source: objectIds.get(sourceName), target: objectIds.get(targetName) })
  }

  function parsePath(text, lineNumber) {
    const tokens = text.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 1 && tokens[0].startsWith('id_')) {
      const object = objectIds.get(tokens[0].slice(3))
      if (object === undefined) fail(`Relation line ${lineNumber}: unknown identity ${tokens[0]}.`)
      return { word: [], source: object, target: object }
    }
    if (!tokens.length) fail(`Relation line ${lineNumber}: a path is missing.`)
    const word = tokens.map(token => {
      if (!generatorIds.has(token)) fail(`Relation line ${lineNumber}: unknown generator ${token}.`)
      return generatorIds.get(token)
    })
    for (let i = 1; i < word.length; i += 1) {
      if (generators[word[i - 1]].target !== generators[word[i]].source) {
        fail(`Relation line ${lineNumber}: ${tokens[i - 1]} and ${tokens[i]} do not compose.`)
      }
    }
    return { word, source: generators[word[0]].source, target: generators[word.at(-1)].target }
  }

  const relations = []
  for (const [lineNumber, line] of String(relationText).split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const parts = line.split('=')
    if (parts.length !== 2) fail(`Relation line ${lineNumber + 1}: use one “=”.`)
    const left = parsePath(parts[0], lineNumber + 1)
    const right = parsePath(parts[1], lineNumber + 1)
    if (left.source !== right.source || left.target !== right.target) {
      fail(`Relation line ${lineNumber + 1}: both paths must have the same source and target.`)
    }
    relations.push({ left, right })
  }
  return { objects, generators, relations }
}

export function completePresentation(presentation, options) {
  return completeFinitePresentation(presentation, options)
}

function endpoints(table, objects) {
  return table.map((_, morphism) => ({
    source: Array.from({ length: objects }, (_, index) => index).find(index => table[morphism][index] === morphism),
    target: Array.from({ length: objects }, (_, index) => index).find(index => table[index][morphism] === morphism),
  }))
}

function elementSignature(table, index) {
  const n = table.length
  const rowCounts = new Uint8Array(n + 1)
  const columnCounts = new Uint8Array(n + 1)
  let leftFixed = 0
  let rightFixed = 0
  let commuting = 0
  for (let other = 0; other < n; other += 1) {
    const rowValue = table[index][other]
    const columnValue = table[other][index]
    rowCounts[rowValue] += 1
    columnCounts[columnValue] += 1
    if (rowValue === index) leftFixed += 1
    if (columnValue === index) rightFixed += 1
    if (rowValue === columnValue) commuting += 1
  }
  const rowFrequencies = new Uint8Array(n + 1)
  const columnFrequencies = new Uint8Array(n + 1)
  for (let value = 0; value <= n; value += 1) {
    if (rowCounts[value]) rowFrequencies[rowCounts[value]] += 1
    if (columnCounts[value]) columnFrequencies[columnCounts[value]] += 1
  }
  let hash = 2166136261
  const add = value => { hash = Math.imul(hash ^ value, 16777619) }
  add(table[index][index] === index ? 1 : 0)
  add(leftFixed)
  add(rightFixed)
  add(commuting)
  for (let frequency = 1; frequency <= n; frequency += 1) {
    add(rowFrequencies[frequency])
    add(columnFrequencies[frequency])
  }
  return hash >>> 0
}

// Label-independent, cheap filter. Collisions are harmless: isomorphicTables
// checks each surviving candidate exactly.
export function tableSignature(table, objects) {
  const signatures = table.map((_, index) => elementSignature(table, index)).sort((a, b) => a - b)
  let hash = Math.imul(2166136261 ^ objects, 16777619)
  for (const signature of signatures) hash = Math.imul(hash ^ signature, 16777619)
  return hash >>> 0
}

export function isomorphismMapping(left, right, objects) {
  const n = left.length
  if (right.length !== n) return null
  const leftEnds = endpoints(left, objects)
  const rightEnds = endpoints(right, objects)
  const leftFeatures = left.map((_, index) => elementSignature(left, index))
  const rightFeatures = right.map((_, index) => elementSignature(right, index))
  const mapping = new Array(n).fill(-1)
  const reverse = new Array(n).fill(-1)

  function compatible(source, target) {
    if (leftFeatures[source] !== rightFeatures[target]) return false
    if ((source < objects) !== (target < objects)) return false
    const sourceEnd = leftEnds[source]
    const targetEnd = rightEnds[target]
    if (sourceEnd.source === undefined || sourceEnd.target === undefined || targetEnd.source === undefined || targetEnd.target === undefined) return false
    if (mapping[sourceEnd.source] !== -1 && mapping[sourceEnd.source] !== targetEnd.source) return false
    if (mapping[sourceEnd.target] !== -1 && mapping[sourceEnd.target] !== targetEnd.target) return false
    if (source >= objects && (mapping[sourceEnd.source] === -1 || mapping[sourceEnd.target] === -1)) return false
    for (let other = 0; other < n; other += 1) {
      if (mapping[other] === -1) continue
      for (const [a, b, x, y] of [[source, other, target, mapping[other]], [other, source, mapping[other], target]]) {
        const product = left[a][b]
        const candidate = right[x][y]
        if ((product === n) !== (candidate === n)) return false
        if (product < n && mapping[product] !== -1 && mapping[product] !== candidate) return false
        if (product < n && reverse[candidate] !== -1 && reverse[candidate] !== product) return false
      }
    }
    return true
  }

  function search(index) {
    if (index === n) {
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          if ((left[row][col] === n ? n : mapping[left[row][col]]) !== right[mapping[row]][mapping[col]]) return false
        }
      }
      return true
    }
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (reverse[candidate] !== -1 || !compatible(index, candidate)) continue
      mapping[index] = candidate
      reverse[candidate] = index
      if (search(index + 1)) return true
      mapping[index] = -1
      reverse[candidate] = -1
    }
    return false
  }
  return search(0) ? mapping : null
}

export function isomorphicTables(left, right, objects) {
  return isomorphismMapping(left, right, objects) !== null
}
